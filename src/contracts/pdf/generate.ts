/**
 * Geração do PDF do contrato, 100% no navegador (pdf-lib + fontkit), sem rede e sem servidor.
 */
import { PDFDocument, type PDFFont, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Contract, ContractContent, ResolvedClause } from "@/domain/schema";
import { buildDocumentBlocks } from "../document";
import { formatContractNumber } from "../build-contract";
import { isoToLocalDate, todayISO } from "../dates";
import { companyDisplayName, resolveClauses } from "../template";
import type { FontBytes } from "./fonts";
import { dataUrlToBytes, imageSize } from "./image";
import { drawOps } from "./render-ops";
import {
  COLORS,
  layoutDocument,
  type FontKey,
  type LaidOutDocument,
  type LayoutFonts,
  type LogoInfo,
} from "./layout";

export interface RenderInput {
  content: ContractContent;
  numberLabel: string;
  /** null = minuta (rascunho) */
  issuedDate: string | null;
  draft: boolean;
  /** Cláusulas já resolvidas (versão emitida). Se ausente, são resolvidas a partir do conteúdo. */
  clauses?: ResolvedClause[];
  /** Momento usado nos metadados do PDF (determinístico para versões emitidas) */
  metaDate: Date;
}

/** Monta os dados de renderização a partir de um contrato salvo (usa a versão IMUTÁVEL quando emitido). */
export function renderInputFromContract(c: Contract, now = new Date()): RenderInput {
  const numberLabel = formatContractNumber(c.number, c.revision);
  if (c.issued) {
    return {
      content: c.issued.content,
      numberLabel,
      issuedDate: c.issued.date || (c.issuedAt ? isoToLocalDate(c.issuedAt) : null),
      draft: false,
      clauses: c.issued.clauses,
      metaDate: new Date(c.issuedAt ?? c.updatedAt),
    };
  }
  return { content: c.content, numberLabel, issuedDate: null, draft: true, metaDate: now };
}

export interface FontSet {
  pdfFonts: Record<FontKey, PDFFont>;
  fonts: LayoutFonts;
}

export async function prepareDoc(fontBytes: FontBytes): Promise<{ doc: PDFDocument; set: FontSet }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const entries = await Promise.all(
    (Object.keys(fontBytes) as FontKey[]).map(async (k) => [k, await doc.embedFont(fontBytes[k], { subset: true })] as const),
  );
  const pdfFonts = Object.fromEntries(entries) as Record<FontKey, PDFFont>;
  const charset = new Set<number>(pdfFonts.serif.getCharacterSet());
  // só aceita o que TODAS as fontes usadas possuem
  for (const k of Object.keys(pdfFonts) as FontKey[]) {
    const s = new Set<number>(pdfFonts[k].getCharacterSet());
    for (const cp of [...charset]) if (!s.has(cp)) charset.delete(cp);
  }
  const fonts: LayoutFonts = {
    measure: (font, size, text) => pdfFonts[font].widthOfTextAtSize(text, size),
    supports: (cp) => charset.has(cp) || cp === 0x20,
  };
  return { doc, set: { pdfFonts, fonts } };
}

function logoInfoOf(content: ContractContent): LogoInfo | null {
  if (!content.company.logoDataUrl) return null;
  const parsed = dataUrlToBytes(content.company.logoDataUrl);
  if (!parsed) return null;
  const size = imageSize(parsed.bytes);
  return size ? { dataUrl: content.company.logoDataUrl, width: size.width, height: size.height } : null;
}

function layoutWith(input: RenderInput, fonts: LayoutFonts): LaidOutDocument {
  const clauses = input.clauses ?? resolveClauses(input.content, { numberLabel: input.numberLabel });
  const blocks = buildDocumentBlocks(
    input.content,
    { numberLabel: input.numberLabel, issuedDate: input.issuedDate, todayDate: todayISO(), draft: input.draft },
    clauses,
  );
  return layoutDocument(blocks, fonts, {
    numberLabel: input.numberLabel,
    companyName: companyDisplayName(input.content.company) || "Contrato",
    draft: input.draft,
    logo: logoInfoOf(input.content),
  });
}

/** Só o layout (para a pré-visualização na tela). */
export async function layoutContract(input: RenderInput, fontBytes: FontBytes): Promise<LaidOutDocument> {
  const { set } = await prepareDoc(fontBytes);
  return layoutWith(input, set.fonts);
}

export interface GeneratedPdf {
  bytes: Uint8Array;
  layout: LaidOutDocument;
}

export async function generateContractPdf(input: RenderInput, fontBytes: FontBytes): Promise<GeneratedPdf> {
  const { doc, set } = await prepareDoc(fontBytes);
  const layout = layoutWith(input, set.fonts);
  const c = input.content;

  doc.setTitle(`${c.title} nº ${input.numberLabel}`);
  doc.setAuthor(companyDisplayName(c.company) || "");
  doc.setSubject(`Contrato nº ${input.numberLabel}${input.draft ? " (minuta)" : ""}`);
  doc.setCreator("Marcenaria — Orçamentos");
  doc.setProducer("pdf-lib (gerado no navegador)");
  doc.setLanguage("pt-BR");
  doc.setCreationDate(input.metaDate);
  doc.setModificationDate(input.metaDate);

  const images = new Map<string, PDFImage>();
  const getImage = async (dataUrl: string): Promise<PDFImage | null> => {
    if (images.has(dataUrl)) return images.get(dataUrl)!;
    const parsed = dataUrlToBytes(dataUrl);
    if (!parsed) return null;
    try {
      const img = imageSize(parsed.bytes)?.kind === "jpeg" ? await doc.embedJpg(parsed.bytes) : await doc.embedPng(parsed.bytes);
      images.set(dataUrl, img);
      return img;
    } catch {
      return null; // logo corrompido não impede o PDF
    }
  };

  const env = { pdfFonts: set.pdfFonts, pageWidth: layout.pageWidth, pageHeight: layout.pageHeight, getImage };
  for (const pageLayout of layout.pages) {
    const page = doc.addPage([layout.pageWidth, layout.pageHeight]);
    await drawOps(page, pageLayout.ops, env);
  }

  const bytes = await doc.save();
  return { bytes, layout };
}

export { COLORS };
