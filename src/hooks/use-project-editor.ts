"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getProject, saveProject } from "@/db/repository";
import type { Project } from "@/domain/schema";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Carrega um projeto, devolve o estado editável e salva automaticamente
 * (com debounce) a cada alteração. Também força o salvamento ao sair da aba.
 */
export function useProjectEditor(id: string | null) {
  const [project, setProjectState] = useState<Project | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound">("loading");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const latest = useRef<Project | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const saveErrored = useRef(false);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // repete enquanto houver alterações pendentes (edições feitas durante um salvamento)
    for (;;) {
      if (saving.current) await saving.current;
      if (!dirty.current || !latest.current) return;
      dirty.current = false;
      setSaveState("saving");
      const toSave = latest.current;
      saving.current = saveProject(toSave)
        .then((saved) => {
          // só atualiza updatedAt local; não sobrescreve edições feitas durante o save
          if (latest.current && latest.current.id === saved.id) {
            latest.current = { ...latest.current, updatedAt: saved.updatedAt };
            setProjectState((cur) => (cur ? { ...cur, updatedAt: saved.updatedAt } : cur));
          }
          saveErrored.current = false;
          setSaveState(dirty.current ? "saving" : "saved");
        })
        .catch(() => {
          dirty.current = true;
          saveErrored.current = true;
          setSaveState("error");
        })
        .finally(() => {
          saving.current = null;
        });
      await saving.current;
      if (!dirty.current || saveErrored.current) return;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    latest.current = null;
    dirty.current = false;
    setProjectState(null);
    if (!id) {
      setStatus("notfound");
      return;
    }
    setStatus("loading");
    getProject(id).then((p) => {
      if (cancelled) return;
      if (!p) {
        setStatus("notfound");
        return;
      }
      latest.current = p;
      setProjectState(p);
      setStatus("ready");
    });
    return () => {
      cancelled = true;
      void flush();
    };
  }, [id, flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onPageHide = () => void flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [flush]);

  const update = useCallback(
    (updater: (p: Project) => Project) => {
      const cur = latest.current;
      if (!cur) return;
      const next = updater(cur);
      if (next === cur) return;
      latest.current = next;
      dirty.current = true;
      setProjectState(next);
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 250);
    },
    [flush],
  );

  return { project, status, saveState, update, flush };
}
