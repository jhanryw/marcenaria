"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ContractError, getContract, saveContractDraft } from "@/db/contracts";
import type { Contract, ContractContent } from "@/domain/schema";

export type ContractSaveState = "idle" | "saving" | "saved" | "error";

/**
 * Carrega um contrato e salva automaticamente o RASCUNHO (debounce). Contratos emitidos/assinados/cancelados
 * são somente leitura: `update` não faz nada para eles.
 */
export function useContractEditor(id: string | null) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");
  const [saveState, setSaveState] = useState<ContractSaveState>("idle");

  const latest = useRef<Contract | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const errored = useRef(false);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    for (;;) {
      if (saving.current) await saving.current;
      if (!dirty.current || !latest.current) return;
      dirty.current = false;
      setSaveState("saving");
      const snap = latest.current;
      saving.current = saveContractDraft(snap.id, snap.content)
        .then((saved) => {
          errored.current = false;
          if (latest.current?.id === saved.id) {
            latest.current = { ...latest.current, updatedAt: saved.updatedAt };
            setContract((cur) => (cur ? { ...cur, updatedAt: saved.updatedAt } : cur));
          }
          setSaveState(dirty.current ? "saving" : "saved");
        })
        .catch((e) => {
          errored.current = true;
          dirty.current = !(e instanceof ContractError && e.code === "locked");
          setSaveState("error");
        })
        .finally(() => {
          saving.current = null;
        });
      await saving.current;
      if (!dirty.current || errored.current) return;
    }
  }, []);

  const load = useCallback(async () => {
    if (!id) {
      setStatus("notfound");
      return;
    }
    const c = await getContract(id);
    if (!c) {
      setStatus("notfound");
      return;
    }
    latest.current = c;
    dirty.current = false;
    setContract(c);
    setStatus("ready");
  }, [id]);

  useEffect(() => {
    latest.current = null;
    dirty.current = false;
    setContract(null);
    setStatus("loading");
    void load();
    return () => {
      void flush();
    };
  }, [id, load, flush]);

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && void flush();
    const onPageHide = () => void flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [flush]);

  const update = useCallback(
    (fn: (c: ContractContent) => ContractContent) => {
      const cur = latest.current;
      if (!cur || cur.status !== "rascunho") return;
      const next = fn(cur.content);
      if (next === cur.content) return;
      latest.current = { ...cur, content: next };
      dirty.current = true;
      setContract(latest.current);
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 250);
    },
    [flush],
  );

  /** Grava o que estiver pendente e recarrega do banco (após emitir, assinar, cancelar...). */
  const reload = useCallback(async () => {
    await flush();
    await load();
  }, [flush, load]);

  return { contract, status, saveState, update, flush, reload };
}
