"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Eye } from "lucide-react";
import type { Project } from "@/domain/schema";
import type { ProjectCalculation } from "@/engine/project-calc";
import { formatBRL, formatPercent } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { MoneyInput, NumberInput } from "@/components/ui/number-input";
import { Slider } from "@/components/ui/slider";
import { SectionTitle } from "@/components/page-header";
import { CostBreakdown, PriceBreakdown } from "./finance-breakdown";

export function PricingTab({
  project,
  calc,
  update,
}: {
  project: Project;
  calc: ProjectCalculation;
  update: (fn: (p: Project) => Project) => void;
}) {
  const f = calc.finance;
  // Em preço manual, os controles mostram o markup efetivo; mexer neles volta ao modo automático.
  const shownMarkup = f.usingManualPrice ? Math.round(f.effectiveMarkupPercent * 100) / 100 : project.markupPercent;

  const setMarkup = (v: number) =>
    update((p) => ({ ...p, markupPercent: Math.max(0, v), manualPriceCents: null }));

  return (
    <div className="space-y-2">
      {!calc.reliable && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p>
            <strong>Orçamento incompleto:</strong> há peças que não couberam no plano de corte. O custo e o preço abaixo não incluem essas peças.
            Veja a aba Corte.
          </p>
        </div>
      )}

      <SectionTitle>Custos</SectionTitle>
      <Card className="px-4 py-2">
        <CostBreakdown calc={calc} project={project} />
      </Card>

      <SectionTitle>Markup</SectionTitle>
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="Markup sobre o custo" htmlFor="markup" hint="Preço = custo × (1 + markup ÷ 100)">
            <NumberInput id="markup" value={shownMarkup} onChange={(v) => setMarkup(v ?? 0)} suffix="%" maxDecimals={2} />
          </Field>
          <div className="pb-6 text-right">
            <div className="text-xs text-muted-foreground">margem bruta</div>
            <div className="text-lg font-bold text-primary tabular">{formatPercent(f.grossMarginPercent, 1)}</div>
          </div>
        </div>
        <Slider
          aria-label="Markup"
          min={0}
          max={200}
          step={1}
          value={[Math.min(200, Math.max(0, shownMarkup))]}
          onValueChange={([v]) => setMarkup(v)}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0%</span>
          <span>100%</span>
          <span>200%+ (digite acima)</span>
        </div>
        <p className="rounded-xl bg-secondary px-3 py-2 text-xs text-secondary-foreground">
          <strong>Markup ≠ margem.</strong> Markup 50% sobre custo de R$ 1.000 vende por R$ 1.500; o lucro (R$ 500) é 33,33% do preço, essa é a margem.
        </p>
      </Card>

      <SectionTitle>Preço de venda</SectionTitle>
      <Card className="space-y-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted-foreground">Sugerido pelo markup</span>
          <strong className="tabular">{formatBRL(f.suggestedPriceCents)}</strong>
        </div>
        <Field label="Definir preço manualmente (opcional)" htmlFor="manual-price" hint="Recalcula markup e margem efetivos.">
          <MoneyInput
            id="manual-price"
            cents={project.manualPriceCents}
            placeholder={String(f.suggestedPriceCents / 100).replace(".", ",")}
            onChange={(v) => update((p) => ({ ...p, manualPriceCents: v }))}
          />
        </Field>
        {f.usingManualPrice && (
          <Button variant="outline" size="sm" onClick={() => update((p) => ({ ...p, manualPriceCents: null }))}>
            Voltar ao preço sugerido
          </Button>
        )}
        {f.usingManualPrice && f.grossProfitCents < 0 && (
          <p role="alert" className="rounded-xl bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive">
            Atenção: o preço manual está abaixo do custo (prejuízo de {formatBRL(-f.grossProfitCents)}).
          </p>
        )}
      </Card>

      <SectionTitle>Resultado</SectionTitle>
      <Card className="px-4 py-2">
        <PriceBreakdown calc={calc} />
      </Card>

      <SectionTitle>Impostos, comissões e despesas indiretas</SectionTitle>
      <Card className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Lucro bruto não é lucro líquido.</strong> Informe percentuais sobre o preço de venda para estimar o que sobra depois dessas deduções.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Impostos">
            <NumberInput
              value={project.deductions.taxPercent}
              onChange={(v) => update((p) => ({ ...p, deductions: { ...p.deductions, taxPercent: Math.max(0, v ?? 0) } }))}
              suffix="%"
            />
          </Field>
          <Field label="Comissões">
            <NumberInput
              value={project.deductions.commissionPercent}
              onChange={(v) => update((p) => ({ ...p, deductions: { ...p.deductions, commissionPercent: Math.max(0, v ?? 0) } }))}
              suffix="%"
            />
          </Field>
          <Field label="Indiretos">
            <NumberInput
              value={project.deductions.overheadPercent}
              onChange={(v) => update((p) => ({ ...p, deductions: { ...p.deductions, overheadPercent: Math.max(0, v ?? 0) } }))}
              suffix="%"
            />
          </Field>
        </div>
        {f.missingDeductions.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Ainda não cadastrado: <strong>{f.missingDeductions.join(", ")}</strong>. O lucro bruto acima pode estar superestimado.
            </p>
          </div>
        )}
        {f.deductionsCents > 0 && (
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3 text-sm">
            <span>
              Deduções estimadas <span className="text-muted-foreground">({formatBRL(f.deductionsCents)})</span> → sobra aproximada
            </span>
            <strong className="tabular">{formatBRL(f.profitAfterDeductionsCents)}</strong>
          </div>
        )}
      </Card>

      <Button asChild size="lg" className="mt-2 w-full">
        <Link href={`/projeto/resultado/?id=${encodeURIComponent(project.id)}`}>
          <Eye /> Abrir tela de resultado
        </Link>
      </Button>
    </div>
  );
}
