import * as React from "react";
import type { Project } from "@/domain/schema";
import type { ProjectCalculation } from "@/engine/project-calc";
import { formatBRL, formatNumber, formatPercent } from "@/lib/money";
import { cn } from "@/lib/utils";

function Row({
  label,
  detail,
  value,
  strong,
  muted,
  indent,
}: {
  label: React.ReactNode;
  detail?: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
  muted?: boolean;
  indent?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5", indent && "pl-4", strong && "py-2.5 text-base font-bold")}>
      <div className="min-w-0">
        <span className={cn(muted ? "text-sm text-muted-foreground" : "text-sm", strong && "text-base")}>{label}</span>
        {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
      </div>
      <span className={cn("shrink-0 tabular", muted ? "text-sm text-muted-foreground" : "text-sm font-semibold", strong && "text-base")}>
        {value}
      </span>
    </div>
  );
}

/** Detalhamento completo de custos (visão interna). */
export function CostBreakdown({ calc, project }: { calc: ProjectCalculation; project: Project }) {
  const f = calc.finance;
  const hasHardware = project.costItems.length > 0;
  return (
    <div className="divide-y divide-border">
      <div className="pb-2">
        <Row label="Chapas de MDF" value={formatBRL(f.sheetsCostCents)} />
        {calc.materialLines.map((l) => (
          <Row
            key={l.materialId}
            indent
            muted
            label={`${l.name}`}
            detail={`${l.sheetsToBuy} chapa${l.sheetsToBuy === 1 ? "" : "s"} × ${formatBRL(l.unitCents)}`}
            value={formatBRL(l.totalCents)}
          />
        ))}
      </div>
      <div className="py-2">
        <Row label="Fita de borda" value={formatBRL(f.tapeCostCents)} />
        {calc.tape.usages.map((u) => (
          <Row
            key={u.tapeId}
            indent
            muted
            label={u.tape.name}
            detail={`${formatNumber(u.meters, 2, 2)} m × ${formatBRL(u.tape.pricePerMeterCents)} (inclui ${formatNumber(u.tape.wastePercent)}% de perda)`}
            value={formatBRL(u.costCents)}
          />
        ))}
      </div>
      <div className="py-2">
        <Row label="Ferragens e consumíveis" value={formatBRL(f.hardwareCostCents)} />
        <Row label="Mão de obra" value={formatBRL(f.laborCostCents)} />
        {f.laborCostCents > 0 && (
          <>
            <Row indent muted label="Fabricação" value={formatBRL(f.laborFabricationCents)} />
            <Row indent muted label="Instalação" value={formatBRL(f.laborInstallationCents)} />
          </>
        )}
        <Row label="Frete" value={formatBRL(f.freightCostCents)} />
        <Row label="Instalação (itens) e outros" value={formatBRL(f.otherCostCents)} />
        {!hasHardware && f.hardwareCostCents === 0 && (
          <p className="pt-1 text-xs text-muted-foreground">Nenhuma ferragem cadastrada ainda (aba Custos).</p>
        )}
      </div>
      <Row strong label="Custo total" value={formatBRL(f.totalCostCents)} />
    </div>
  );
}

/** Bloco com markup, lucro, margem e preço. */
export function PriceBreakdown({ calc }: { calc: ProjectCalculation }) {
  const f = calc.finance;
  return (
    <div className="divide-y divide-border">
      <Row label="Custo total" value={formatBRL(f.totalCostCents)} />
      <Row
        label={f.usingManualPrice ? "Markup efetivo (preço manual)" : "Markup sobre o custo"}
        value={formatPercent(f.effectiveMarkupPercent)}
      />
      {f.usingManualPrice && <Row muted label="Preço sugerido pelo markup" value={formatBRL(f.suggestedPriceCents)} />}
      <Row strong label={f.usingManualPrice ? "Preço de venda (manual)" : "Preço de venda sugerido"} value={formatBRL(f.finalPriceCents)} />
      <Row label="Lucro bruto estimado" value={formatBRL(f.grossProfitCents)} />
      <Row label="Margem bruta" detail="lucro bruto ÷ preço de venda" value={formatPercent(f.grossMarginPercent)} />
    </div>
  );
}
