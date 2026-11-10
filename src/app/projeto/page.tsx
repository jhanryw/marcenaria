"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Calculator, Check, Eye, FileText, Layers, Loader2, Scissors, AlertCircle, Wallet } from "lucide-react";
import { useEdgeTapes, useSheetMaterials } from "@/hooks/use-data";
import { useProjectEditor } from "@/hooks/use-project-editor";
import { calculateProject } from "@/engine/project-calc";
import { formatBRL } from "@/lib/money";
import { PageContainer, PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InfoTab } from "@/components/editor/info-tab";
import { PiecesTab } from "@/components/editor/pieces-tab";
import { CutTab } from "@/components/editor/cut-tab";
import { CostsTab } from "@/components/editor/costs-tab";
import { PricingTab } from "@/components/editor/pricing-tab";
import { cn } from "@/lib/utils";

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
      <Check className="size-3.5" /> salvo
    </span>
  );
}

function Editor() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  const { project, status, saveState, update } = useProjectEditor(id);
  const catalogMaterials = useSheetMaterials();
  const catalogTapes = useEdgeTapes();
  const [tab, setTab] = React.useState("pecas");

  // recalcula sem travar a digitação
  const deferred = React.useDeferredValue(project);
  const calc = React.useMemo(() => (deferred ? calculateProject(deferred) : null), [deferred]);

  if (status === "loading") {
    return (
      <>
        <PageHeader title="Carregando…" backHref="/projetos/" />
        <PageContainer>
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        </PageContainer>
      </>
    );
  }
  if (status === "notfound" || !project || !calc || !deferred) {
    return (
      <>
        <PageHeader title="Projeto" backHref="/projetos/" />
        <PageContainer>
          <EmptyState
            icon={<FileText />}
            title="Projeto não encontrado"
            description="Ele pode ter sido excluído, ou este aparelho não tem esses dados."
            action={<Button onClick={() => router.push("/projetos/")}>Ver projetos</Button>}
          />
        </PageContainer>
      </>
    );
  }

  const f = calc.finance;

  return (
    <>
      <PageHeader
        title={project.name || "Sem nome"}
        subtitle={<SaveIndicator state={saveState} />}
        backHref="/projetos/"
        actions={
          <Button asChild size="sm" variant="secondary">
            <Link href={`/projeto/resultado/?id=${encodeURIComponent(project.id)}`}>
              <Eye /> Resultado
            </Link>
          </Button>
        }
      />
      <PageContainer className="pb-32 md:pb-28">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="sticky top-[calc(env(safe-area-inset-top)+4rem)] z-20 shadow-sm" aria-label="Seções do orçamento">
            <TabsTrigger value="dados">
              <FileText /> Dados
            </TabsTrigger>
            <TabsTrigger value="pecas">
              <Layers /> Peças
            </TabsTrigger>
            <TabsTrigger value="corte">
              <Scissors /> Corte
            </TabsTrigger>
            <TabsTrigger value="custos">
              <Wallet /> Custos
            </TabsTrigger>
            <TabsTrigger value="preco">
              <Calculator /> Preço
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dados">
            <InfoTab project={project} update={update} />
          </TabsContent>
          <TabsContent value="pecas">
            <PiecesTab
              project={project}
              calc={calc}
              catalogMaterials={catalogMaterials ?? []}
              catalogTapes={catalogTapes ?? []}
              update={update}
            />
          </TabsContent>
          <TabsContent value="corte">
            <CutTab project={deferred} calc={calc} update={update} />
          </TabsContent>
          <TabsContent value="custos">
            <CostsTab project={project} calc={calc} update={update} />
          </TabsContent>
          <TabsContent value="preco">
            <PricingTab project={deferred} calc={calc} update={update} />
          </TabsContent>
        </Tabs>
      </PageContainer>

      {/* Barra de resultado sempre visível e atualizada automaticamente */}
      <div
        className="safe-x fixed inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur md:left-60"
        style={{ bottom: "calc(var(--nav-h) + env(safe-area-inset-bottom))" }}
        data-testid="summary-bar"
      >
        <div className="mx-auto grid max-w-5xl grid-cols-3 gap-2 px-4 py-2 md:px-6">
          <div>
            <div className="text-[11px] leading-tight text-muted-foreground">Chapas</div>
            <div className={cn("text-lg font-bold leading-tight tabular", !calc.reliable && "text-warning")} data-testid="bar-sheets">
              {calc.cut.totalSheetsToBuy}
              {!calc.reliable && "*"}
            </div>
          </div>
          <div>
            <div className="text-[11px] leading-tight text-muted-foreground">Custo</div>
            <div className="truncate text-lg font-bold leading-tight tabular" data-testid="bar-cost">
              {formatBRL(f.totalCostCents)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] leading-tight text-muted-foreground">Preço de venda</div>
            <div className="truncate text-lg font-bold leading-tight text-primary tabular" data-testid="bar-price">
              {formatBRL(f.finalPriceCents)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ProjectPage() {
  return (
    <React.Suspense
      fallback={
        <PageContainer>
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        </PageContainer>
      }
    >
      <Editor />
    </React.Suspense>
  );
}
