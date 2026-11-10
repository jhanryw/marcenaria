/**
 * Orquestra os motores: plano de corte + fita de borda + financeiro.
 * Função pura: mesmo projeto → mesmo resultado.
 */
import type { Project } from "@/domain/schema";
import { planProjectCutting } from "./cutting/plan";
import type { ProjectCutResult } from "./cutting/types";
import { validateMaterialResult, type LayoutViolation } from "./cutting/validate";
import { computeEdgeBanding, pieceTapeMm, type EdgeBandingResult } from "./finance/edge-banding";
import { computeFinance, costItemSubtotal, type FinanceResult } from "./finance/pricing";
import { mulCents } from "@/lib/money";

export interface MaterialCostLine {
  materialId: string;
  name: string;
  thicknessMm: number;
  sheetsToBuy: number;
  unitCents: number;
  totalCents: number;
}

export interface ProjectCalculation {
  cut: ProjectCutResult;
  /** Violações geométricas (deve ser sempre vazio; se não for, não confiar no plano) */
  violations: LayoutViolation[];
  tape: EdgeBandingResult;
  materialLines: MaterialCostLine[];
  sheetsCostCents: number;
  finance: FinanceResult;
  /** O orçamento está completo e confiável? */
  reliable: boolean;
  /** Mensagens para o usuário (erros e avisos) */
  issues: Array<{ level: "error" | "warning"; message: string }>;
  pieceCount: number;
}

export function calculateProject(project: Project): ProjectCalculation {
  const cut = planProjectCutting(project.materials, project.pieces, project.reserve, {
    minShortMm: project.remnantMinShortMm,
    minLongMm: project.remnantMinLongMm,
  });

  const violations: LayoutViolation[] = [];
  for (const r of cut.materials) {
    const ps = project.pieces.filter((p) => p.materialId === r.materialId);
    violations.push(...validateMaterialResult(r, ps));
  }

  const tape = computeEdgeBanding(project.pieces, project.tapes);

  const materialLines: MaterialCostLine[] = cut.materials.map((r) => ({
    materialId: r.materialId,
    name: r.material.name,
    thicknessMm: r.material.thicknessMm,
    sheetsToBuy: r.sheetsToBuy,
    unitCents: r.material.priceCents,
    totalCents: r.sheetsToBuy * r.material.priceCents,
  }));
  const sheetsCostCents = materialLines.reduce((a, l) => a + l.totalCents, 0);

  const finance = computeFinance({
    sheetsCostCents,
    tapeCostCents: tape.totalCostCents,
    costItems: project.costItems,
    labor: project.labor,
    markupPercent: project.markupPercent,
    manualPriceCents: project.manualPriceCents,
    deductions: project.deductions,
  });

  const issues: ProjectCalculation["issues"] = [];
  for (const e of cut.errors) issues.push({ level: "error", message: e });
  for (const v of violations) {
    issues.push({ level: "error", message: `Plano de corte inválido (chapa ${v.sheetIndex}): ${v.message}` });
  }
  if (tape.missingTapeIds.length > 0) {
    issues.push({
      level: "error",
      message: "Há peças com fita de borda que não existe mais neste orçamento. Reabra a peça e escolha a fita novamente.",
    });
  }
  if (project.pieces.length === 0) {
    issues.push({ level: "warning", message: "Nenhuma peça cadastrada ainda." });
  }

  return {
    cut,
    violations,
    tape,
    materialLines,
    sheetsCostCents,
    finance,
    reliable: cut.complete && violations.length === 0 && tape.missingTapeIds.length === 0,
    issues,
    pieceCount: project.pieces.reduce((a, p) => a + Math.max(0, Math.floor(p.quantity)), 0),
  };
}

/** Resumo por linha da lista de peças. */
export function pieceRowSummary(p: Project["pieces"][number]) {
  const qty = Math.max(0, Math.floor(p.quantity));
  return {
    areaMm2: p.widthMm * p.lengthMm * qty,
    tapeMm: pieceTapeMm(p) * qty,
  };
}

export { costItemSubtotal, mulCents };
