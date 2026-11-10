"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, House, Layers, RefreshCw, Settings, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePwa } from "./pwa-provider";
import { Button } from "./ui/button";

const NAV = [
  { href: "/", label: "Início", icon: House, match: (p: string) => p === "/" },
  { href: "/projetos/", label: "Projetos", icon: FolderOpen, match: (p: string) => p.startsWith("/projeto") || p.startsWith("/contrato") },
  { href: "/materiais/", label: "Materiais", icon: Layers, match: (p: string) => p.startsWith("/materiais") },
  { href: "/configuracoes/", label: "Configurações", icon: Settings, match: (p: string) => p.startsWith("/configuracoes") },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const { updateReady, applyUpdate, online } = usePwa();

  return (
    <div className="flex min-h-dvh">
      {/* Barra lateral (tablet/desktop) */}
      <aside className="safe-top hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="sticky top-0 flex h-dvh flex-col p-4">
          <Link href="/" className="mb-6 flex items-center gap-3 px-2 py-2">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Layers className="size-5" />
            </span>
            <span className="text-lg font-bold leading-tight text-primary">Marcenaria<br /><span className="text-xs font-medium text-muted-foreground">orçamentos</span></span>
          </Link>
          <nav className="flex flex-col gap-1" aria-label="Principal">
            {NAV.map(({ href, label, icon: Icon, match }) => {
              const active = match(pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-xl px-3 text-base font-semibold transition-colors",
                    active ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="size-5" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {!online && (
          <div className="safe-top flex items-center justify-center gap-2 bg-foreground px-4 py-1.5 text-xs font-medium text-white">
            <WifiOff className="size-3.5" /> Sem internet — tudo continua funcionando e salvo neste aparelho
          </div>
        )}
        {updateReady && (
          <div className="safe-top flex flex-wrap items-center justify-between gap-2 bg-primary px-4 py-2 text-sm text-primary-foreground">
            <span className="flex items-center gap-2 font-medium">
              <RefreshCw className="size-4" /> Nova versão do aplicativo disponível
            </span>
            <Button size="sm" variant="secondary" onClick={applyUpdate}>
              Atualizar agora
            </Button>
          </div>
        )}
        <main className="safe-x flex-1 pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+16px)] md:pb-8">{children}</main>
      </div>

      {/* Navegação inferior fixa (celular) */}
      <nav
        aria-label="Principal"
        className="safe-bottom safe-x fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-4" style={{ height: "var(--nav-h)" }}>
          {NAV.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span className={cn("flex h-7 w-14 items-center justify-center rounded-full transition-colors", active && "bg-secondary")}>
                    <Icon className="size-[22px]" />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
