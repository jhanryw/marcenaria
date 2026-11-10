"use client";
import * as React from "react";
import { BASE_PATH } from "@/lib/pwa";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  /** Há uma versão nova baixada, aguardando o usuário aplicar */
  updateReady: boolean;
  applyUpdate: () => void;
  canInstall: boolean;
  promptInstall: () => Promise<void>;
  isStandalone: boolean;
  isIOS: boolean;
  online: boolean;
  /** Service worker ativo = app já funciona offline */
  offlineReady: boolean;
}

const PwaContext = React.createContext<PwaState>({
  updateReady: false,
  applyUpdate: () => {},
  canInstall: false,
  promptInstall: async () => {},
  isStandalone: false,
  isIOS: false,
  online: true,
  offlineReady: false,
});
export const usePwa = () => React.useContext(PwaContext);

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [waiting, setWaiting] = React.useState<ServiceWorker | null>(null);
  const [installEvent, setInstallEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [online, setOnline] = React.useState(true);
  const [offlineReady, setOfflineReady] = React.useState(false);
  const [env, setEnv] = React.useState({ isStandalone: false, isIOS: false });

  React.useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setEnv({ isIOS, isStandalone });
    setOnline(navigator.onLine);

    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);

    const onBip = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("appinstalled", onInstalled);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      // Só recarrega quando uma ATUALIZAÇÃO assume o controle (já havia um service worker).
      // Na primeira instalação o controle muda de "nenhum" para o SW e não há nada a recarregar.
      const hadController = !!navigator.serviceWorker.controller;
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadController || refreshing) return;
        refreshing = true;
        window.location.reload();
      });

      navigator.serviceWorker
        .register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` })
        .then((reg) => {
          if (reg.active) setOfflineReady(true);
          if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
          reg.addEventListener("updatefound", () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener("statechange", () => {
              if (nw.state === "installed") {
                if (navigator.serviceWorker.controller) setWaiting(nw);
                else setOfflineReady(true); // primeira instalação concluída
              }
            });
          });
          // verifica atualização periodicamente e ao voltar para o app
          const check = () => reg.update().catch(() => {});
          const iv = setInterval(check, 60 * 60 * 1000);
          document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
          return () => clearInterval(iv);
        })
        .catch(() => {});
      navigator.serviceWorker.ready.then(() => setOfflineReady(true)).catch(() => {});
    }

    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const value = React.useMemo<PwaState>(
    () => ({
      updateReady: waiting !== null,
      applyUpdate: () => waiting?.postMessage({ type: "SKIP_WAITING" }),
      canInstall: installEvent !== null,
      promptInstall: async () => {
        if (!installEvent) return;
        await installEvent.prompt();
        await installEvent.userChoice;
        setInstallEvent(null);
      },
      online,
      offlineReady,
      ...env,
    }),
    [waiting, installEvent, online, offlineReady, env],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}
