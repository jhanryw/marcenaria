"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Copy, FileText, Layers, Pencil, Share2, TrendingUp, Wallet, Banknote } from "lucide-react";
import { useProjectEditor } from "@/hooks/use-project-editor";
import { useSettings } from "@/hooks/use-data";
import { calculateProject } from "@/engine/project-calc";
import { buildClientSummary, buildInternalSummary } from "@/engine/summary";
import { formatBRL, formatM2, formatPercent } from "@/lib/money";
import { formatDate } from "@/lib/format-date";
import { PageContainer, PageHeader, EmptyState, SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { StatusBadge } from "@/components/status-badge";
import { CostBreakdown, PriceBreakdown } from "@/components/editor/finance-breakdown";
import { useToast } from "@/components/ui/toast";
import { GenerateContractButton } from "@/components/contract/generate-button";

function BigStat({
  icon,
  label,
  value,
  sub,
  accent,
  warn,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: boolean;
  warn?: boolean;
  testId?: string;
}) {
  return (
    <Card className={accent ? "border-primary bg-primary text-primary-foreground" : warn ? "border-warning/40" : undefined}>
      <div className="p-4">
        <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${accent ? "text-primary-foreground/80" : "text-muted-foreground"} [&_svg]:size-4`}>
          {icon} {label}
        </div>
        <div className="mt-1 text-[1.2rem] font-extrabold leading-tight tabular min-[420px]:text-[1.6rem]" data-testid={testId}>
          {value}
        </div>
        {sub && <div className={`mt-0.5 text-xs ${accent ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{sub}</div>}
      </div>
    </Card>
  );
}

function Result() {
  const params = useSearchParams();
  const id = params.get("id");
  const { project, status } = useProjectEditor(id);
  const settings = useSettings();
  const { toast } = useToast();
  const [view, setView] = React.useState<"interna" | "cliente">("interna");

  const calc = React.useMemo(() => (project ? calculateProject(project) : null), [project]);

  if (status === "loading") {
    return (
      <>
        <PageHeader title="Resultado" backHref="/projetos/" />
        <PageContainer>
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        </PageContainer>
      </>
    );
  }
  if (!project || !calc) {
    return (
      <>
        <PageHeader title="Resultado" backHref="/projetos/" />
        <PageContainer>
          <EmptyState icon={<FileText />} title="Projeto não encontrado" action={<Button asChild><Link href="/projetos/">Ver projetos</Link></Button>} />
        </PageContainer>
      </>
    );
  }

  const f = calc.finance;
  const company = settings?.companyName ?? "";
  const clientText = buildClientSummary(project, calc, company);
  const internalText = buildInternalSummary(project, calc);

  async function copy() {
    const text = view === "cliente" ? clientText : internalText;
    try {
      await navigator.clipboard.writeText(text);
      toast("Resumo copiado");
    } catch {
      // fallback para contextos sem Clipboard API
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      toast(ok ? "Resumo copiado" : "Não foi possível copiar", ok ? "success" : "error");
    }
  }

  async function share() {
    // Compartilha SEMPRE a versão comercial (sem custos internos)
    if (navigator.share) {
      try {
        await navigator.share({ title: `Orçamento — ${project!.name}`, text: clientText });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(clientText);
      toast("Compartilhamento indisponível aqui — texto comercial copiado");
    } catch {
      toast("Não foi possível compartilhar", "error");
    }
  }

  const pieceLines = project.pieces.length;

  return (
    <>
      <PageHeader
        title="Resultado"
        subtitle={project.name}
        backHref={`/projeto/?id=${encodeURIComponent(project.id)}`}
        actions={
          <Button asChild size="sm" variant="secondary">
            <Link href={`/projeto/?id=${encodeURIComponent(project.id)}`}>
              <Pencil /> Editar
            </Link>
          </Button>
        }
      />
      <PageContainer className="space-y-4">
        <Segmented
          ariaLabel="Tipo de visão"
          value={view}
          onChange={setView}
          options={[
            { value: "interna", label: "Visão interna" },
            { value: "cliente", label: "Visão para o cliente" },
          ]}
        />

        {!calc.reliable && (
          <div role="alert" className="flex items-start gap-2 rounded-2xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <p>
              <strong>Orçamento incompleto.</strong> {calc.cut.errors.length > 0 ? `${calc.cut.errors.length} aviso(s) no plano de corte.` : "Há erros no cálculo."}{" "}
              Os valores abaixo não incluem as peças que não couberam.{" "}
              <Link href={`/projeto/?id=${encodeURIComponent(project.id)}`} className="font-bold underline">
                Corrigir
              </Link>
            </p>
          </div>
        )}

        {view === "interna" ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <BigStat
                warn={!calc.reliable}
                icon={<Layers />}
                label="Chapas"
                value={calc.reliable ? calc.cut.totalSheetsToBuy : `${calc.cut.totalSheetsToBuy}*`}
                sub={calc.reliable ? formatM2(calc.cut.piecesAreaMm2) + " em peças" : "parcial"}
                testId="res-sheets"
              />
              <BigStat icon={<Wallet />} label="Custo total" value={formatBRL(f.totalCostCents)} testId="res-cost" />
              <BigStat accent icon={<Banknote />} label={f.usingManualPrice ? "Preço (manual)" : "Preço sugerido"} value={formatBRL(f.finalPriceCents)} sub={`markup ${formatPercent(f.effectiveMarkupPercent, 1)}`} testId="res-price" />
              <BigStat icon={<TrendingUp />} label="Lucro bruto" value={formatBRL(f.grossProfitCents)} sub={`margem ${formatPercent(f.grossMarginPercent, 1)}`} testId="res-profit" />
            </div>

            {f.missingDeductions.length > 0 && (
              <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
                <strong>Lucro bruto ≠ lucro líquido.</strong> Ainda não há {f.missingDeductions.join(", ")} cadastrado(s) neste orçamento. Defina na aba Preço.
              </p>
            )}

            <SectionTitle>Detalhamento</SectionTitle>
            <Card className="px-4 py-2">
              <CostBreakdown calc={calc} project={project} />
            </Card>
            <Card className="px-4 py-2">
              <PriceBreakdown calc={calc} />
            </Card>
          </>
        ) : (
          <Card className="overflow-hidden" data-testid="client-view">
            <div className="bg-primary px-5 py-4 text-primary-foreground">
              <div className="text-xs font-semibold uppercase tracking-wide text-primary-foreground/80">
                Orçamento{company ? ` · ${company}` : ""}
              </div>
              <h2 className="mt-1 text-xl font-bold leading-tight">{project.name}</h2>
              {project.clientName && <p className="text-sm text-primary-foreground/90">{project.clientName}</p>}
            </div>
            <div className="space-y-4 p-5">
              {project.description.trim() && <p className="whitespace-pre-wrap text-sm leading-relaxed">{project.description}</p>}
              {pieceLines > 0 && (
                <div>
                  <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Materiais</div>
                  <ul className="list-inside list-disc text-sm">
                    {project.materials
                      .filter((m) => project.pieces.some((p) => p.materialId === m.id))
                      .map((m) => (
                        <li key={m.id}>
                          {m.name}
                          {m.finish ? ` — ${m.finish}` : ""}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
              <div className="rounded-2xl bg-secondary p-4 text-center">
                <div className="text-xs font-semibold uppercase tracking-wide text-secondary-foreground/80">Valor total</div>
                <div className="mt-1 text-4xl font-extrabold text-primary tabular" data-testid="client-price">
                  {formatBRL(f.finalPriceCents)}
                </div>
              </div>
              {project.notes.trim() && (
                <div>
                  <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Observações</div>
                  <p className="whitespace-pre-wrap text-sm">{project.notes}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                <StatusBadge status={project.status} /> · {formatDate(project.updatedAt)}
              </p>
            </div>
          </Card>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" size="lg" onClick={copy}>
            <Copy /> Copiar resumo
          </Button>
          <Button size="lg" onClick={share}>
            <Share2 /> Compartilhar descrição comercial
          </Button>
        </div>
        <Card className="space-y-3 p-4">
          <div className="text-sm font-semibold">Contrato</div>
          <p className="text-xs text-muted-foreground">
            Cria um contrato com os dados comerciais deste orçamento e o valor final de venda. Custos internos, markup e lucro nunca entram no contrato.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <GenerateContractButton projectId={project.id} />
            <Button asChild variant="outline" size="lg">
              <Link href={`/contratos/?projeto=${encodeURIComponent(project.id)}`}>Ver contratos do projeto</Link>
            </Button>
          </div>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          “Copiar” usa a visão selecionada. “Compartilhar” sempre envia a versão comercial, sem custos internos.
        </p>
      </PageContainer>
    </>
  );
}

export default function ResultPage() {
  return (
    <React.Suspense
      fallback={
        <PageContainer>
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        </PageContainer>
      }
    >
      <Result />
    </React.Suspense>
  );
}
