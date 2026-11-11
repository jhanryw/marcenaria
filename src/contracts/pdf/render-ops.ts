/**
 * Desenha as operações de um layout (texto, linhas, retângulos, imagens, marca d'água) em páginas do pdf-lib.
 * Compartilhado entre o PDF do contrato (A4 retrato) e o do plano de corte (A4 paisagem).
 */
import { degrees, rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { FontKey, Op } from "./layout";

export const hexColor = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

export interface RenderEnv {
  pdfFonts: Record<FontKey, PDFFont>;
  pageWidth: number;
  pageHeight: number;
  getImage?: (dataUrl: string) => Promise<PDFImage | null>;
}

export async function drawOps(page: PDFPage, ops: Op[], env: RenderEnv): Promise<void> {
  const H = env.pageHeight;
  for (const op of ops) {
    switch (op.t) {
      case "line":
        page.drawLine({
          start: { x: op.x1, y: H - op.y1 },
          end: { x: op.x2, y: H - op.y2 },
          thickness: op.width,
          color: hexColor(op.color),
          dashArray: op.dash,
        });
        break;
      case "rect":
        page.drawRectangle({
          x: op.x,
          y: H - op.y - op.h,
          width: op.w,
          height: op.h,
          color: op.fill ? hexColor(op.fill) : undefined,
          borderColor: op.stroke ? hexColor(op.stroke) : undefined,
          borderWidth: op.stroke ? (op.strokeWidth ?? 0.6) : 0,
          borderDashArray: op.dash,
        });
        break;
      case "image": {
        const img = env.getImage ? await env.getImage(op.dataUrl) : null;
        if (img) page.drawImage(img, { x: op.x, y: H - op.y - op.h, width: op.w, height: op.h });
        break;
      }
      case "watermark": {
        const size = 120;
        const f = env.pdfFonts.sansBold;
        const tw = f.widthOfTextAtSize(op.text, size);
        const th = size * 0.72;
        const ang = (45 * Math.PI) / 180;
        const cx = env.pageWidth / 2;
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
        const font = env.pdfFonts[op.font];
        const y = H - op.y;
        const color = hexColor(op.color);
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
        if (op.text) page.drawText(op.text, { x, y, size: op.size, font, color, ...(op.rotate ? { rotate: degrees(op.rotate) } : {}) });
        break;
      }
    }
  }
}

export type { PDFDocument };
