"use client";
import * as React from "react";
import { ensureSeeded } from "@/db/seed";
import { ConfirmProvider } from "./ui/confirm";
import { ToastProvider } from "./ui/toast";
import { PwaProvider } from "./pwa-provider";
import { AppShell } from "./app-shell";

/** Pede ao navegador armazenamento persistente (reduz o risco de limpeza automática). */
async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* sem suporte */
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    ensureSeeded()
      .catch((e) => console.error("Falha ao inicializar o banco local", e))
      .finally(() => void requestPersistence());
  }, []);

  return (
    <PwaProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AppShell>{children}</AppShell>
        </ConfirmProvider>
      </ToastProvider>
    </PwaProvider>
  );
}
