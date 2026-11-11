/**
 * Geração do PDF do plano de corte (pdf-lib, 100% no navegador, offline). Reaproveita fontes e renderer do contrato.
 */
import { prepareDoc } from "@/contracts/pdf/generate";
import type { FontBytes } from "@/contracts/pdf/fonts";
import type { LaidOutDocument } from "@/contracts/pdf/layout";
import { drawOps } from "@/contracts/pdf/render-ops";
import type { ExportModel } from "../model";
import { layoutCutPlan, type PlanMode } from "./layout";

export type { PlanMode };

/** Só o layout (pré-visualização). Lança ExportBlockedError no modo "plan" se o plano não for válido. */
export async function layoutCutPlanPreview(model: ExportModel, mode: PlanMode, fontBytes: FontBytes): Promise<LaidOutDocument> {
  const { set } = await prepareDoc(fontBytes);
  return layoutCutPlan(model, mode, set.fonts);
}

export interface GeneratedCutPlanPdf {
  bytes: Uint8Array;
  layout: LaidOutDocument;
}

export async function generateCutPlanPdf(model: ExportModel, mode: PlanMode, fontBytes: FontBytes): Promise<GeneratedCutPlanPdf> {
  const { doc, set } = await prepareDoc(fontBytes);
  const layout = layoutCutPlan(model, mode, set.fonts); // valida: bloqueia plano inválido

  const when = new Date(model.meta.generatedAt);
  doc.setTitle(`${mode === "plan" ? "Plano de corte" : "Lista de peças"} — ${model.meta.projectName} (${model.meta.reference})`);
  doc.setAuthor(model.meta.companyName);
  doc.setSubject(mode === "plan" ? "Plano de corte estimado por algoritmo heurístico — sujeito à validação técnica da madeireira" : "Lista de peças");
  doc.setCreator("Marcenaria — Orçamentos");
  doc.setProducer("pdf-lib (gerado no navegador)");
  doc.setLanguage("pt-BR");
  doc.setCreationDate(when);
  doc.setModificationDate(when);

  const env = { pdfFonts: set.pdfFonts, pageWidth: layout.pageWidth, pageHeight: layout.pageHeight };
  for (const p of layout.pages) {
    const page = doc.addPage([layout.pageWidth, layout.pageHeight]);
    await drawOps(page, p.ops, env);
  }
  return { bytes: await doc.save(), layout };
}
