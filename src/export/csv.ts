/**
 * CSV GENÉRICO da lista de peças, pensado para abrir no Excel em português do Brasil:
 *  - separador ";"  (o Excel pt-BR usa ";" porque a vírgula é o separador decimal);
 *  - UTF-8 com BOM (acentos corretos ao abrir com duplo clique);
 *  - quebra de linha CRLF;
 *  - números com vírgula decimal e sem separador de milhar.
 *
 * Este formato NÃO é garantido para nenhum software de seccionadora específico. Exportadores
 * dedicados (ver exporters.ts) devem ser criados conforme o equipamento/software da madeireira.
 */
import type { ExportModel, ExportPiece } from "./model";

export const CSV_SEPARATOR = ";";
export const CSV_BOM = "﻿";
export const CSV_EOL = "\r\n";

export const CSV_HEADERS = [
  "Código",
  "Descrição",
  "Material",
  "Acabamento",
  "Espessura (mm)",
  "Comprimento (mm)",
  "Largura (mm)",
  "Quantidade",
  "Gira 90°",
  "Sentido do veio",
  "Fita comprimento 1 (sup.)",
  "Fita comprimento 2 (inf.)",
  "Fita largura 1 (esq.)",
  "Fita largura 2 (dir.)",
  "Observações",
] as const;

/** 1800 → "1800"; 450.5 → "450,5" (sem milhar). */
export function csvNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 1000) / 1000).replace(".", ",");
}

/**
 * Escapa um campo de texto: aspas duplicadas e campo entre aspas quando necessário. Também neutraliza
 * "injeção de fórmula" (texto começando com = + - @ vira texto literal no Excel).
 */
export function csvText(raw: string): string {
  let v = raw.replace(/\r\n|\r|\n/g, " ").replace(/\u0000/g, "");
  if (/^[=+\-@\t]/.test(v)) v = `'${v}`;
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function row(p: ExportPiece): string[] {
  return [
    csvText(p.code),
    csvText(p.description),
    csvText(p.materialName),
    csvText(p.finish),
    csvNumber(p.thicknessMm),
    csvNumber(p.lengthMm),
    csvNumber(p.widthMm),
    String(p.quantity),
    p.rotationAllowed ? "Sim" : "Não",
    p.grainRequired ? "Comprimento" : "Sem veio",
    csvText(p.edges.top ?? ""),
    csvText(p.edges.bottom ?? ""),
    csvText(p.edges.left ?? ""),
    csvText(p.edges.right ?? ""),
    csvText(p.notes),
  ];
}

/** Peças ordenadas por material (na ordem do plano) e, dentro dele, pela ordem de cadastro. */
export function sortedPieces(model: Pick<ExportModel, "pieces" | "materials">): ExportPiece[] {
  const order = new Map(model.materials.map((m, i) => [m.id, i]));
  return model.pieces
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (order.get(a.p.materialId) ?? 999) - (order.get(b.p.materialId) ?? 999) || a.i - b.i)
    .map((x) => x.p);
}

export function buildPartsCsv(model: ExportModel): string {
  const lines = [CSV_HEADERS.map(csvText).join(CSV_SEPARATOR)];
  for (const p of sortedPieces(model)) lines.push(row(p).join(CSV_SEPARATOR));
  return CSV_BOM + lines.join(CSV_EOL) + CSV_EOL;
}
