/**
 * Registro de exportadores da LISTA DE PEÇAS.
 *
 * Hoje existe apenas o CSV genérico. Cada seccionadora/software de otimização (ex.: formatos próprios
 * de cada fabricante) tem layout, separadores e campos diferentes, e este app NÃO presume compatibilidade com
 * nenhum deles. Para suportar um equipamento específico, implemente `PartsListExporter` com o formato
 * documentado pelo fornecedor, registre com `registerPartsExporter` e ele aparece automaticamente na tela
 * de exportação — sem mexer no motor de corte nem no PDF.
 */
import { buildPartsCsv } from "./csv";
import type { ExportModel } from "./model";

export interface PartsListExporter {
  id: string;
  label: string;
  description: string;
  extension: string;
  mimeType: string;
  /** Conteúdo do arquivo (texto já com BOM/CRLF quando o formato exigir) */
  build(model: ExportModel): string;
}

const registry = new Map<string, PartsListExporter>();

export function registerPartsExporter(exporter: PartsListExporter): void {
  registry.set(exporter.id, exporter);
}
export function listPartsExporters(): PartsListExporter[] {
  return [...registry.values()];
}
export function getPartsExporter(id: string): PartsListExporter | undefined {
  return registry.get(id);
}

export const GENERIC_CSV_ID = "csv-generico";

registerPartsExporter({
  id: GENERIC_CSV_ID,
  label: "CSV genérico (Excel)",
  description: "Separador “;”, UTF-8 com BOM, vírgula decimal. Formato genérico, não específico de nenhuma seccionadora.",
  extension: "csv",
  mimeType: "text/csv;charset=utf-8",
  build: buildPartsCsv,
});

/* ---------------------------- nomes de arquivo ---------------------------- */

function slug(text: string, max = 40): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

export type ExportKind = "plano" | "lista";

export function exportFileName(model: Pick<ExportModel, "meta" | "valid">, kind: ExportKind, extension: string): string {
  const base = kind === "plano" ? "Plano-de-corte" : "Lista-de-pecas";
  const ref = slug(model.meta.reference, 20) || "projeto";
  const name = slug(model.meta.projectName);
  // lista de um plano não validado carrega o aviso no nome do arquivo
  const flag = kind === "lista" && !model.valid ? "_PLANO-NAO-VALIDADO" : "";
  return `${base}_${ref}${name ? `_${name}` : ""}${flag}.${extension}`;
}
