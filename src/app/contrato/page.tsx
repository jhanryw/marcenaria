"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Download, Eye, FileCheck2, FileText, Loader2, Scale, Share2 } from "lucide-react";
import { useContractEditor } from "@/hooks/use-contract-editor";
import { useSettings } from "@/hooks/use-data";
import { getProject } from "@/db/repository";
import { issueContract } from "@/db/contracts";
import { calculateProject } from "@/engine/project-calc";
import { formatContractNumber } from "@/contracts/build-contract";
import { reviewContract, type ReviewStep } from "@/contracts/review";
import { PageContainer, PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { ClausesDialog } from "@/components/contract/clauses-dialog";
import { ContractPreviewDialog } from "@/components/contract/contract-preview";
import { ContractStatusBadge } from "@/components/contract/status-badge";
import { ContractViewer } from "@/components/contract/viewer";
import { downloadPdf, makePdf, sharePdf } from "@/components/contract/pdf-actions";
import { ClientStep, ItemsStep, PaymentStep, ReviewList, ScheduleStep } from "@/components/contract/steps";
import { cn } from "@/lib/utils";

const STEPS: Array<{ key: ReviewStep; label: string; title: string }> = [
  { key: "cliente", label: "Cliente", title: "Dados do cliente" },
  { key: "moveis", label: "Móveis", title: "Projeto e móveis" },
  { key: "valores", label: "Valores", title: "Valores e pagamento" },
  { key: "prazo", label: "Prazo", title: "Prazo e condições" },
  { key: "revisao", label: "Revisão", title: "Revisão e PDF" },
];

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "error")
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-destructive">
        <AlertCircle className="size-3.5" /> erro ao salvar
      </span>
    );
  if (state === "saving")
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> salvando…
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Check className="size-3.5" /> rascunho salvo
    </span>
  );
}

function Editor() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  const { contract, status, saveState, update, flush, reload } = useContractEditor(id);
  const settings = useSettings();
  const confirm = useConfirm();
  const { toast } = useToast();

  const [step, setStep] = React.useState<ReviewStep>("cliente");
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [clausesOpen, setClausesOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "download" | "share" | "issue">(null);
  const [refPrice, setRefPrice] = React.useState<number | null>(null);

  const projectId = contract?.projectId;
  React.useEffect(() => {
    if (!projectId) return;
    let alive = true;
    getProject(projectId).then((p) => alive && setRefPrice(p ? calculateProject(p).finance.finalPriceCents : null));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const review = React.useMemo(() => (contract ? reviewContract(contract.content) : null), [contract]);

  React.useEffect(() => {
    // volta ao topo ao trocar de etapa
    window.scrollTo({ top: 0 });
  }, [step]);

  if (status === "loading") {
    return (
      <>
        <PageHeader title="Contrato" backHref="/projetos/" />
        <PageContainer>
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        </PageContainer>
      </>
    );
  }
  if (status === "notfound" || !contract || !review) {
    return (
      <>
        <PageHeader title="Contrato" backHref="/projetos/" />
        <PageContainer>
          <EmptyState icon={<FileText />} title="Contrato não encontrado" description="Ele pode ter sido excluído." action={<Button asChild><Link href="/contratos/">Ver contratos</Link></Button>} />
        </PageContainer>
      </>
    );
  }

  const numberLabel = formatContractNumber(contract.number, contract.revision);
  const backHref = `/contratos/?projeto=${encodeURIComponent(contract.projectId)}`;

  /* ---------- contratos não editáveis ---------- */
  if (contract.status !== "rascunho") {
    return (
      <>
        <PageHeader title={`Contrato nº ${numberLabel}`} subtitle={contract.projectName} backHref={backHref} actions={<ContractStatusBadge status={contract.status} />} />
        <PageContainer className="max-w-2xl">
          <ContractViewer contract={contract} onChanged={reload} />
        </PageContainer>
      </>
    );
  }

  /* ---------- rascunho: assistente em etapas ---------- */
  const idx = STEPS.findIndex((s) => s.key === step);
  const content = contract.content;
  const stepErrors = (k: ReviewStep) => review.errors.filter((e) => e.step === k).length;

  async function pdf(kind: "download" | "share") {
    setBusy(kind);
    try {
      await flush();
      const { bytes, fileName } = await makePdf(contract!);
      if (kind === "download") {
        downloadPdf(bytes, fileName);
        toast("Minuta em PDF gerada");
      } else {
        const r = await sharePdf(bytes, fileName);
        if (r === "downloaded") toast("Compartilhamento indisponível aqui — PDF baixado");
      }
    } catch {
      toast("Não foi possível gerar o PDF", "error");
    } finally {
      setBusy(null);
    }
  }

  async function issue() {
    const ok = await confirm({
      title: `Emitir o contrato nº ${numberLabel}?`,
      message: (
        <>
          Ao emitir, o conteúdo e o texto das cláusulas são <strong>congelados</strong>. Mudanças no orçamento não alteram o contrato emitido, e ele não poderá ser
          editado (para alterar, crie uma nova revisão). Emitir <strong>não</strong> significa que foi assinado.
        </>
      ),
      confirmLabel: "Emitir contrato",
    });
    if (!ok) return;
    setBusy("issue");
    try {
      await flush();
      await issueContract(contract!.id);
      toast("Contrato emitido");
      await reload();
    } catch (e) {
      toast((e as Error).message || "Não foi possível emitir", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title={`Contrato nº ${numberLabel}`}
        subtitle={<SaveIndicator state={saveState} />}
        backHref={backHref}
        actions={
          <Button size="sm" variant="secondary" onClick={() => setPreviewOpen(true)}>
            <Eye /> Prévia
          </Button>
        }
      />
      <PageContainer className="max-w-2xl pb-40 md:pb-32">
        <div role="tablist" aria-label="Etapas do contrato" className="mb-4 grid grid-cols-5 gap-1">
          {STEPS.map((s, i) => {
            const active = s.key === step;
            const errs = stepErrors(s.key);
            return (
              <button
                key={s.key}
                role="tab"
                aria-selected={active}
                onClick={() => setStep(s.key)}
                className="flex min-h-14 flex-col items-center justify-start gap-1 rounded-xl px-1 py-1.5 text-[11px] font-semibold"
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-sm font-bold",
                    active ? "bg-primary text-primary-foreground" : i < idx ? "bg-secondary text-primary" : "bg-muted text-muted-foreground",
                    errs > 0 && !active && "ring-2 ring-destructive/50",
                  )}
                >
                  {i < idx && errs === 0 ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={active ? "text-primary" : "text-muted-foreground"}>{s.label}</span>
              </button>
            );
          })}
        </div>
        <h2 className="mb-3 text-lg font-bold">{STEPS[idx].title}</h2>

        {step === "cliente" && <ClientStep content={content} update={update} settingsCompany={settings?.company} />}
        {step === "moveis" && <ItemsStep content={content} update={update} />}
        {step === "valores" && <PaymentStep content={content} update={update} referencePriceCents={refPrice} />}
        {step === "prazo" && <ScheduleStep content={content} update={update} holidays={settings?.holidays ?? []} />}
        {step === "revisao" && (
          <div className="space-y-3">
            <ReviewList review={review} onGoToStep={setStep} />

            <Card className="space-y-3 p-4">
              <div className="flex items-start gap-2 text-sm">
                <Scale className="mt-0.5 size-5 shrink-0 text-primary" />
                <p>
                  <strong>Cláusulas:</strong> modelo-base (versão {content.templateVersion}) com {content.clauses.length} seções. Você pode editar o texto e salvar como
                  modelo padrão. Não é um modelo juridicamente homologado: recomenda-se revisão por advogado.
                </p>
              </div>
              <Button variant="outline" onClick={() => setClausesOpen(true)}>
                <FileText /> Revisar e editar cláusulas
              </Button>
            </Card>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" size="lg" onClick={() => setPreviewOpen(true)}>
                <Eye /> Pré-visualizar contrato
              </Button>
              <Button variant="outline" size="lg" onClick={() => pdf("download")} disabled={busy !== null}>
                {busy === "download" ? <Loader2 className="animate-spin" /> : <Download />} Baixar minuta (PDF)
              </Button>
              <Button variant="outline" size="lg" onClick={() => pdf("share")} disabled={busy !== null}>
                {busy === "share" ? <Loader2 className="animate-spin" /> : <Share2 />} Compartilhar minuta
              </Button>
              <Button size="lg" onClick={issue} disabled={!review.canIssue || busy !== null} data-testid="issue-button">
                {busy === "issue" ? <Loader2 className="animate-spin" /> : <FileCheck2 />} Emitir contrato
              </Button>
            </div>
            {!review.canIssue && <p className="text-center text-xs text-muted-foreground">Resolva as pendências obrigatórias para emitir. A minuta (com marca d’água) pode ser baixada a qualquer momento.</p>}
          </div>
        )}
      </PageContainer>

      {/* barra de navegação entre etapas */}
      <div className="safe-x fixed inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur md:left-60" style={{ bottom: "calc(var(--nav-h) + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
          <Button variant="outline" className="flex-1" disabled={idx === 0} onClick={() => setStep(STEPS[idx - 1].key)}>
            <ChevronLeft /> Voltar
          </Button>
          {idx < STEPS.length - 1 ? (
            <Button className="flex-1" onClick={() => setStep(STEPS[idx + 1].key)}>
              Próxima <ChevronRight />
            </Button>
          ) : (
            <Button variant="secondary" className="flex-1" onClick={() => router.push(`/contratos/?projeto=${encodeURIComponent(contract.projectId)}`)}>
              Concluir depois
            </Button>
          )}
        </div>
      </div>

      <ContractPreviewDialog contract={contract} open={previewOpen} onOpenChange={setPreviewOpen} />
      <ClausesDialog
        open={clausesOpen}
        onOpenChange={setClausesOpen}
        content={content}
        onApply={(patch) => update((c) => ({ ...c, ...patch }))}
      />
    </>
  );
}

/** Reinicia o assistente (etapa, diálogos) ao trocar de contrato, ex.: ao abrir uma nova revisão. */
function KeyedEditor() {
  const id = useSearchParams().get("id");
  return <Editor key={id ?? "none"} />;
}

export default function ContractPage() {
  return (
    <React.Suspense
      fallback={
        <PageContainer>
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        </PageContainer>
      }
    >
      <KeyedEditor />
    </React.Suspense>
  );
}
