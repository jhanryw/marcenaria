"use client";
import * as React from "react";
import { AlertTriangle, CheckCircle2, FileDown, Info, Scissors } from "lucide-react";
import type { Project } from "@/domain/schema";
import type { ProjectCalculation } from "@/engine/project-calc";
import { formatBRL, formatM2, formatNumber, formatPercent } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Select } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { EmptyState, SectionTitle } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { pieceCodes } from "@/export/model";
import { ExportDialog } from "@/components/cut/export-dialog";
import { CutViewer } from "./cut-viewer";

function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "green" | "amber" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-lg font-bold leading-tight tabular", tone === "green" && "text-success", tone === "amber" && "text-warning")}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function CutTab({
  project,
  calc,
  update,
}: {
  project: Project;
  calc: ProjectCalculation;
  update: (fn: (p: Project) => Project) => void;
}) {
  const [matId, setMatId] = React.useState<string | null>(null);
  const [exportOpen, setExportOpen] = React.useState(false);
  const results = calc.cut.materials;
  const selected = results.find((r) => r.materialId === matId) ?? results[0];

  // rótulos curtos e cores estáveis por peça
  const labels = React.useMemo(() => {
    // mesmos códigos únicos usados no PDF/CSV exportados para a madeireira
    return pieceCodes(project.pieces);
  }, [project.pieces]);
  const order = React.useMemo(() => new Map(project.pieces.map((p, i) => [p.id, i])), [project.pieces]);

  if (project.pieces.length === 0) {
    return (
      <EmptyState
        icon={<Scissors />}
        title="Sem peças para cortar"
        description="Cadastre as peças na aba Peças para ver o plano de corte."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* erros — nunca esconder um plano inválido */}
      {calc.issues.filter((i) => i.level === "error").length > 0 && (
        <div role="alert" className="space-y-2 rounded-2xl border border-destructive/30 bg-destructive-soft p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="size-5" /> Não foi possível montar um plano de corte completo
          </div>
          <ul className="list-inside list-disc space-y-1">
            {calc.issues
              .filter((i) => i.level === "error")
              .map((i, idx) => (
                <li key={idx}>{i.message}</li>
              ))}
          </ul>
          <p className="text-destructive/90">
            Enquanto houver peças que não cabem, o total de chapas e o preço <strong>estão incompletos</strong>. Ajuste as medidas, ative a
            rotação ou use uma chapa maior.
          </p>
        </div>
      )}

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <div className="font-semibold">Exportar para a madeireira</div>
          <p className="text-muted-foreground">PDF do plano (A4 paisagem) e lista de peças em CSV, em milímetros, sem preços nem dados do cliente.</p>
        </div>
        <Button onClick={() => setExportOpen(true)} data-testid="export-open" className="shrink-0">
          <FileDown /> Exportar plano de corte
        </Button>
      </Card>
      <ExportDialog project={project} open={exportOpen} onOpenChange={setExportOpen} />

      {/* resumo geral */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Chapas a comprar"
          value={calc.reliable ? calc.cut.totalSheetsToBuy : `${calc.cut.totalSheetsToBuy}*`}
          hint={calc.reliable ? `${calc.cut.totalSheetsUsed} no plano + reserva` : "*parcial: faltam peças"}
          tone={calc.reliable ? undefined : "amber"}
        />
        <Stat label="Custo das chapas" value={formatBRL(calc.sheetsCostCents)} />
        <Stat label="Área das peças" value={formatM2(calc.cut.piecesAreaMm2)} />
        <Stat label="Área das chapas" value={formatM2(calc.cut.sheetsAreaMm2)} hint="sem a reserva extra" />
      </div>

      {/* reserva */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-semibold">Reserva extra de material</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Select
              value={project.reserve.mode}
              onChange={(e) => update((p) => ({ ...p, reserve: { ...p.reserve, mode: e.target.value as Project["reserve"]["mode"] } }))}
            >
              <option value="none">Sem reserva</option>
              <option value="percent">Percentual</option>
              <option value="sheets">Chapas extras</option>
            </Select>
          </Field>
          <Field label="Valor" hint="Sempre arredondado para cima">
            <NumberInput
              value={project.reserve.value}
              disabled={project.reserve.mode === "none"}
              onChange={(v) => update((p) => ({ ...p, reserve: { ...p.reserve, value: Math.max(0, v ?? 0) } }))}
              suffix={project.reserve.mode === "percent" ? "%" : "chapas"}
            />
          </Field>
        </div>
      </Card>

      {/* seletor de material */}
      {results.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Material">
          {results.map((r) => (
            <button
              key={r.materialId}
              role="tab"
              aria-selected={r.materialId === selected?.materialId}
              onClick={() => setMatId(r.materialId)}
              className={cn(
                "min-h-11 rounded-xl border px-3 text-left text-sm font-semibold",
                r.materialId === selected?.materialId ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
              )}
            >
              {r.material.name}
              <span className="ml-2 opacity-80">{r.sheetsToBuy}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          <SectionTitle>{selected.material.name}</SectionTitle>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="Chapas"
              value={selected.sheetsToBuy}
              hint={
                selected.reserveSheets > 0
                  ? `${selected.sheetsUsed} + ${selected.reserveSheets} de reserva`
                  : `${selected.sheetsUsed} no plano`
              }
            />
            <Stat label="Custo" value={formatBRL(selected.sheetsToBuy * selected.material.priceCents)} hint={`${formatBRL(selected.material.priceCents)} / chapa`} />
            <Stat
              label="Aproveitamento"
              value={formatPercent(selected.metrics.utilizationPercent, 1)}
              hint="área das peças ÷ área das chapas"
              tone={selected.metrics.utilizationPercent >= 75 ? "green" : undefined}
            />
            <Stat label="Perda estimada" value={formatPercent(selected.metrics.lossPercent, 1)} hint="refilo + serra + sobras pequenas" />
          </div>

          {/* honestidade sobre o resultado */}
          {selected.sheetsUsed > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
              {selected.provenOptimal ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0" />}
              <p>
                {selected.provenOptimal ? (
                  <>
                    Resultado igual ao <strong>mínimo teórico por área</strong> ({selected.lowerBoundSheets}): nenhum plano usaria menos chapas.
                  </>
                ) : (
                  <>
                    <strong>Estimativa por heurística</strong>: testamos {selected.strategiesTried} estratégias e usamos a melhor. O mínimo teórico por
                    área é {selected.lowerBoundSheets} chapa{selected.lowerBoundSheets === 1 ? "" : "s"}; o ótimo real pode estar entre{" "}
                    {selected.lowerBoundSheets} e {selected.sheetsUsed}.
                  </>
                )}
              </p>
            </div>
          )}

          {/* peças que não cabem */}
          {selected.unplaceable.length > 0 && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive-soft p-4 text-sm text-destructive">
              <div className="mb-1 font-bold">Peças que não cabem na chapa</div>
              <ul className="space-y-1">
                {selected.unplaceable.map((u) => (
                  <li key={u.pieceId}>
                    <strong>
                      {u.quantity}× {u.description}
                    </strong>{" "}
                    ({formatNumber(u.lengthMm, 0)} × {formatNumber(u.widthMm, 0)} mm) — {u.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selected.sheets.length > 0 && <CutViewer result={selected} labels={labels} order={order} />}

          {/* sobras e perdas */}
          {selected.sheetsUsed > 0 && (
            <Card className="p-4">
              <div className="mb-2 text-sm font-semibold">Para onde vai a área das chapas</div>
              <dl className="space-y-1.5 text-sm">
                <AreaRow color="#3a8a64" label="Peças" mm2={selected.metrics.piecesAreaMm2} total={selected.metrics.sheetsAreaMm2} />
                <AreaRow
                  color="#2f8a5b"
                  label="Sobra reaproveitável"
                  hint={`retalhos ≥ ${formatNumber(project.remnantMinShortMm, 0)} × ${formatNumber(project.remnantMinLongMm, 0)} mm`}
                  mm2={selected.metrics.reusableRemnantAreaMm2}
                  total={selected.metrics.sheetsAreaMm2}
                />
                <AreaRow color="#b9b3a2" label="Sobra pequena (não reaproveitável)" mm2={selected.metrics.nonReusableAreaMm2} total={selected.metrics.sheetsAreaMm2} />
                <AreaRow color="#8a7a58" label="Perda de corte (serra)" mm2={selected.metrics.kerfAreaMm2} total={selected.metrics.sheetsAreaMm2} />
                <AreaRow color="#d9cfb8" label="Refilo das bordas" mm2={selected.metrics.marginAreaMm2} total={selected.metrics.sheetsAreaMm2} />
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Sobra reaproveitável não é perda: é material que volta para o estoque. A “perda estimada” soma serra, refilo e sobras pequenas.
              </p>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">Estratégia usada: {selected.strategy}.</p>
        </>
      )}
    </div>
  );
}

function AreaRow({ color, label, hint, mm2, total }: { color: string; label: string; hint?: string; mm2: number; total: number }) {
  const pct = total > 0 ? (mm2 / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="flex min-w-0 items-center gap-2">
          <i className="size-3 shrink-0 rounded-sm" style={{ background: color }} />
          <span className="truncate">{label}</span>
        </dt>
        <dd className="shrink-0 tabular">
          <strong>{formatM2(mm2)}</strong> <span className="text-muted-foreground">({formatPercent(pct, 1)})</span>
        </dd>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
