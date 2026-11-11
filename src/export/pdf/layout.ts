/**
 * Layout A4 PAISAGEM do plano de corte para a madeireira.
 *
 * Reaproveita o modelo de operações de desenho do PDF de contratos (texto, linhas, retângulos) e as mesmas fontes.
 * Os desenhos usam EXCLUSIVAMENTE os posicionamentos do modelo de exportação (que vêm do motor de corte).
 *
 * Páginas:
 *  1. Resumo: projeto, aviso de estimativa heurística, materiais/chapas e parâmetros (margem, serra, veio);
 *  2. (modo "plano") uma página por chapa: desenho em escala + legenda + sobras;
 *  3. Lista consolidada de peças;
 *  4. Fita de borda (seção separada).
 */
import {
  COLORS,
  sanitizeText,
  wrapText,
  type FontKey,
  type LaidOutDocument,
  type LayoutFonts,
  type Op,
  type PageLayout,
} from "@/contracts/pdf/layout";
import { isoToLocalDate, formatDateBR } from "@/contracts/dates";
import { formatNumber } from "@/lib/money";
import { ExportBlockedError, type ExportMaterial, type ExportModel, type ExportPiece, type ExportSheet } from "../model";
import { sortedPieces } from "../csv";

export type PlanMode = "plan" | "list";

export const PAGE_W = 841.89;
export const PAGE_H = 595.28;
export const MX = 36;
export const CW = PAGE_W - MX * 2;
export const TOP = 52;
export const BOTTOM = PAGE_H - 46;
export const FOOTER_Y = PAGE_H - 22;

const C = {
  ...COLORS,
  warnBg: "#fff4dc",
  warnLine: "#d9a441",
  warnText: "#6b4300",
  errBg: "#fbeceb",
  errLine: "#d98b86",
  errText: "#8f1d17",
  okBg: "#e3f3e9",
  okText: "#1f6b45",
  sheet: "#f3ede0",
  sheetLine: "#7d7255",
  zebra: "#f7f8f5",
};

const PALETTE = ["#cfe3d6", "#e8d9bd", "#d3dcec", "#efd3cf", "#dfe8c4", "#e5d1e8", "#c9e4e6", "#f0e2b6"];

export const HEURISTIC_NOTICE_TITLE = "Plano de corte ESTIMADO por algoritmo heurístico";
export const HEURISTIC_NOTICE =
  "Este plano foi calculado automaticamente por uma heurística de empacotamento com cortes guilhotinados. Ele não garante o menor " +
  "número possível de chapas nem a melhor sequência de cortes, e está sujeito à validação técnica da madeireira antes da execução " +
  "(medidas, sentido dos veios, espessura da serra, retalhos disponíveis e capacidade da seccionadora).";
export const FOOTER_NOTICE = "Plano estimado por algoritmo heurístico — sujeito à validação técnica da madeireira antes da execução.";

const mm = (n: number) => formatNumber(n, 1);

/** "2.400 × 550" */
const dims = (a: number, b: number) => `${mm(a)} × ${mm(b)}`;

export function layoutCutPlan(model: ExportModel, mode: PlanMode, fonts: LayoutFonts): LaidOutDocument {
  if (mode === "plan" && !model.valid) throw new ExportBlockedError(model.problems);

  const clean = (s: string) => sanitizeText(s, fonts.supports);
  const meas = (font: FontKey, size: number, s: string) => fonts.measure(font, size, s);
  const wrap = (s: string, w: number, font: FontKey, size: number) => wrapText(clean(s), w, (t) => meas(font, size, t));

  const pages: PageLayout[] = [{ ops: [] }];
  let y = TOP;
  const ops = () => pages[pages.length - 1].ops;
  const newPage = () => {
    pages.push({ ops: [] });
    y = TOP;
  };
  const ensure = (h: number) => {
    if (y + h > BOTTOM) newPage();
  };
  const baseline = (top: number, lh: number, size: number) => top + lh / 2 + size * 0.32;

  const text = (
    x: number,
    top: number,
    s: string,
    font: FontKey,
    size: number,
    color: string,
    width: number,
    align: "left" | "center" | "right" = "left",
    lh = size * 1.3,
  ): void => {
    ops().push({ t: "text", x, y: baseline(top, lh, size), text: clean(s), font, size, color, width, align });
  };

  /** Parágrafo com quebra de linha; devolve a altura usada. */
  const paragraph = (x: number, top: number, width: number, s: string, font: FontKey, size: number, color: string, lh = size * 1.38): number => {
    const lines = wrap(s, width, font, size);
    lines.forEach((l, i) => text(x, top + i * lh, l, font, size, color, width, "left", lh));
    return lines.length * lh;
  };
  const paragraphHeight = (width: number, s: string, font: FontKey, size: number, lh = size * 1.38) => wrap(s, width, font, size).length * lh;

  const heading = (title: string, extra = 70) => {
    ensure(26 + extra);
    ops().push({ t: "text", x: MX, y: baseline(y, 18, 12.5), text: clean(title), font: "sansBold", size: 12.5, color: C.brand, width: CW });
    ops().push({ t: "line", x1: MX, y1: y + 20, x2: MX + CW, y2: y + 20, color: C.rule, width: 0.7 });
    y += 28;
  };

  /* -------------------------- tabela com paginação -------------------------- */
  interface Col {
    label: string;
    w: number;
    align?: "left" | "right" | "center";
    font?: FontKey;
    bold?: boolean;
  }
  const table = (cols: Col[], rows: string[][], opts: { footer?: string[]; size?: number } = {}) => {
    const size = opts.size ?? 8.5;
    const lh = size * 1.32;
    const padX = 4;
    const padY = 3.4;
    const total = cols.reduce((a, c) => a + c.w, 0);
    const scaleW = CW / total;
    const widths = cols.map((c) => c.w * scaleW);

    const rowHeight = (cells: string[], font: FontKey) => Math.max(...cells.map((cell, i) => wrap(cell, widths[i] - padX * 2, font, size).length), 1) * lh + padY * 2;
    const drawRow = (cells: string[], top: number, h: number, kind: "header" | "body" | "footer", zebra: boolean) => {
      const font: FontKey = kind === "body" ? "sans" : "sansBold";
      if (kind === "header") ops().push({ t: "rect", x: MX, y: top, w: CW, h, fill: C.soft });
      else if (kind === "footer") ops().push({ t: "rect", x: MX, y: top, w: CW, h, fill: C.softer });
      else if (zebra) ops().push({ t: "rect", x: MX, y: top, w: CW, h, fill: C.zebra });
      let cx = MX;
      cells.forEach((cell, i) => {
        const col = cols[i];
        const lines = wrap(kind === "header" ? cell.toUpperCase() : cell, widths[i] - padX * 2, font, kind === "header" ? size - 0.8 : size);
        lines.forEach((l, k) =>
          text(cx + padX, top + padY + k * lh, l, font, kind === "header" ? size - 0.8 : size, kind === "header" ? C.muted : C.text, widths[i] - padX * 2, col.align ?? "left", lh),
        );
        cx += widths[i];
      });
      ops().push({ t: "line", x1: MX, y1: top + h, x2: MX + CW, y2: top + h, color: kind === "footer" ? C.brand : C.rule, width: kind === "footer" ? 1 : 0.5 });
    };

    const headerCells = cols.map((c) => c.label);
    const hh = rowHeight(headerCells.map((s) => s.toUpperCase()), "sansBold");
    const drawHeader = () => {
      drawRow(headerCells, y, hh, "header", false);
      y += hh;
    };
    const firstRowH = rows.length ? rowHeight(rows[0], "sans") : 0;
    ensure(hh + firstRowH + 2);
    drawHeader();
    rows.forEach((cells, idx) => {
      const h = rowHeight(cells, "sans");
      if (y + h > BOTTOM) {
        newPage();
        drawHeader(); // cabeçalho repetido a cada página
      }
      drawRow(cells, y, h, "body", idx % 2 === 1);
      y += h;
    });
    if (opts.footer) {
      const h = rowHeight(opts.footer, "sansBold");
      ensure(h);
      drawRow(opts.footer, y, h, "footer", false);
      y += h;
    }
    y += 8;
  };

  /* ---------------------------- caixas de aviso ---------------------------- */
  const noticeBox = (kind: "warn" | "error" | "ok", title: string, body: string, extraLines: string[] = []) => {
    const fill = kind === "warn" ? C.warnBg : kind === "error" ? C.errBg : C.okBg;
    const line = kind === "warn" ? C.warnLine : kind === "error" ? C.errLine : "#9cc9ad";
    const color = kind === "warn" ? C.warnText : kind === "error" ? C.errText : C.okText;
    const pad = 8;
    const inner = CW - pad * 2;
    const bodyH = body ? paragraphHeight(inner, body, "sans", 8.6, 11.8) : 0;
    const extraH = extraLines.reduce((a, l) => a + paragraphHeight(inner - 10, l, "sans", 8.6, 11.8), 0);
    const h = pad * 2 + 14 + bodyH + extraH + (extraLines.length ? 2 : 0);
    ensure(h + 4);
    ops().push({ t: "rect", x: MX, y, w: CW, h, fill, stroke: line, strokeWidth: 0.8 });
    text(MX + pad, y + pad, title, "sansBold", 9.6, color, inner, "left", 14);
    let cy = y + pad + 14;
    if (body) cy += paragraph(MX + pad, cy, inner, body, "sans", 8.6, color, 11.8);
    for (const l of extraLines) {
      ops().push({ t: "text", x: MX + pad, y: baseline(cy, 11.8, 8.6), text: "•", font: "sansBold", size: 8.6, color, width: 8 });
      cy += paragraph(MX + pad + 10, cy, inner - 10, l, "sans", 8.6, color, 11.8);
    }
    y += h + 8;
  };

  /* ================================ PÁGINA 1 ================================ */
  const isPlan = mode === "plan";
  const docTitle = isPlan ? "Plano de corte" : "Lista de peças";
  text(MX, y, docTitle, "sansBold", 21, C.text, CW * 0.6, "left", 26);
  text(MX + CW * 0.6, y + 4, `Gerado em ${formatDateBR(isoToLocalDate(model.meta.generatedAt))}`, "sans", 9, C.muted, CW * 0.4, "right");
  y += 28;
  const projLine = `Projeto: ${model.meta.projectName}`;
  text(MX, y, projLine, "sansSemi", 12.5, C.brand, CW * 0.72, "left", 17);
  text(MX + CW * 0.72, y, `Referência: ${model.meta.reference}`, "sansBold", 11, C.text, CW * 0.28, "right", 17);
  y += 20;
  const who = [model.meta.companyName && `Marcenaria: ${model.meta.companyName}`, model.meta.contact?.phone && `Telefone: ${model.meta.contact.phone}`, model.meta.contact?.email && `E-mail: ${model.meta.contact.email}`]
    .filter(Boolean)
    .join("   ·   ");
  if (who) {
    text(MX, y, who, "sans", 8.8, C.muted, CW, "left", 13);
    y += 16;
  }
  y += 4;

  if (!model.valid) {
    noticeBox(
      "error",
      isPlan ? "PLANO NÃO VALIDADO" : "ATENÇÃO: plano de corte NÃO validado — esta NÃO é um plano executável",
      "Foram encontrados problemas no plano de corte. Esta lista de peças contém apenas as medidas cadastradas; não há desenho de corte confiável.",
      model.problems.slice(0, 12).map((p) => p.message).concat(model.problems.length > 12 ? [`… e mais ${model.problems.length - 12} problema(s).`] : []),
    );
  }
  noticeBox("warn", isPlan ? HEURISTIC_NOTICE_TITLE : "Lista de peças (sem desenhos de corte)", isPlan ? HEURISTIC_NOTICE : "Esta lista não contém o desenho do plano de corte. Se houver plano, ele foi estimado por algoritmo heurístico e depende de validação técnica da madeireira antes da execução.");

  if (isPlan) {
    const totalPieces = model.pieces.reduce((a, p) => a + p.quantity, 0);
    const totalSheets = model.materials.reduce((a, m) => a + m.sheetsInPlan, 0);
    noticeBox(
      "ok",
      "Plano validado geometricamente",
      `Conferência automática antes da exportação: as ${totalPieces} peças (${model.pieces.length} tipos) estão posicionadas em ${totalSheets} chapa(s), dentro da área útil, sem sobreposição, respeitando margens, espessura da serra, rotação permitida e sentido dos veios. Os desenhos usam as posições reais calculadas pelo motor de corte.`,
    );
  }

  heading(isPlan ? "Materiais e chapas" : "Materiais", 60);
  const matCols: Col[] = isPlan
    ? [
        { label: "Material", w: 150 },
        { label: "Acabamento / cor", w: 100 },
        { label: "Espessura", w: 52, align: "right" },
        { label: "Chapa (C × L, mm)", w: 92, align: "right" },
        { label: "Margem", w: 46, align: "right" },
        { label: "Serra", w: 40, align: "right" },
        { label: "Veio", w: 92 },
        { label: "Chapas no plano", w: 58, align: "right" },
        { label: "Peças", w: 40, align: "right" },
        { label: "Aproveit.", w: 50, align: "right" },
      ]
    : [
        { label: "Material", w: 180 },
        { label: "Acabamento / cor", w: 120 },
        { label: "Espessura", w: 56, align: "right" },
        { label: "Chapa (C × L, mm)", w: 100, align: "right" },
        { label: "Margem", w: 56, align: "right" },
        { label: "Serra", w: 50, align: "right" },
        { label: "Veio", w: 110 },
        { label: "Peças", w: 50, align: "right" },
      ];
  const grainText = (g: boolean) => (g ? "Sim — no comprimento" : "Sem veio");
  const matRows = model.materials.map((m) =>
    isPlan
      ? [
          m.name,
          m.finish || "—",
          `${mm(m.thicknessMm)} mm`,
          dims(m.sheetLengthMm, m.sheetWidthMm),
          `${mm(m.marginMm)} mm`,
          `${mm(m.kerfMm)} mm`,
          grainText(m.grainRequired),
          String(m.sheetsInPlan),
          String(m.pieceCount),
          `${formatNumber(m.utilizationPercent, 1)}%`,
        ]
      : [m.name, m.finish || "—", `${mm(m.thicknessMm)} mm`, dims(m.sheetLengthMm, m.sheetWidthMm), `${mm(m.marginMm)} mm`, `${mm(m.kerfMm)} mm`, grainText(m.grainRequired), String(m.pieceCount)],
  );
  if (matRows.length === 0) {
    // lista sem plano (ex.: material não encontrado): usa as peças
    const names = [...new Set(model.pieces.map((p) => p.materialName))];
    names.forEach((n) => matRows.push(isPlan ? [n, "—", "—", "—", "—", "—", "—", "—", String(model.pieces.filter((p) => p.materialName === n).reduce((a, p) => a + p.quantity, 0)), "—"] : [n, "—", "—", "—", "—", "—", "—", String(model.pieces.filter((p) => p.materialName === n).reduce((a, p) => a + p.quantity, 0))]));
  }
  table(matCols, matRows, isPlan ? { footer: ["Total", "", "", "", "", "", "", String(model.materials.reduce((a, m) => a + m.sheetsInPlan, 0)), String(model.materials.reduce((a, m) => a + m.pieceCount, 0)), ""] } : undefined);

  const notes: string[] = [
    "Medidas em milímetros. C = comprimento da peça/chapa (eixo horizontal nos desenhos); L = largura.",
    "Sentido do veio: em materiais com veio, o comprimento da peça fica paralelo ao comprimento da chapa e a peça NÃO pode ser girada.",
  ];
  if (isPlan) {
    notes.push("“Margem” é o refilo descontado em cada borda da chapa; “Serra” é a espessura do corte entre peças. Ambos já estão considerados nos desenhos.");
    const reserves = model.materials.filter((m) => m.reserveSheets > 0);
    if (reserves.length) notes.push(`Reserva de material informada no projeto (chapas extras além do plano): ${reserves.map((m) => `${m.name} +${m.reserveSheets}`).join("; ")}.`);
  }
  for (const n of notes) {
    ensure(14);
    y += paragraph(MX, y, CW, `• ${n}`, "sans", 8.4, C.muted, 11.4);
  }

  /* ============================ PÁGINAS DAS CHAPAS ============================ */
  const colorOf = new Map(model.pieces.map((p, i) => [p.id, PALETTE[i % PALETTE.length]]));
  const pieceById = new Map(model.pieces.map((p) => [p.id, p]));

  if (isPlan) {
    for (const m of model.materials) {
      for (const sheet of m.sheets) drawSheetPage(m, sheet);
    }
  }

  function drawSheetPage(m: ExportMaterial, sheet: ExportSheet) {
    newPage();
    const L = m.sheetLengthMm;
    const W = m.sheetWidthMm;
    // título
    text(MX, y, `${m.name}${m.finish ? ` — ${m.finish}` : ""}`, "sansBold", 13, C.text, CW * 0.62, "left", 18);
    text(MX + CW * 0.62, y, `Chapa ${sheet.index} de ${m.sheetsInPlan}  ·  ${dims(L, W)} mm  ·  ${mm(m.thicknessMm)} mm`, "sansSemi", 10.5, C.brand, CW * 0.38, "right", 18);
    y += 22;

    const PANEL_W = 212;
    const x0 = MX + 14;
    const y0 = y + 14;
    const availW = CW - 14 - PANEL_W - 14;
    const availH = BOTTOM - y0 - 4;
    const scale = Math.min(availW / L, availH / W);
    const dw = L * scale;
    const dh = W * scale;

    // cotas externas
    const ctx = x0 + dw / 2;
    text(x0, y0 - 13, `${formatNumber(L, 0)} mm  (comprimento)`, "sans", 8, C.muted, dw, "center", 11);
    ops().push({ t: "line", x1: x0, y1: y0 - 3, x2: x0 + dw, y2: y0 - 3, color: C.muted, width: 0.5 });
    ops().push({ t: "line", x1: x0, y1: y0 - 6, x2: x0, y2: y0, color: C.muted, width: 0.5 });
    ops().push({ t: "line", x1: x0 + dw, y1: y0 - 6, x2: x0 + dw, y2: y0, color: C.muted, width: 0.5 });
    void ctx;
    {
      const label = `${formatNumber(W, 0)} mm  (largura)`;
      const tw = meas("sans", 8, clean(label));
      ops().push({ t: "text", x: x0 - 6, y: y0 + dh / 2 + tw / 2, text: clean(label), font: "sans", size: 8, color: C.muted, width: tw, rotate: 90 });
      ops().push({ t: "line", x1: x0 - 3, y1: y0, x2: x0 - 3, y2: y0 + dh, color: C.muted, width: 0.5 });
      ops().push({ t: "line", x1: x0 - 6, y1: y0, x2: x0, y2: y0, color: C.muted, width: 0.5 });
      ops().push({ t: "line", x1: x0 - 6, y1: y0 + dh, x2: x0, y2: y0 + dh, color: C.muted, width: 0.5 });
    }

    // chapa + área útil
    ops().push({ t: "rect", x: x0, y: y0, w: dw, h: dh, fill: "#e4dcc6", stroke: C.sheetLine, strokeWidth: 1, tag: `sheet:${m.id}:${sheet.index}` });
    ops().push({ t: "rect", x: x0 + m.marginMm * scale, y: y0 + m.marginMm * scale, w: (L - 2 * m.marginMm) * scale, h: (W - 2 * m.marginMm) * scale, fill: C.sheet, stroke: "#a39878", strokeWidth: 0.5, dash: [3, 2] });

    // sobras (hachura)
    for (const r of sheet.regions) {
      const rx = x0 + r.x * scale;
      const ry = y0 + r.y * scale;
      const rw = r.w * scale;
      const rh = r.h * scale;
      ops().push({ t: "rect", x: rx, y: ry, w: rw, h: rh, fill: r.reusable ? "#e2f2e8" : "#ece9df", stroke: r.reusable ? "#2f8a5b" : "#b9b3a2", strokeWidth: r.reusable ? 0.9 : 0.4, dash: r.reusable ? [4, 2] : undefined, tag: r.code ? `sobra:${r.code}` : "sobra:pequena" });
      for (const seg of hatch(rx, ry, rw, rh, r.reusable ? 5 : 6)) ops().push({ t: "line", ...seg, color: r.reusable ? "#7fbf9a" : "#cdc8b8", width: 0.35 });
      if (r.code && rw >= 26 && rh >= 11) {
        const label = r.code;
        const size = 8;
        const tw = meas("sansBold", size, label);
        ops().push({ t: "rect", x: rx + rw / 2 - tw / 2 - 2, y: ry + rh / 2 - size / 2 - 1.5, w: tw + 4, h: size + 3, fill: "#ffffff" });
        ops().push({ t: "text", x: rx, y: baseline(ry + rh / 2 - 6, 12, size), text: label, font: "sansBold", size, color: "#1f5c3d", width: rw, align: "center" });
      }
    }

    // peças — posições reais do plano
    const unlabeled: typeof sheet.placements = [];
    for (const p of sheet.placements) {
      const rx = x0 + p.x * scale;
      const ry = y0 + p.y * scale;
      const rw = p.w * scale;
      const rh = p.h * scale;
      ops().push({ t: "rect", x: rx, y: ry, w: rw, h: rh, fill: colorOf.get(p.pieceId) ?? PALETTE[0], stroke: C.brand, strokeWidth: 0.7, tag: `piece:${p.code}` });
      const label = p.rotated ? `${p.code}*` : p.code;
      const dimText = `${formatNumber(p.w, 0)}×${formatNumber(p.h, 0)}`;
      const placed = placeLabel(rx, ry, rw, rh, label, dimText);
      if (!placed) unlabeled.push(p);
      if (m.grainRequired && rw >= 34 && rh >= 26) arrow(rx + rw / 2 - 9, ry + rh - 6, 18);
    }

    /* ------------------------------ painel direito ------------------------------ */
    const px = MX + CW - PANEL_W;
    let py = y;
    const kv = (k: string, v: string) => {
      const kw = 62;
      const lines = wrap(v, PANEL_W - kw - 4, "sans", 8.2);
      text(px, py, k, "sans", 8, C.muted, kw, "left", 11.4);
      lines.forEach((l, i) => text(px + kw, py + i * 11.4, l, "sansSemi", 8.2, C.text, PANEL_W - kw, "left", 11.4));
      py += Math.max(lines.length, 1) * 11.4 + 1.5;
    };
    ops().push({ t: "text", x: px, y: baseline(py, 13, 9), text: "DADOS DA CHAPA", font: "sansBold", size: 8.6, color: C.brand, width: PANEL_W });
    py += 15;
    kv("Chapa", `${dims(L, W)} mm`);
    kv("Área útil", `${dims(m.usableLengthMm, m.usableWidthMm)} mm`);
    kv("Margem", `${mm(m.marginMm)} mm em cada borda`);
    kv("Serra", `${mm(m.kerfMm)} mm`);
    kv("Veio", m.grainRequired ? "no comprimento (→) — peças não giram" : "sem veio obrigatório");
    if (m.grainRequired) {
      arrow(px + 62, py + 4, 46);
      text(px + 114, py - 1, "sentido do veio", "sans", 7.6, C.muted, 90, "left", 10);
      py += 12;
    }
    py += 4;

    // legenda: peças desta chapa agrupadas por tipo
    const groups = new Map<string, { code: string; count: number; rotated: number; piece: ExportPiece }>();
    for (const p of sheet.placements) {
      const g = groups.get(p.pieceId);
      const piece = pieceById.get(p.pieceId)!;
      if (g) {
        g.count++;
        if (p.rotated) g.rotated++;
      } else groups.set(p.pieceId, { code: p.code, count: 1, rotated: p.rotated ? 1 : 0, piece });
    }
    const legend = [...groups.values()];
    ops().push({ t: "text", x: px, y: baseline(py, 13, 8.6), text: clean(`PEÇAS NESTA CHAPA (${sheet.placements.length}) · MEDIDAS EM mm`), font: "sansBold", size: 8.6, color: C.brand, width: PANEL_W });
    py += 15;
    const overflowLegend: typeof legend = [];
    const rowH = 11.6;
    const reserveForSobras = 56;
    for (const g of legend) {
      if (py + rowH > BOTTOM - reserveForSobras) {
        overflowLegend.push(g);
        continue;
      }
      ops().push({ t: "rect", x: px, y: py + 1.6, w: 8, h: 8, fill: colorOf.get(g.piece.id), stroke: C.brand, strokeWidth: 0.4 });
      text(px + 12, py, g.code, "sansBold", 8, C.text, 40, "left", rowH);
      text(px + 52, py, `${dims(g.piece.lengthMm, g.piece.widthMm)}${g.rotated ? `  (${g.rotated} girada${g.rotated > 1 ? "s" : ""}*)` : ""}`, "sans", 7.8, C.text, PANEL_W - 52 - 28, "left", rowH);
      text(px + PANEL_W - 26, py, `${g.count}×`, "sansBold", 8, C.text, 26, "right", rowH);
      py += rowH;
    }
    if (overflowLegend.length) {
      text(px, py, `+ ${overflowLegend.length} tipo(s): ver legenda na próxima página`, "sans", 7.6, C.muted, PANEL_W, "left", rowH);
      py += rowH;
    }
    py += 5;

    // sobras
    const reusable = sheet.regions.filter((r) => r.reusable);
    const small = sheet.regions.filter((r) => !r.reusable);
    ops().push({ t: "text", x: px, y: baseline(py, 13, 8.6), text: "SOBRAS", font: "sansBold", size: 8.6, color: C.brand, width: PANEL_W });
    py += 15;
    const overflowSobras: typeof reusable = [];
    if (reusable.length === 0) {
      text(px, py, "Nenhuma sobra reaproveitável.", "sans", 7.8, C.muted, PANEL_W, "left", rowH);
      py += rowH;
    }
    for (const r of reusable) {
      if (py + rowH > BOTTOM) {
        overflowSobras.push(r);
        continue;
      }
      text(px, py, r.code ?? "", "sansBold", 8, "#1f5c3d", 22, "left", rowH);
      text(px + 24, py, `${dims(Math.max(r.w, r.h), Math.min(r.w, r.h))} mm  (${formatNumber(r.areaMm2 / 1_000_000, 2, 2)} m²)`, "sans", 7.8, C.text, PANEL_W - 24, "left", rowH);
      py += rowH;
    }
    if (small.length && py + rowH <= BOTTOM) {
      text(px, py, `${small.length} sobra(s) pequena(s) — não reaproveitável(is)`, "sans", 7.6, C.muted, PANEL_W, "left", rowH);
      py += rowH;
    }
    if (overflowSobras.length && py + rowH <= BOTTOM) text(px, py, `+ ${overflowSobras.length} sobra(s): ver próxima página`, "sans", 7.6, C.muted, PANEL_W, "left", rowH);

    // legenda do desenho
    const hasRot = sheet.placements.some((p) => p.rotated);
    const foot = ["Medidas em milímetros (mm).", "Hachura verde: sobra reaproveitável · hachura cinza: sobra pequena · tracejado interno: margem/refilo.", hasRot ? "* peça girada 90° em relação ao cadastro." : ""].filter(Boolean).join(" ");
    const fh = paragraphHeight(availW + 14, foot, "sans", 7.4, 10);
    if (y0 + dh + 4 + fh <= BOTTOM + 14) paragraph(MX + 14, y0 + dh + 4, availW, foot, "sans", 7.4, C.muted, 10);

    // continuação: legenda extra e posições das peças sem rótulo
    if (overflowLegend.length || overflowSobras.length || unlabeled.length) {
      newPage();
      text(MX, y, `${m.name} — Chapa ${sheet.index} de ${m.sheetsInPlan} (continuação)`, "sansBold", 12, C.text, CW, "left", 17);
      y += 24;
      if (overflowLegend.length) {
        heading("Peças desta chapa (continuação da legenda)", 40);
        table(
          [{ label: "Código", w: 60 }, { label: "Medidas (C × L, mm)", w: 140 }, { label: "Qtd nesta chapa", w: 80, align: "right" }, { label: "Giradas", w: 60, align: "right" }],
          overflowLegend.map((g) => [g.code, dims(g.piece.lengthMm, g.piece.widthMm), String(g.count), String(g.rotated)]),
        );
      }
      if (overflowSobras.length) {
        heading("Sobras reaproveitáveis (continuação)", 40);
        table(
          [{ label: "Sobra", w: 60 }, { label: "Medidas (mm)", w: 140 }, { label: "Área (m²)", w: 80, align: "right" }, { label: "Posição x, y (mm)", w: 120 }],
          overflowSobras.map((r) => [r.code ?? "", dims(Math.max(r.w, r.h), Math.min(r.w, r.h)), formatNumber(r.areaMm2 / 1_000_000, 2, 2), `${formatNumber(r.x, 0)}, ${formatNumber(r.y, 0)}`]),
        );
      }
      if (unlabeled.length) {
        heading("Peças pequenas demais para rotular no desenho — posições", 40);
        table(
          [{ label: "Código", w: 60 }, { label: "Medidas no desenho (mm)", w: 140 }, { label: "Posição x, y (mm)", w: 120 }, { label: "Girada", w: 60 }],
          unlabeled.map((p) => [p.code, `${formatNumber(p.w, 0)} × ${formatNumber(p.h, 0)}`, `${formatNumber(p.x, 0)}, ${formatNumber(p.y, 0)}`, p.rotated ? "Sim" : "Não"]),
        );
        paragraph(MX, y, CW, "Posição = canto superior esquerdo da peça, medido a partir do canto superior esquerdo da chapa.", "sans", 8, C.muted, 11);
        y += 14;
      }
    }
  }

  /** Rótulo dentro do retângulo; devolve false se nem o código couber. */
  function placeLabel(rx: number, ry: number, rw: number, rh: number, label: string, dimText: string): boolean {
    for (const size of [9, 8, 7, 6, 5]) {
      const cw = meas("sansBold", size, clean(label));
      const fitsH = cw + 3 <= rw && size + 2 <= rh;
      if (fitsH) {
        const dsz = Math.max(5, size - 1.5);
        const dw = meas("sans", dsz, dimText);
        const withDims = dw + 3 <= rw && size + dsz + 4 <= rh;
        if (withDims) {
          ops().push({ t: "text", x: rx, y: ry + rh / 2 - 1.2, text: clean(label), font: "sansBold", size, color: "#14281f", width: rw, align: "center" });
          ops().push({ t: "text", x: rx, y: ry + rh / 2 + dsz + 0.4, text: dimText, font: "sans", size: dsz, color: "#2b4a3a", width: rw, align: "center" });
        } else {
          ops().push({ t: "text", x: rx, y: ry + rh / 2 + size * 0.32, text: clean(label), font: "sansBold", size, color: "#14281f", width: rw, align: "center" });
        }
        return true;
      }
    }
    // peça estreita e alta: código na vertical
    for (const size of [9, 8, 7, 6, 5]) {
      const cw = meas("sansBold", size, clean(label));
      if (cw + 3 <= rh && size + 2 <= rw) {
        ops().push({ t: "text", x: rx + rw / 2 + size * 0.32, y: ry + rh / 2 + cw / 2, text: clean(label), font: "sansBold", size, color: "#14281f", width: cw, rotate: 90 });
        return true;
      }
    }
    return false;
  }

  /** Seta horizontal →  (sentido do veio). */
  function arrow(x: number, yy: number, len: number) {
    const col = "#3a4a40";
    ops().push({ t: "line", x1: x, y1: yy, x2: x + len, y2: yy, color: col, width: 0.8 });
    ops().push({ t: "line", x1: x + len, y1: yy, x2: x + len - 4, y2: yy - 2.2, color: col, width: 0.8 });
    ops().push({ t: "line", x1: x + len, y1: yy, x2: x + len - 4, y2: yy + 2.2, color: col, width: 0.8 });
  }

  /* ========================== LISTA CONSOLIDADA DE PEÇAS ========================== */
  newPage();
  const sorted = sortedPieces(model);
  const totalQty = sorted.reduce((a, p) => a + p.quantity, 0);
  heading(`Lista consolidada de peças — ${sorted.length} tipo(s), ${totalQty} unidade(s)`, 60);
  table(
    [
      { label: "Código", w: 46 },
      { label: "Descrição", w: 170 },
      { label: "Material", w: 150 },
      { label: "Compr. (mm)", w: 58, align: "right" },
      { label: "Larg. (mm)", w: 54, align: "right" },
      { label: "Qtd", w: 34, align: "right" },
      { label: "Gira 90°", w: 40 },
      { label: "Veio", w: 62 },
      { label: "Observações", w: 156 },
    ],
    sorted.map((p) => [
      p.code,
      p.description || "—",
      `${p.materialName}${p.finish ? ` (${p.finish})` : ""} · ${mm(p.thicknessMm)} mm`,
      mm(p.lengthMm),
      mm(p.widthMm),
      String(p.quantity),
      p.rotationAllowed ? "Sim" : "Não",
      p.grainRequired ? "No comprimento" : "Sem veio",
      p.notes || "—",
    ]),
    { footer: ["Total", "", "", "", "", String(totalQty), "", "", ""] },
  );

  /* ================================ FITA DE BORDA ================================ */
  heading("Fita de borda", 90);
  const withTape = sorted.filter((p) => EDGE_KEYS.some((k) => p.edges[k]));
  paragraph(MX, y, CW, "Convenção das bordas: C1 e C2 são as bordas de COMPRIMENTO (superior e inferior); L1 e L2 são as bordas de LARGURA (esquerda e direita), com a peça vista com o comprimento na horizontal. O número entre parênteses é o comprimento da borda em mm.", "sans", 8.2, C.muted, 11.2);
  y += paragraphHeight(CW, "Convenção das bordas: C1 e C2 são as bordas de COMPRIMENTO (superior e inferior); L1 e L2 são as bordas de LARGURA (esquerda e direita), com a peça vista com o comprimento na horizontal. O número entre parênteses é o comprimento da borda em mm.", "sans", 8.2, 11.2) + 6;
  if (withTape.length === 0) {
    ensure(16);
    text(MX, y, "Nenhuma peça deste projeto recebe fita de borda.", "sansSemi", 9.5, C.text, CW);
    y += 20;
  } else {
    const edgeCell = (p: ExportPiece, k: (typeof EDGE_KEYS)[number]) => {
      const name = p.edges[k];
      if (!name) return "—";
      const len = k === "top" || k === "bottom" ? p.lengthMm : p.widthMm;
      return `${name} (${mm(len)})`;
    };
    table(
      [
        { label: "Código", w: 44 },
        { label: "Peça", w: 128 },
        { label: "C × L (mm)", w: 74 },
        { label: "Qtd", w: 28, align: "right" },
        { label: "C1 · superior", w: 108 },
        { label: "C2 · inferior", w: 108 },
        { label: "L1 · esquerda", w: 108 },
        { label: "L2 · direita", w: 108 },
        { label: "Fita total (m)", w: 52, align: "right" },
      ],
      withTape.map((p) => [p.code, p.description || "—", dims(p.lengthMm, p.widthMm), String(p.quantity), edgeCell(p, "top"), edgeCell(p, "bottom"), edgeCell(p, "left"), edgeCell(p, "right"), formatNumber((p.tapeMmPerUnit * p.quantity) / 1000, 2, 2)]),
    );
    heading("Total de fita por tipo", 40);
    table(
      [
        { label: "Fita", w: 200 },
        { label: "Cor", w: 110 },
        { label: "Largura × espessura (mm)", w: 130 },
        { label: "Metros líquidos", w: 90, align: "right" },
        { label: "Perda prevista", w: 80, align: "right" },
        { label: "Metros com perda", w: 100, align: "right" },
      ],
      model.tapes.map((t) => [t.name, t.color || "—", `${mm(t.widthMm)} × ${mm(t.thicknessMm)}`, formatNumber(t.netMm / 1000, 2, 2), `${formatNumber(t.wastePercent, 1)}%`, formatNumber(t.grossMm / 1000, 2, 2)]),
    );
  }

  /* ---------------------- cabeçalho, rodapé e numeração ---------------------- */
  const total = pages.length;
  const sub = `${clean(model.meta.projectName)} · Ref. ${clean(model.meta.reference)}`;
  pages.forEach((p, i) => {
    p.ops.push({ t: "text", x: MX, y: 30, text: clean(`${docTitle.toUpperCase()} · ${sub} · MEDIDAS EM mm`), font: "sansBold", size: 8, color: C.muted, width: CW * 0.75 });
    p.ops.push({ t: "text", x: MX + CW * 0.75, y: 30, text: clean(model.valid || !isPlan ? "" : "NÃO VALIDADO"), font: "sansBold", size: 8, color: C.errText, width: CW * 0.25, align: "right" });
    p.ops.push({ t: "line", x1: MX, y1: 36, x2: MX + CW, y2: 36, color: C.rule, width: 0.5 });
    p.ops.push({ t: "line", x1: MX, y1: FOOTER_Y - 12, x2: MX + CW, y2: FOOTER_Y - 12, color: C.rule, width: 0.5 });
    p.ops.push({ t: "text", x: MX, y: FOOTER_Y, text: clean(model.valid ? FOOTER_NOTICE : "PLANO NÃO VALIDADO — esta lista não é um plano de corte executável."), font: "sans", size: 7.4, color: model.valid ? C.muted : C.errText, width: CW * 0.82 });
    p.ops.push({ t: "text", x: MX + CW * 0.82, y: FOOTER_Y, text: `Página ${i + 1} de ${total}`, font: "sans", size: 7.8, color: C.muted, width: CW * 0.18, align: "right" });
  });

  return { pageWidth: PAGE_W, pageHeight: PAGE_H, pages };
}

const EDGE_KEYS = ["top", "bottom", "left", "right"] as const;

/** Segmentos de hachura a 45° recortados dentro do retângulo. */
export function hatch(x: number, y: number, w: number, h: number, spacing: number): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const out: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  if (w <= 0 || h <= 0) return out;
  for (let d = spacing; d < w + h; d += spacing) {
    const t0 = Math.max(0, d - w);
    const t1 = Math.min(h, d);
    if (t1 - t0 > 0.5) out.push({ x1: x + d - t0, y1: y + t0, x2: x + d - t1, y2: y + t1 });
  }
  return out;
}

export type { Op };
