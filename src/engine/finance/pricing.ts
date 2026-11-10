/**
 * Motor financeiro. Funções puras, tudo em centavos inteiros.
 *
 * Fórmulas:
 *   subtotal de custo extra = quantidade × valor unitário      (ou valor fixo)
 *   mão de obra            = horas × valor/hora                 (ou valor fixo)
 *   custo total            = MDF + fita + custos extras + mão de obra
 *   preço sugerido         = custo total × (1 + markup/100)
 *   lucro bruto            = preço − custo total
 *   margem bruta           = lucro bruto ÷ preço × 100          (≠ markup!)
 *   markup efetivo         = (preço − custo) ÷ custo × 100      (quando o preço é manual)
 */
import type {
  CostCategory,
  CostItem,
  Deductions,
  Labor,
  LaborPart,
} from "@/domain/schema";
import { mulCents } from "@/lib/money";

export function costItemSubtotal(item: CostItem): number {
  if (item.mode === "fixed") return Math.max(0, Math.round(item.unitCents));
  return mulCents(item.unitCents, Math.max(0, item.quantity));
}

export function laborPartCost(part: LaborPart): number {
  if (part.mode === "hourly") return mulCents(part.hourlyCents, Math.max(0, part.hours));
  return Math.max(0, Math.round(part.fixedCents));
}

export function laborCost(labor: Labor): { fabrication: number; installation: number; total: number } {
  const fabrication = laborPartCost(labor.fabrication);
  const installation = laborPartCost(labor.installation);
  return { fabrication, installation, total: fabrication + installation };
}

/** Preço de venda = custo × (1 + markup/100), arredondado ao centavo. */
export function priceFromMarkup(costCents: number, markupPercent: number): number {
  // markup em centésimos de ponto percentual → aritmética inteira
  const markupBp = Math.round(markupPercent * 100);
  return Math.round((costCents * (10000 + markupBp)) / 10000);
}

export function markupFromPrice(costCents: number, priceCents: number): number {
  if (costCents <= 0) return 0;
  return ((priceCents - costCents) / costCents) * 100;
}

export function marginFromPrice(costCents: number, priceCents: number): number {
  if (priceCents <= 0) return 0;
  return ((priceCents - costCents) / priceCents) * 100;
}

const CONSUMABLE_CATEGORIES: CostCategory[] = [
  "ferragens",
  "dobradicas",
  "corredicas",
  "puxadores",
  "parafusos",
  "cola",
  "solvente",
];

export interface FinanceInput {
  sheetsCostCents: number;
  tapeCostCents: number;
  costItems: CostItem[];
  labor: Labor;
  markupPercent: number;
  manualPriceCents: number | null;
  deductions: Deductions;
}

export interface FinanceResult {
  sheetsCostCents: number;
  tapeCostCents: number;
  /** Ferragens, dobradiças, corrediças, puxadores, parafusos, cola, solvente */
  hardwareCostCents: number;
  freightCostCents: number;
  /** Instalação (itens) + outros */
  otherCostCents: number;
  laborFabricationCents: number;
  laborInstallationCents: number;
  laborCostCents: number;
  totalCostCents: number;
  markupPercent: number;
  suggestedPriceCents: number;
  /** Preço efetivamente praticado (manual, se houver) */
  finalPriceCents: number;
  usingManualPrice: boolean;
  grossProfitCents: number;
  grossMarginPercent: number;
  /** Markup efetivo sobre o preço final (igual ao informado quando o preço é automático) */
  effectiveMarkupPercent: number;
  /** Deduções estimadas sobre o preço final (impostos, comissões, indiretas) */
  deductionsCents: number;
  /** Lucro bruto − deduções estimadas. NÃO é lucro líquido. */
  profitAfterDeductionsCents: number;
  /** Quais deduções ainda não foram cadastradas */
  missingDeductions: Array<"imposto" | "comissão" | "despesas indiretas">;
}

export function computeFinance(input: FinanceInput): FinanceResult {
  let hardware = 0;
  let freight = 0;
  let other = 0;
  for (const item of input.costItems) {
    const sub = costItemSubtotal(item);
    if (CONSUMABLE_CATEGORIES.includes(item.category)) hardware += sub;
    else if (item.category === "frete") freight += sub;
    else other += sub;
  }
  const labor = laborCost(input.labor);

  const total =
    input.sheetsCostCents + input.tapeCostCents + hardware + freight + other + labor.total;

  const suggested = priceFromMarkup(total, input.markupPercent);
  const usingManual = input.manualPriceCents !== null && input.manualPriceCents >= 0;
  const finalPrice = usingManual ? (input.manualPriceCents as number) : suggested;
  const profit = finalPrice - total;

  const d = input.deductions;
  const deductionPct = d.taxPercent + d.commissionPercent + d.overheadPercent;
  const deductionsCents = mulCents(finalPrice, deductionPct / 100);

  const missing: FinanceResult["missingDeductions"] = [];
  if (!(d.taxPercent > 0)) missing.push("imposto");
  if (!(d.commissionPercent > 0)) missing.push("comissão");
  if (!(d.overheadPercent > 0)) missing.push("despesas indiretas");

  return {
    sheetsCostCents: input.sheetsCostCents,
    tapeCostCents: input.tapeCostCents,
    hardwareCostCents: hardware,
    freightCostCents: freight,
    otherCostCents: other,
    laborFabricationCents: labor.fabrication,
    laborInstallationCents: labor.installation,
    laborCostCents: labor.total,
    totalCostCents: total,
    markupPercent: input.markupPercent,
    suggestedPriceCents: suggested,
    finalPriceCents: finalPrice,
    usingManualPrice: usingManual,
    grossProfitCents: profit,
    grossMarginPercent: marginFromPrice(total, finalPrice),
    effectiveMarkupPercent: usingManual ? markupFromPrice(total, finalPrice) : input.markupPercent,
    deductionsCents,
    profitAfterDeductionsCents: profit - deductionsCents,
    missingDeductions: missing,
  };
}
