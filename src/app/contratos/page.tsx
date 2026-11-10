"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { FileText, Plus, Search, Trash2 } from "lucide-react";
import { getDb } from "@/db/db";
import { createContractFromProject, deleteContract, isSuperseded } from "@/db/contracts";
import { formatContractNumber } from "@/contracts/build-contract";
import { CONTRACT_STATUSES, CONTRACT_STATUS_LABELS, type Contract, type ContractStatus } from "@/domain/schema";
import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/format-date";
import { PageContainer, PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { ContractStatusBadge } from "@/components/contract/status-badge";
import { cn } from "@/lib/utils";

function List() {
  const params = useSearchParams();
  const router = useRouter();
  const projectId = params.get("projeto");
  const confirm = useConfirm();
  const { toast } = useToast();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<ContractStatus | "todos">("todos");

  const all = useLiveQuery(() => getDb().contracts.toArray(), [], undefined);
  const project = useLiveQuery(() => (projectId ? getDb().projects.get(projectId) : undefined), [projectId], undefined);

  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return (all ?? [])
      .filter((c) => (projectId ? c.projectId === projectId : true))
      .filter((c) => (status === "todos" ? true : c.status === status))
      .filter((c) => (q ? (c.issued?.content ?? c.content).client.name.toLowerCase().includes(q) || c.projectName.toLowerCase().includes(q) || formatContractNumber(c.number, c.revision).includes(q) : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [all, projectId, status, search]);

  async function onNew() {
    if (!projectId) return;
    const c = await createContractFromProject(projectId);
    router.push(`/contrato/?id=${encodeURIComponent(c.id)}`);
  }

  async function onDelete(c: Contract) {
    const ok = await confirm({
      title: "Excluir contrato?",
      message: `O contrato nº ${formatContractNumber(c.number, c.revision)} e os dados pessoais nele serão apagados deste aparelho. Não pode ser desfeito.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (ok) {
      await deleteContract(c.id);
      toast("Contrato excluído");
    }
  }

  return (
    <>
      <PageHeader
        title="Contratos"
        subtitle={project ? project.name : "Todos os projetos"}
        backHref={projectId ? `/projeto/resultado/?id=${encodeURIComponent(projectId)}` : "/"}
        actions={
          projectId ? (
            <Button size="sm" onClick={onNew}>
              <Plus /> Novo
            </Button>
          ) : undefined
        }
      />
      <PageContainer className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" placeholder="Buscar por cliente, projeto ou número" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-12" aria-label="Buscar contratos" />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Filtrar por status">
          {(["todos", ...CONTRACT_STATUSES] as const).map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={cn("h-10 shrink-0 rounded-full border px-4 text-sm font-semibold", status === s ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>
              {s === "todos" ? "Todos" : CONTRACT_STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {all === undefined ? (
          <div className="h-28 animate-pulse rounded-2xl bg-muted" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title={all.length === 0 || (projectId && !all.some((c) => c.projectId === projectId)) ? "Nenhum contrato ainda" : "Nada encontrado"}
            description={projectId ? "Crie um contrato a partir deste orçamento." : "Abra um orçamento e use “Gerar contrato” na tela de resultado."}
            action={projectId ? <Button onClick={onNew}><Plus /> Novo contrato</Button> : <Button asChild><Link href="/projetos/">Ver projetos</Link></Button>}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((c) => {
              const content = c.issued?.content ?? c.content;
              return (
                <Card key={c.id} className="overflow-hidden" data-testid="contract-card">
                  <Link href={`/contrato/?id=${encodeURIComponent(c.id)}`} className="block p-4 active:bg-muted/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Contrato nº {formatContractNumber(c.number, c.revision)}</div>
                        <h3 className="truncate text-base font-semibold">{content.client.name || "Sem cliente"}</h3>
                        <p className="truncate text-sm text-muted-foreground">{c.projectName}</p>
                      </div>
                      <ContractStatusBadge status={c.status} />
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {c.revision > 1 && <Badge>revisão {c.revision}</Badge>}
                        {isSuperseded(c, all) && <Badge tone="amber">substituído</Badge>}
                        <span>Atualizado {formatDate(c.updatedAt)}</span>
                      </div>
                      <div className="text-lg font-bold leading-none text-primary tabular">{formatBRL(content.payment.totalCents)}</div>
                    </div>
                  </Link>
                  <div className="flex border-t border-border">
                    <Button asChild variant="ghost" size="sm" className="h-11 flex-1 rounded-none text-muted-foreground">
                      <Link href={`/contrato/?id=${encodeURIComponent(c.id)}`}>{c.status === "rascunho" ? "Continuar" : "Abrir"}</Link>
                    </Button>
                    <Button variant="ghost" size="sm" className="h-11 flex-1 rounded-none border-l border-border text-destructive hover:bg-destructive-soft" onClick={() => onDelete(c)}>
                      <Trash2 /> Excluir
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </PageContainer>
    </>
  );
}

export default function ContractsPage() {
  return (
    <React.Suspense fallback={<PageContainer><div className="h-40 animate-pulse rounded-2xl bg-muted" /></PageContainer>}>
      <List />
    </React.Suspense>
  );
}
