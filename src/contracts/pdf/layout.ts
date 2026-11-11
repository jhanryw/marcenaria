/**
 * Motor de layout A4 para o contrato.
 *
 * Recebe BLOCOS (document.ts) e devolve PÁGINAS com operações de desenho em pontos (1 pt = 1/72").
 * O mesmo resultado alimenta o PDF (render.ts) e a pré-visualização na tela (preview.tsx),
 * então o que o usuário vê é exatamente o que será impresso.
 *
 * Regras de paginação:
 *  - nada é cortado: toda linha é quebrada pela largura medida com a fonte real;
 *  - títulos de seção ficam junto das primeiras linhas do texto seguinte;
 *  - parágrafos não deixam linha órfã/viúva (mínimo 2 linhas em cada página);
 *  - tabelas curtas e cartões de itens não são partidos entre páginas;
 *  - o fecho do contrato (título da última seção + frase final + local/data + assinaturas)
 *    é um grupo indivisível: assinaturas nunca ficam sozinhas em uma página.
 */
import type { DocBlock, KV } from "../document";

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN_X = 58;
export const MARGIN_TOP = 60;
export const MARGIN_BOTTOM = 72;
export const CONTENT_W = PAGE_W - MARGIN_X * 2;
export const FOOTER_Y = PAGE_H - 40;
export const CONTENT_BOTTOM = PAGE_H - MARGIN_BOTTOM;

export type FontKey = "serif" | "serifBold" | "serifItalic" | "sans" | "sansSemi" | "sansBold";

export const COLORS = {
  text: "#1a1f1b",
  brand: "#1f4a3a",
  muted: "#626962",
  rule: "#cfd1c8",
  soft: "#eef4f0",
  softer: "#f6f7f4",
} as const;

export type Op =
  | {
      t: "text";
      x: number;
      y: number;
      text: string;
      font: FontKey;
      size: number;
      color: string;
      width: number;
      justify?: boolean;
      align?: "left" | "center" | "right";
      /** Graus no sentido anti-horário (90 = texto subindo). Ponto (x, y) = início da linha de base. Só com align "left". */
      rotate?: number;
    }
  | { t: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; strokeWidth?: number; dash?: [number, number]; tag?: string }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dash?: [number, number] }
  | { t: "image"; x: number; y: number; w: number; h: number; dataUrl: string }
  | { t: "watermark"; text: string };

export interface PageLayout {
  ops: Op[];
}
export interface LaidOutDocument {
  pageWidth: number;
  pageHeight: number;
  pages: PageLayout[];
}

export interface LayoutFonts {
  measure(font: FontKey, size: number, text: string): number;
  supports(codePoint: number): boolean;
}

export interface LogoInfo {
  dataUrl: string;
  width: number;
  height: number;
}

export interface LayoutOptions {
  numberLabel: string;
  companyName: string;
  draft: boolean;
  logo?: LogoInfo | null;
}

/* ------------------------------------------------------------------ */
/* Texto                                                               */
/* ------------------------------------------------------------------ */

/** Normaliza e troca por "?" o que a fonte embutida não possui (evita erro ao gerar o PDF). */
export function sanitizeText(text: string, supports: (cp: number) => boolean): string {
  let t = text.normalize("NFC");
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]/g, "");
  t = t.replace(/\t/g, "    ").replace(/\u00A0/g, " ").replace(/\r\n?/g, "\n");
  let out = "";
  for (const ch of t) {
    const cp = ch.codePointAt(0)!;
    out += ch === "\n" || supports(cp) ? ch : "?";
  }
  return out;
}

export function wrapText(text: string, width: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    const words = rawLine.split(/ +/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let cur = "";
    const flush = () => {
      if (cur) lines.push(cur);
      cur = "";
    };
    for (const word of words) {
      let w = word;
      // palavra maior que a linha: quebra por caracteres
      while (measure(w) > width) {
        flush();
        let cut = w.length - 1;
        while (cut > 1 && measure(w.slice(0, cut)) > width) cut--;
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const candidate = cur ? `${cur} ${w}` : w;
      if (measure(candidate) <= width) cur = candidate;
      else {
        flush();
        cur = w;
      }
    }
    flush();
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* Átomos de paginação                                                 */
/* ------------------------------------------------------------------ */

interface Atom {
  height: number;
  spaceBefore: number;
  keepWithNext: boolean;
  draw: (top: number) => Op[];
}

export function layoutDocument(rawBlocks: DocBlock[], fonts: LayoutFonts, opts: LayoutOptions): LaidOutDocument {
  const clean = (s: string) => sanitizeText(s, fonts.supports);
  const m = (font: FontKey, size: number) => (s: string) => fonts.measure(font, size, s);

  const atoms: Atom[] = [];
  const X0 = MARGIN_X;
  const W = CONTENT_W;

  const BODY = 10.5;
  const BODY_LH = 14.9;

  const baseline = (top: number, lh: number, size: number) => top + lh / 2 + size * 0.32;

  /** Linhas de texto simples (não justificadas) dentro de uma coluna. */
  function textLines(lines: string[], x: number, top: number, font: FontKey, size: number, lh: number, color: string, width: number, align: "left" | "center" | "right" = "left"): Op[] {
    return lines.map((line, i) => ({
      t: "text" as const,
      x,
      y: baseline(top + i * lh, lh, size),
      text: line,
      font,
      size,
      color,
      width,
      align,
    }));
  }

  /** Divide em blocos finais o "grupo de fecho": da última seção em diante. */
  let lastSectionIdx = -1;
  rawBlocks.forEach((b, i) => {
    if (b.t === "section") lastSectionIdx = i;
  });

  rawBlocks.forEach((raw, blockIdx) => {
    const inFinalGroup = blockIdx >= lastSectionIdx && lastSectionIdx >= 0;
    const startLen = atoms.length;

    switch (raw.t) {
      case "letterhead": {
        const logo = opts.logo ?? null;
        const maxLogoH = 46;
        const maxLogoW = 130;
        let lw = 0;
        let lh = 0;
        if (logo) {
          const k = Math.min(maxLogoW / logo.width, maxLogoH / logo.height, 1);
          lw = logo.width * k;
          lh = logo.height * k;
        }
        const textX = logo ? X0 + lw + 14 : X0;
        const textW = W - (textX - X0);
        const name = clean(raw.name);
        const nameLines = wrapText(name, textW, m("sansBold", 15));
        const sub = raw.subtitle ? wrapText(clean(raw.subtitle), textW, m("sans", 9.5)) : [];
        const infoLines = raw.lines.flatMap((l) => wrapText(clean(l), textW, m("sans", 8.5)));
        const textH = nameLines.length * 19 + sub.length * 12.5 + infoLines.length * 11.8;
        const h = Math.max(lh, textH) + 12;
        atoms.push({
          height: h,
          spaceBefore: 0,
          keepWithNext: true,
          draw: (top) => {
            const ops: Op[] = [];
            if (logo) ops.push({ t: "image", x: X0, y: top + (Math.max(lh, textH) - lh) / 2, w: lw, h: lh, dataUrl: logo.dataUrl });
            let y = top + (Math.max(lh, textH) - textH) / 2;
            ops.push(...textLines(nameLines, textX, y, "sansBold", 15, 19, COLORS.brand, textW));
            y += nameLines.length * 19;
            if (sub.length) {
              ops.push(...textLines(sub, textX, y, "sans", 9.5, 12.5, COLORS.muted, textW));
              y += sub.length * 12.5;
            }
            ops.push(...textLines(infoLines, textX, y, "sans", 8.5, 11.8, COLORS.muted, textW));
            ops.push({ t: "line", x1: X0, y1: top + h - 3, x2: X0 + W, y2: top + h - 3, color: COLORS.brand, width: 1.2 });
            return ops;
          },
        });
        break;
      }

      case "title": {
        const lines = wrapText(clean(raw.title), W, m("sansBold", 15.5));
        const sub = raw.lines.map(clean);
        const h = lines.length * 20 + sub.length * 13 + 8;
        atoms.push({
          height: h,
          spaceBefore: 16,
          keepWithNext: true,
          draw: (top) => [
            ...textLines(lines, X0, top, "sansBold", 15.5, 20, COLORS.text, W, "center"),
            ...textLines(sub, X0, top + lines.length * 20 + 3, "sans", 9.5, 13, COLORS.muted, W, "center"),
          ],
        });
        break;
      }

      case "section": {
        const label = `${raw.number}.`;
        const lines = wrapText(clean(raw.title).toUpperCase(), W - 26, m("sansBold", 10.5));
        const h = lines.length * 15 + 7;
        atoms.push({
          height: h,
          spaceBefore: 17,
          keepWithNext: true,
          draw: (top) => [
            { t: "text", x: X0, y: baseline(top, 15, 10.5), text: label, font: "sansBold", size: 10.5, color: COLORS.brand, width: 22 },
            ...textLines(lines, X0 + 26, top, "sansBold", 10.5, 15, COLORS.brand, W - 26),
            { t: "line", x1: X0, y1: top + h - 2, x2: X0 + W, y2: top + h - 2, color: COLORS.rule, width: 0.7 },
          ],
        });
        break;
      }

      case "heading": {
        atoms.push({
          height: 15,
          spaceBefore: 8,
          keepWithNext: true,
          draw: (top) => textLines([clean(raw.text)], X0, top, "sansBold", 8.5, 15, COLORS.muted, W),
        });
        break;
      }

      case "kv": {
        pushKvRows(raw.rows, X0, W, 0.3, false);
        break;
      }

      case "item": {
        // cartão: faixa de título + linhas
        const title = wrapText(clean(raw.title), W - 16, m("sansBold", 10));
        const th = title.length * 14 + 8;
        const first = atoms.length;
        atoms.push({
          height: th,
          spaceBefore: 9,
          keepWithNext: true,
          draw: (top) => [
            { t: "rect", x: X0, y: top, w: W, h: th, fill: COLORS.soft, stroke: COLORS.rule, strokeWidth: 0.6 },
            ...textLines(title, X0 + 8, top + 4, "sansBold", 10, 14, COLORS.brand, W - 16),
          ],
        });
        pushKvRows(raw.rows, X0 + 8, W - 16, 0.26, true, { frameX: X0, frameW: W });
        // mantém o cartão inteiro numa página quando ele cabe
        for (let i = first; i < atoms.length - 1; i++) atoms[i].keepWithNext = true;
        break;
      }

      case "table": {
        const colW = raw.columns.map((c) => c.width * W);
        const padX = 7;
        const rowAtom = (cells: string[], opts2: { header?: boolean; footer?: boolean }, spaceBefore: number): Atom => {
          const font: FontKey = opts2.header || opts2.footer ? "sansBold" : "serif";
          const size = opts2.header ? 8.5 : 10;
          const lh = opts2.header ? 12 : 13.6;
          const wrapped = cells.map((cell, i) => wrapText(clean(cell), colW[i] - padX * 2, m(font, size)));
          const n = Math.max(...wrapped.map((w) => w.length), 1);
          const h = n * lh + 9;
          return {
            height: h,
            spaceBefore,
            keepWithNext: false,
            draw: (top) => {
              const ops: Op[] = [];
              if (opts2.header) ops.push({ t: "rect", x: X0, y: top, w: W, h, fill: COLORS.soft });
              if (opts2.footer) ops.push({ t: "rect", x: X0, y: top, w: W, h, fill: COLORS.softer });
              let cx = X0;
              wrapped.forEach((lines, i) => {
                const align = raw.columns[i].align;
                ops.push(
                  ...textLines(lines, cx + padX, top + 4.5, font, size, lh, opts2.header ? COLORS.muted : COLORS.text, colW[i] - padX * 2, align),
                );
                cx += colW[i];
              });
              ops.push({ t: "line", x1: X0, y1: top + h, x2: X0 + W, y2: top + h, color: opts2.footer ? COLORS.brand : COLORS.rule, width: opts2.footer ? 1 : 0.6 });
              return ops;
            },
          };
        };
        const start = atoms.length;
        atoms.push(rowAtom(raw.columns.map((c) => c.label.toUpperCase()), { header: true }, 8));
        raw.rows.forEach((r) => atoms.push(rowAtom(r, {}, 0)));
        if (raw.footer) atoms.push(rowAtom(raw.footer, { footer: true }, 0));
        const count = atoms.length - start;
        if (count <= 16) for (let i = start; i < atoms.length - 1; i++) atoms[i].keepWithNext = true;
        else {
          atoms[start].keepWithNext = true;
          atoms[start + 1].keepWithNext = true;
        }
        break;
      }

      case "para": {
        const bullet = !!raw.bullet;
        const numbered = !!raw.number;
        const indent = numbered ? 32 : bullet ? 26 : 0;
        const textW = W - indent;
        const text = clean(raw.text);
        // parágrafo pode ter \n explícito (cada trecho vira linha própria)
        const lines = wrapText(text, textW, m("serif", BODY));
        const n = lines.length;
        lines.forEach((line, i) => {
          const isFirst = i === 0;
          const isLast = i === n - 1;
          // órfã/viúva: primeira e última duas linhas juntas
          const keep = n <= 3 ? !isLast : i === 0 || i === n - 2;
          const justify = !isLast && !line.includes("  ");
          atoms.push({
            height: BODY_LH,
            spaceBefore: isFirst ? (bullet ? 2 : 7) : 0,
            keepWithNext: keep,
            draw: (top) => {
              const ops: Op[] = [];
              if (isFirst && numbered) ops.push({ t: "text", x: X0, y: baseline(top, BODY_LH, 9), text: raw.number!, font: "sansBold", size: 9, color: COLORS.brand, width: 28 });
              if (isFirst && bullet) ops.push({ t: "text", x: X0 + 12, y: baseline(top, BODY_LH, BODY), text: "•", font: "serifBold", size: BODY, color: COLORS.brand, width: 8 });
              ops.push({ t: "text", x: X0 + indent, y: baseline(top, BODY_LH, BODY), text: line, font: "serif", size: BODY, color: COLORS.text, width: textW, justify });
              return ops;
            },
          });
        });
        break;
      }

      case "signatures": {
        const place = [raw.city ? clean(raw.city) : "", clean(raw.dateText)].filter(Boolean).join(", ");
        atoms.push({
          height: BODY_LH + 6,
          spaceBefore: 12,
          keepWithNext: true,
          draw: (top) => textLines([`${place}.`], X0, top, "serif", BODY, BODY_LH, COLORS.text, W),
        });
        const colW = (W - 36) / 2;
        const party = (p: { name: string; detail: string; role: string }, x: number, top: number): Op[] => {
          const ops: Op[] = [{ t: "line", x1: x, y1: top + 44, x2: x + colW, y2: top + 44, color: COLORS.text, width: 0.8 }];
          const nl = wrapText(clean(p.name), colW, m("sansBold", 9.5));
          const dl = p.detail ? wrapText(clean(p.detail), colW, m("sans", 8.5)) : [];
          ops.push(...textLines(nl, x, top + 48, "sansBold", 9.5, 12.5, COLORS.text, colW, "center"));
          ops.push(...textLines(dl, x, top + 48 + nl.length * 12.5, "sans", 8.5, 11.5, COLORS.muted, colW, "center"));
          ops.push(...textLines([p.role], x, top + 48 + nl.length * 12.5 + dl.length * 11.5, "sansBold", 8, 11.5, COLORS.brand, colW, "center"));
          return ops;
        };
        const nl1 = wrapText(clean(raw.contractor.name), colW, m("sansBold", 9.5)).length;
        const nl2 = wrapText(clean(raw.contracting.name), colW, m("sansBold", 9.5)).length;
        const dl1 = raw.contractor.detail ? wrapText(clean(raw.contractor.detail), colW, m("sans", 8.5)).length : 0;
        const dl2 = raw.contracting.detail ? wrapText(clean(raw.contracting.detail), colW, m("sans", 8.5)).length : 0;
        const sigH = 48 + Math.max(nl1 * 12.5 + dl1 * 11.5, nl2 * 12.5 + dl2 * 11.5) + 14;
        atoms.push({
          height: sigH,
          spaceBefore: 6,
          keepWithNext: raw.witnesses,
          draw: (top) => [...party(raw.contractor, X0, top), ...party(raw.contracting, X0 + colW + 36, top)],
        });
        if (raw.witnesses) {
          atoms.push({
            height: 18,
            spaceBefore: 8,
            keepWithNext: true,
            draw: (top) => textLines(["Testemunhas:"], X0, top, "sansBold", 8.5, 18, COLORS.muted, W),
          });
          atoms.push({
            height: 60,
            spaceBefore: 0,
            keepWithNext: false,
            draw: (top) => {
              const ops: Op[] = [];
              [0, 1].forEach((i) => {
                const x = X0 + i * (colW + 36);
                ops.push({ t: "line", x1: x, y1: top + 30, x2: x + colW, y2: top + 30, color: COLORS.text, width: 0.8 });
                ops.push(...textLines([`Testemunha ${i + 1}`, "Nome e CPF:"], x, top + 33, "sans", 8.5, 11.5, COLORS.muted, colW));
              });
              return ops;
            },
          });
        }
        break;
      }
    }

    // Fecho do contrato: tudo da última seção em diante é um grupo indivisível
    if (inFinalGroup) {
      for (let i = startLen; i < atoms.length; i++) atoms[i].keepWithNext = true;
    }
  });
  if (atoms.length) atoms[atoms.length - 1].keepWithNext = false;

  /** Linhas de chave/valor em duas colunas. */
  function pushKvRows(
    rowsData: KV[],
    x: number,
    width: number,
    labelFrac: number,
    framed: boolean,
    frame?: { frameX: number; frameW: number },
  ) {
    const labelW = width * labelFrac;
    const valueX = x + labelW + 8;
    const valueW = width - labelW - 8;
    const start = atoms.length;
    rowsData.forEach((row, idx) => {
      const labelLines = wrapText(clean(row.label), labelW, m("sans", 8.5));
      const valueLines = wrapText(clean(row.value), valueW, m("serif", 10));
      const lh = 13.4;
      const h = Math.max(labelLines.length * 11.8, valueLines.length * lh) + 7;
      const last = idx === rowsData.length - 1;
      atoms.push({
        height: h,
        spaceBefore: !framed && idx === 0 ? 3 : 0,
        keepWithNext: false,
        draw: (top) => {
          const ops: Op[] = [];
          if (framed && frame) {
            ops.push({ t: "line", x1: frame.frameX, y1: top, x2: frame.frameX, y2: top + h, color: COLORS.rule, width: 0.6 });
            ops.push({ t: "line", x1: frame.frameX + frame.frameW, y1: top, x2: frame.frameX + frame.frameW, y2: top + h, color: COLORS.rule, width: 0.6 });
          }
          ops.push(...textLines(labelLines, x, top + 3.5, "sans", 8.5, 11.8, COLORS.muted, labelW));
          ops.push(...textLines(valueLines, valueX, top + 3, "serif", 10, lh, COLORS.text, valueW));
          const lx1 = framed && frame ? frame.frameX : x;
          const lx2 = framed && frame ? frame.frameX + frame.frameW : x + width;
          ops.push({ t: "line", x1: lx1, y1: top + h, x2: lx2, y2: top + h, color: framed && last ? COLORS.rule : "#e6e7e0", width: 0.5 });
          return ops;
        },
      });
    });
    // grupos curtos ficam juntos
    if (atoms.length - start <= 9) for (let i = start; i < atoms.length - 1; i++) atoms[i].keepWithNext = true;
  }

  /* ---------------------------------------------------------------- */
  /* Paginação                                                         */
  /* ---------------------------------------------------------------- */
  const pages: PageLayout[] = [{ ops: [] }];
  let y = MARGIN_TOP;
  const topOfPage = (pageIdx: number) => (pageIdx === 0 ? MARGIN_TOP : MARGIN_TOP + 16);
  const available = (pageIdx: number) => CONTENT_BOTTOM - topOfPage(pageIdx);

  const newPage = () => {
    pages.push({ ops: [] });
    y = topOfPage(pages.length - 1);
  };
  const atTop = () => y === topOfPage(pages.length - 1);

  const place = (a: Atom) => {
    const sb = atTop() ? 0 : a.spaceBefore;
    const top = y + sb;
    pages[pages.length - 1].ops.push(...a.draw(top));
    y = top + a.height;
  };

  let i = 0;
  while (i < atoms.length) {
    // grupo = átomos encadeados por keepWithNext
    let j = i;
    while (j < atoms.length - 1 && atoms[j].keepWithNext) j++;
    const group = atoms.slice(i, j + 1);
    const groupH = group.reduce((acc, a, idx) => acc + a.height + (idx === 0 ? 0 : a.spaceBefore), 0);
    const firstSb = atoms[i].spaceBefore;

    const fits = () => y + (atTop() ? 0 : firstSb) + groupH <= CONTENT_BOTTOM + 0.01;
    if (fits()) {
      group.forEach(place);
    } else if (!atTop() && groupH <= available(pages.length - 1)) {
      newPage();
      group.forEach(place);
    } else {
      // grupo maior que uma página: coloca átomo por átomo
      for (const a of group) {
        if (y + (atTop() ? 0 : a.spaceBefore) + a.height > CONTENT_BOTTOM + 0.01 && !atTop()) newPage();
        place(a);
      }
    }
    i = j + 1;
  }

  /* ---------------------------------------------------------------- */
  /* Cabeçalho corrido, rodapé e marca d'água                          */
  /* ---------------------------------------------------------------- */
  const total = pages.length;
  pages.forEach((p, idx) => {
    if (idx > 0) {
      p.ops.push({
        t: "text",
        x: X0,
        y: MARGIN_TOP - 20,
        text: clean(`${opts.companyName} · Contrato nº ${opts.numberLabel}`),
        font: "sans",
        size: 8,
        color: COLORS.muted,
        width: W,
      });
      p.ops.push({ t: "line", x1: X0, y1: MARGIN_TOP - 12, x2: X0 + W, y2: MARGIN_TOP - 12, color: COLORS.rule, width: 0.5 });
    }
    p.ops.push({ t: "line", x1: X0, y1: FOOTER_Y - 12, x2: X0 + W, y2: FOOTER_Y - 12, color: COLORS.rule, width: 0.5 });
    p.ops.push({
      t: "text",
      x: X0,
      y: FOOTER_Y,
      text: clean(`Contrato nº ${opts.numberLabel}${opts.draft ? " — MINUTA" : ""}`),
      font: "sans",
      size: 8,
      color: COLORS.muted,
      width: W / 2,
    });
    p.ops.push({
      t: "text",
      x: X0 + W / 2,
      y: FOOTER_Y,
      text: `Página ${idx + 1} de ${total}`,
      font: "sans",
      size: 8,
      color: COLORS.muted,
      width: W / 2,
      align: "right",
    });
    if (opts.draft) p.ops.push({ t: "watermark", text: "MINUTA" });
  });

  return { pageWidth: PAGE_W, pageHeight: PAGE_H, pages };
}
