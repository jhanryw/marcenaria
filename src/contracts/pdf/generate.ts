/**
 * Geração do PDF do contrato, 100% no navegador (pdf-lib + fontkit), sem rede e sem servidor.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Contract, ContractContent, ResolvedClause } from "@/domain/schema";
import { buildDocumentBlocks } from "../document";
import { formatContractNumber } from "../build-contract";
import { isoToLocalDate, todayISO } from "../dates";
import { companyDisplayName, resolveClauses } from "../template";
import type { FontBytes } from "./fonts";
import { dataUrlToBytes, imageSize } from "./image";
import {
  COLORS,
  layoutDocument,
  type FontKey,
  type LaidOutDocument,
  type LayoutFonts,
  type LogoInfo,
  type Op,
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

async function prepareDoc(fontBytes: FontBytes): Promise<{ doc: PDFDocument; set: FontSet }> {
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

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

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

  void StandardFonts;
  for (const pageLayout of layout.pages) {
    const page = doc.addPage([layout.pageWidth, layout.pageHeight]);
    const H = layout.pageHeight;
    for (const op of pageLayout.ops) await drawOp(page, op, H);
  }

  async function drawOp(page: ReturnType<PDFDocument["addPage"]>, op: Op, H: number) {
    switch (op.t) {
      case "line":
        page.drawLine({ start: { x: op.x1, y: H - op.y1 }, end: { x: op.x2, y: H - op.y2 }, thickness: op.width, color: hex(op.color) });
        break;
      case "rect":
        page.drawRectangle({
          x: op.x,
          y: H - op.y - op.h,
          width: op.w,
          height: op.h,
          color: op.fill ? hex(op.fill) : undefined,
          borderColor: op.stroke ? hex(op.stroke) : undefined,
          borderWidth: op.stroke ? (op.strokeWidth ?? 0.6) : 0,
        });
        break;
      case "image": {
        const img = await getImage(op.dataUrl);
        if (img) page.drawImage(img, { x: op.x, y: H - op.y - op.h, width: op.w, height: op.h });
        break;
      }
      case "watermark": {
        const size = 120;
        const f = set.pdfFonts.sansBold;
        const tw = f.widthOfTextAtSize(op.text, size);
        const th = size * 0.72;
        const ang = (45 * Math.PI) / 180;
        const cx = layout.pageWidth / 2;
        const cy = H / 2;
        page.drawText(op.text, {
          x: cx - (tw / 2) * Math.cos(ang) + (th / 2) * Math.sin(ang),
          y: cy - (tw / 2) * Math.sin(ang) - (th / 2) * Math.cos(ang),
          size,
          font: f,
          color: rgb(0.82, 0.84, 0.82),
          opacity: 0.35,
          rotate: degrees(45),
        });
        break;
      }
      case "text": {
        const font = set.pdfFonts[op.font];
        const y = H - op.y;
        const color = hex(op.color);
        if (op.justify && op.text.includes(" ")) {
          const words = op.text.split(" ");
          const natural = words.reduce((a, w) => a + font.widthOfTextAtSize(w, op.size), 0);
          const gap = (op.width - natural) / (words.length - 1);
          let x = op.x;
          for (const w of words) {
            if (w) page.drawText(w, { x, y, size: op.size, font, color });
            x += font.widthOfTextAtSize(w, op.size) + gap;
          }
          break;
        }
        const tw = font.widthOfTextAtSize(op.text, op.size);
        const x = op.align === "center" ? op.x + (op.width - tw) / 2 : op.align === "right" ? op.x + op.width - tw : op.x;
        if (op.text) page.drawText(op.text, { x, y, size: op.size, font, color });
        break;
      }
    }
  }

  const bytes = await doc.save();
  return { bytes, layout };
}

export { COLORS };
