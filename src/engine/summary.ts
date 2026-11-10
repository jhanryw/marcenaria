/**
 * Textos de resumo do orçamento (copiar / compartilhar). Puro e testável.
 */
import type { Project } from "@/domain/schema";
import { formatBRL, formatMeters, formatNumber, formatPercent } from "@/lib/money";
import type { ProjectCalculation } from "./project-calc";

function dateBR(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

/** Descrição comercial: SEM custos internos, markup, margem ou lucro. */
export function buildClientSummary(project: Project, calc: ProjectCalculation, companyName = ""): string {
  const lines: string[] = [];
  lines.push(`*Orçamento${companyName ? ` — ${companyName}` : ""}*`);
  lines.push("");
  lines.push(`*Projeto:* ${project.name}`);
  if (project.clientName) lines.push(`*Cliente:* ${project.clientName}`);
  if (project.description.trim()) {
    lines.push("");
    lines.push(project.description.trim());
  }
  const mats = project.materials.filter((m) => project.pieces.some((p) => p.materialId === m.id));
  if (mats.length > 0) {
    lines.push("");
    lines.push("*Materiais:*");
    for (const m of mats) {
      lines.push(`• ${m.name}${m.finish ? ` (${m.finish})` : ""}`);
    }
  }
  lines.push("");
  lines.push(`*Valor total:* ${formatBRL(calc.finance.finalPriceCents)}`);
  if (project.notes.trim()) {
    lines.push("");
    lines.push(`*Observações:* ${project.notes.trim()}`);
  }
  lines.push("");
  lines.push(`Data: ${dateBR(project.updatedAt)}`);
  return lines.join("\n");
}

/** Resumo interno completo (custos, markup, margem). */
export function buildInternalSummary(project: Project, calc: ProjectCalculation): string {
  const f = calc.finance;
  const L: string[] = [];
  L.push(`ORÇAMENTO INTERNO — ${project.name}`);
  if (project.clientName) L.push(`Cliente: ${project.clientName}`);
  L.push("");
  L.push(
    `Chapas a comprar: ${calc.reliable ? calc.cut.totalSheetsToBuy : `${calc.cut.totalSheetsToBuy} (INCOMPLETO)`}`,
  );
  for (const l of calc.materialLines) {
    L.push(`  • ${l.name}: ${l.sheetsToBuy} × ${formatBRL(l.unitCents)} = ${formatBRL(l.totalCents)}`);
  }
  if (calc.tape.usages.length > 0) {
    L.push("Fita de borda:");
    for (const u of calc.tape.usages) {
      L.push(`  • ${u.tape.name}: ${formatNumber(u.meters, 2, 2)} m × ${formatBRL(u.tape.pricePerMeterCents)} = ${formatBRL(u.costCents)}`);
    }
  }
  L.push("");
  L.push(`MDF: ${formatBRL(f.sheetsCostCents)}`);
  L.push(`Fita de borda: ${formatBRL(f.tapeCostCents)}`);
  L.push(`Ferragens e consumíveis: ${formatBRL(f.hardwareCostCents)}`);
  L.push(`Mão de obra: ${formatBRL(f.laborCostCents)}`);
  L.push(`Frete: ${formatBRL(f.freightCostCents)}`);
  L.push(`Outros: ${formatBRL(f.otherCostCents)}`);
  L.push(`CUSTO TOTAL: ${formatBRL(f.totalCostCents)}`);
  L.push("");
  L.push(`Markup: ${formatPercent(f.effectiveMarkupPercent)}`);
  L.push(`PREÇO DE VENDA${f.usingManualPrice ? " (manual)" : ""}: ${formatBRL(f.finalPriceCents)}`);
  L.push(`Lucro bruto: ${formatBRL(f.grossProfitCents)} (margem bruta ${formatPercent(f.grossMarginPercent)})`);
  if (f.deductionsCents > 0) L.push(`Deduções estimadas: ${formatBRL(f.deductionsCents)} → sobra ${formatBRL(f.profitAfterDeductionsCents)}`);
  if (calc.tape.totalGrossMm > 0) L.push(`(Fita total: ${formatMeters(calc.tape.totalGrossMm)})`);
  return L.join("\n");
}
