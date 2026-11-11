import { beforeAll, describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument } from "pdf-lib";
import { calculateProject } from "@/engine/project-calc";
import { buildExportModel, crossCheckModel, defaultReference, ExportBlockedError, pieceCodes, type ExportModel } from "@/export/model";
import { CSV_BOM, CSV_HEADERS, buildPartsCsv, csvNumber, csvText } from "@/export/csv";
import { GENERIC_CSV_ID, exportFileName, getPartsExporter, listPartsExporters, registerPartsExporter } from "@/export/exporters";
import { generateCutPlanPdf, layoutCutPlanPreview } from "@/export/pdf/generate";
import { MX, PAGE_H, PAGE_W } from "@/export/pdf/layout";
import type { FontBytes } from "@/contracts/pdf/fonts";
import { mat, piece, project } from "./helpers";
import { fontBytesFromDisk } from "./contract-helpers";
import { SECRETS, exportProject } from "./export-helpers";

let fonts: FontBytes;
beforeAll(() => {
  fonts = fontBytesFromDisk();
});

const opts = { projectName: "Guarda-roupa do casal", reference: "P-0003", companyName: "Silva Marcenaria", now: new Date("2026-11-10T15:00:00Z") };
const squash = (s: string) => s.replace(/\s+/g, " ");

async function extractText(bytes: Uint8Array): Promise<string> {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  await task.destroy();
  return squash(out.join(" "));
}

describe("modelo de exportação — conteúdo", () => {
  it("traz projeto, referência, materiais, chapas e parâmetros (margem, serra, veio)", () => {
    const model = buildExportModel(exportProject(), opts);
    expect(model.valid).toBe(true);
    expect(model.meta).toMatchObject({ projectName: "Guarda-roupa do casal", reference: "P-0003", companyName: "Silva Marcenaria", contact: null });
    expect(model.materials.map((m) => m.name)).toEqual(["MDF Branco 15 mm", "MDF Amadeirado 18 mm", "MDF Branco 6 mm (fundos)"]);
    const amad = model.materials[1];
    expect(amad).toMatchObject({ finish: "Carvalho", thicknessMm: 18, sheetLengthMm: 2750, sheetWidthMm: 1850, marginMm: 10, kerfMm: 3, grainRequired: true, usableLengthMm: 2730, usableWidthMm: 1830 });
    expect(model.materials[0].grainRequired).toBe(false);
    expect(model.pieces).toHaveLength(9);
  });

  it("códigos de peça são únicos: usa a referência, senão P1, P2…; duplicatas ganham sufixo", () => {
    const m = mat();
    const ps = [piece(m.id, 100, 100, { ref: "A1" }), piece(m.id, 100, 100, { ref: "A1" }), piece(m.id, 100, 100), piece(m.id, 100, 100, { ref: "P3" })];
    const codes = pieceCodes(ps);
    const list = ps.map((p) => codes.get(p.id));
    expect(new Set(list).size).toBe(4);
    expect(list.slice(0, 3)).toEqual(["A1", "A1-2", "P3"]);
    expect(list[3]).toBe("P3-2");
  });

  it("referência padrão: número do projeto ou prefixo do id", () => {
    expect(defaultReference({ id: "abcdef12-3456", number: 7 })).toBe("P-0007");
    expect(defaultReference({ id: "abcdef12-3456" })).toBe("ABCDEF");
  });

  it("não altera o projeto (dados preservados)", () => {
    const p = exportProject();
    const before = JSON.stringify(p);
    buildExportModel(p, opts);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe("correspondência entre desenho, peças cadastradas e quantitativos", () => {
  it("cada peça cadastrada aparece nas chapas exatamente 'quantidade' vezes, com as medidas certas", () => {
    const p = exportProject();
    const model = buildExportModel(p, opts);
    for (const piece of model.pieces) {
      const mat = model.materials.find((m) => m.id === piece.materialId)!;
      const placed = mat.sheets.flatMap((s) => s.placements).filter((pl) => pl.pieceId === piece.id);
      expect(placed, piece.code).toHaveLength(piece.quantity);
      for (const pl of placed) {
        expect(pl.code).toBe(piece.code);
        expect([pl.w, pl.h]).toEqual(pl.rotated ? [piece.widthMm, piece.lengthMm] : [piece.lengthMm, piece.widthMm]);
        if (piece.grainRequired) expect(pl.rotated).toBe(false);
        if (!piece.rotationAllowed) expect(pl.rotated).toBe(false);
      }
    }
  });

  it("posições vêm do motor: idênticas às do plano calculado", () => {
    const p = exportProject();
    const calc = calculateProject(p);
    const model = buildExportModel(p, opts);
    calc.cut.materials.forEach((r, i) => {
      expect(model.materials[i].sheetsInPlan).toBe(r.sheetsUsed);
      r.sheets.forEach((s, si) => {
        expect(model.materials[i].sheets[si].placements.map((x) => [x.x, x.y, x.w, x.h, x.rotated])).toEqual(s.placements.map((x) => [x.x, x.y, x.w, x.h, x.rotated]));
      });
    });
  });

  it("o desenho do PDF tem 1 retângulo por peça posicionada, por chapa, com o código correto", async () => {
    const model = buildExportModel(exportProject(), opts);
    const layout = await layoutCutPlanPreview(model, "plan", fonts);
    const tags = layout.pages.flatMap((pg) => pg.ops).flatMap((o) => (o.t === "rect" && o.tag ? [o.tag] : []));
    // chapas
    expect(tags.filter((t) => t.startsWith("sheet:"))).toHaveLength(model.materials.reduce((a, m) => a + m.sheetsInPlan, 0));
    // peças: contagem por código = quantidade cadastrada
    for (const piece of model.pieces) {
      expect(tags.filter((t) => t === `piece:${piece.code}`), piece.code).toHaveLength(piece.quantity);
    }
    expect(tags.filter((t) => t.startsWith("piece:"))).toHaveLength(model.pieces.reduce((a, pc) => a + pc.quantity, 0));
    // sobras reaproveitáveis têm código
    const reusable = model.materials.flatMap((m) => m.sheets.flatMap((s) => s.regions.filter((r) => r.reusable)));
    expect(tags.filter((t) => /^sobra:S\d+$/.test(t))).toHaveLength(reusable.length);
    expect(reusable.every((r) => r.code)).toBe(true);
  });

  it("totais: peças, chapas e fita iguais aos do cálculo do projeto", () => {
    const p = exportProject();
    const calc = calculateProject(p);
    const model = buildExportModel(p, opts);
    expect(model.materials.reduce((a, m) => a + m.sheetsInPlan, 0)).toBe(calc.cut.totalSheetsUsed);
    expect(model.materials.reduce((a, m) => a + m.pieceCount, 0)).toBe(calc.pieceCount);
    expect(model.tapes.reduce((a, t) => a + t.grossMm, 0)).toBeCloseTo(calc.tape.totalGrossMm, 6);
    expect(model.materials.map((m) => m.reserveSheets)).toEqual(calc.cut.materials.map((r) => r.reserveSheets));
  });
});

describe("validação antes de exportar", () => {
  it("peça maior que a chapa → inválido, com o problema descrito; plano é bloqueado", async () => {
    const m = mat({ name: "MDF" });
    const p = project({ materials: [m], pieces: [piece(m.id, 3500, 500, { description: "Painel gigante" }), piece(m.id, 500, 500, { description: "Pequena" })] });
    const model = buildExportModel(p, opts);
    expect(model.valid).toBe(false);
    expect(model.problems.some((x) => /Painel gigante/.test(x.message))).toBe(true);
    await expect(generateCutPlanPdf(model, "plan", fonts)).rejects.toBeInstanceOf(ExportBlockedError);
    await expect(layoutCutPlanPreview(model, "plan", fonts)).rejects.toThrow(/bloqueada/);
  });

  it("lista de peças de plano inválido sai com aviso explícito de 'plano não validado'", async () => {
    const m = mat();
    const model = buildExportModel(project({ materials: [m], pieces: [piece(m.id, 3500, 500, { description: "Painel gigante" })] }), opts);
    const { bytes } = await generateCutPlanPdf(model, "list", fonts);
    const text = await extractText(bytes);
    expect(text).toContain("NÃO validado");
    expect(text).toContain("NÃO é um plano executável");
    expect(exportFileName(model, "lista", "pdf")).toContain("PLANO-NAO-VALIDADO");
  });

  it("sem peças, material ausente e fita removida também invalidam", () => {
    expect(buildExportModel(project(), opts).valid).toBe(false);
    const m = mat();
    const orphan = buildExportModel(project({ materials: [m], pieces: [piece("nao-existe", 500, 500)] }), opts);
    expect(orphan.valid).toBe(false);
    const noTape = buildExportModel(project({ materials: [m], pieces: [piece(m.id, 500, 500, { edges: { top: "sumiu", bottom: null, left: null, right: null } })] }), opts);
    expect(noTape.valid).toBe(false);
  });

  it("conferência independente detecta sobreposição, fora da área útil, rotação indevida, medidas e quantidades erradas", () => {
    const base = () => structuredClone(buildExportModel(exportProject(), opts));
    const first = (mo: ExportModel) => mo.materials[0].sheets[0].placements;

    let mo = base();
    first(mo)[1] = { ...first(mo)[1], x: first(mo)[0].x + 5, y: first(mo)[0].y + 5 };
    expect(crossCheckModel(mo).some((p) => /sobrep/.test(p.message))).toBe(true);

    mo = base();
    first(mo)[0] = { ...first(mo)[0], x: 1 };
    expect(crossCheckModel(mo).some((p) => /área útil/.test(p.message))).toBe(true);

    mo = base();
    first(mo)[0] = { ...first(mo)[0], w: first(mo)[0].w + 10 };
    expect(crossCheckModel(mo).some((p) => /medidas diferentes/.test(p.message))).toBe(true);

    mo = base(); // rotação em material com veio
    const g = mo.materials[1].sheets[0].placements;
    g[0] = { ...g[0], rotated: true, w: g[0].h, h: g[0].w };
    expect(crossCheckModel(mo).some((p) => /rotação não é permitida/.test(p.message))).toBe(true);

    mo = base(); // peça removida do desenho
    mo.materials[0].sheets[0].placements.pop();
    expect(crossCheckModel(mo).some((p) => /cadastrada/.test(p.message))).toBe(true);

    mo = base();
    mo.materials[0].sheets[0].placements.push({ ...mo.materials[0].sheets[0].placements[0], pieceId: "fantasma", code: "Z9" });
    expect(crossCheckModel(mo).some((p) => /não corresponde/.test(p.message))).toBe(true);
  });

  it("projeto válido passa na conferência sem problemas", () => {
    const mo = buildExportModel(exportProject(), opts);
    expect(crossCheckModel(mo)).toEqual([]);
    expect(mo.problems).toEqual([]);
  });
});

describe("PDF do plano de corte", () => {
  it("é um PDF A4 paisagem válido, com 1 resumo + 1 página por chapa + lista + fita", async () => {
    const model = buildExportModel(exportProject(), opts);
    const { bytes, layout } = await generateCutPlanPdf(model, "plan", fonts);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(layout.pages.length);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(841.89, 1);
    expect(height).toBeCloseTo(595.28, 1);
    const sheets = model.materials.reduce((a, m) => a + m.sheetsInPlan, 0);
    expect(layout.pages.length).toBeGreaterThanOrEqual(1 + sheets + 2);
    expect(doc.getCreationDate()?.toISOString()).toBe("2026-11-10T15:00:00.000Z");
  });

  it("texto: projeto, materiais, chapas, margem/serra, veio, sobras, lista, fita, aviso heurístico e unidade em mm", async () => {
    const model = buildExportModel(exportProject(), opts);
    const { bytes } = await generateCutPlanPdf(model, "plan", fonts);
    const text = await extractText(bytes);
    for (const s of [
      "Plano de corte",
      "Guarda-roupa do casal",
      "P-0003",
      "Silva Marcenaria",
      "MDF Branco 15 mm",
      "MDF Amadeirado 18 mm",
      "Carvalho",
      "2.750 × 1.850",
      "Margem",
      "Serra",
      "10 mm",
      "3 mm",
      "Sim — no comprimento",
      "sentido do veio",
      "Chapa 1 de 3",
      "SOBRAS",
      "Lista consolidada de peças",
      "Fita de borda",
      "Total de fita por tipo",
      "ESTIMADO por algoritmo heurístico",
      "validação técnica da madeireira",
      "Medidas em milímetros",
      "Plano validado geometricamente",
      "Furação para dobradiças",
      "Página 1 de",
      "2.400 × 550", // peça em mm
    ]) {
      expect(text, s).toContain(s);
    }
    // todos os códigos aparecem no documento
    for (const p of model.pieces) expect(text).toContain(p.code);
  });

  it("sentido do veio só nos materiais com veio; peças giradas ficam marcadas", async () => {
    const model = buildExportModel(exportProject(), opts);
    expect(model.materials.filter((m) => m.grainRequired).map((m) => m.name)).toEqual(["MDF Amadeirado 18 mm"]);
    for (const s of model.materials[1].sheets) expect(s.placements.every((p) => !p.rotated)).toBe(true);
    const rotated = model.materials.flatMap((m) => m.sheets.flatMap((s) => s.placements)).filter((p) => p.rotated);
    if (rotated.length > 0) {
      const { bytes } = await generateCutPlanPdf(model, "plan", fonts);
      expect(await extractText(bytes)).toContain("girada");
    }
  });

  it("geometria: nada fora da página/margens e rótulos dentro das peças", async () => {
    for (const mode of ["plan", "list"] as const) {
      const layout = await layoutCutPlanPreview(buildExportModel(exportProject(), opts), mode, fonts);
      for (const [pi, page] of layout.pages.entries()) {
        for (const op of page.ops) {
          if (op.t === "text") {
            expect(op.x, `p${pi} ${op.text}`).toBeGreaterThanOrEqual(MX - 0.01);
            if (!op.rotate) expect(op.x + op.width, `p${pi} ${op.text}`).toBeLessThanOrEqual(PAGE_W - MX + 0.01);
            expect(op.y).toBeLessThanOrEqual(PAGE_H);
            expect(op.y).toBeGreaterThan(0);
          } else if (op.t === "rect") {
            expect(op.x).toBeGreaterThanOrEqual(MX - 0.01);
            expect(op.x + op.w).toBeLessThanOrEqual(PAGE_W - MX + 0.01);
            expect(op.y + op.h).toBeLessThanOrEqual(PAGE_H);
          } else if (op.t === "line") {
            expect(Math.max(op.x1, op.x2)).toBeLessThanOrEqual(PAGE_W);
            expect(Math.max(op.y1, op.y2)).toBeLessThanOrEqual(PAGE_H);
          }
        }
      }
    }
  });

  it("o desenho da chapa cabe na página e as peças estão dentro do retângulo da chapa", async () => {
    const model = buildExportModel(exportProject(), opts);
    const layout = await layoutCutPlanPreview(model, "plan", fonts);
    for (const page of layout.pages) {
      const sheetRect = page.ops.find((o) => o.t === "rect" && o.tag?.startsWith("sheet:"));
      if (!sheetRect || sheetRect.t !== "rect") continue;
      for (const o of page.ops) {
        if (o.t === "rect" && o.tag?.startsWith("piece:")) {
          expect(o.x).toBeGreaterThanOrEqual(sheetRect.x - 0.01);
          expect(o.y).toBeGreaterThanOrEqual(sheetRect.y - 0.01);
          expect(o.x + o.w).toBeLessThanOrEqual(sheetRect.x + sheetRect.w + 0.01);
          expect(o.y + o.h).toBeLessThanOrEqual(sheetRect.y + sheetRect.h + 0.01);
        }
      }
    }
  });

  it("projeto grande: tabelas paginam com cabeçalho repetido e nada estoura", async () => {
    const m = mat();
    const pcs = Array.from({ length: 70 }, (_, i) => piece(m.id, 300 + i * 17, 200 + i * 9, { description: `Peça número ${i + 1} com descrição longa para quebrar linha na tabela`, quantity: 1 + (i % 4), notes: i % 3 === 0 ? "Observação comprida da peça para testar a quebra de linhas na coluna" : "" }));
    const model = buildExportModel(project({ materials: [m], pieces: pcs }), opts);
    expect(model.valid).toBe(true);
    const { bytes, layout } = await generateCutPlanPdf(model, "plan", fonts);
    expect(layout.pages.length).toBeGreaterThan(6);
    const text = await extractText(bytes);
    for (const p of model.pieces) expect(text).toContain(p.code);
    expect((text.match(/OBSERVAÇÕES/g) ?? []).length).toBeGreaterThanOrEqual(2); // cabeçalho repetido
  });

  it("peças minúsculas sem espaço para rótulo ganham tabela de posições (nunca ficam sem identificação)", async () => {
    const m = mat();
    const pcs = [piece(m.id, 2400, 1700, { description: "Grande" }), ...Array.from({ length: 6 }, (_, i) => piece(m.id, 25 + i, 18, { description: `Mini ${i}`, quantity: 2 }))];
    const model = buildExportModel(project({ materials: [m], pieces: pcs }), opts);
    expect(model.valid).toBe(true);
    const { bytes } = await generateCutPlanPdf(model, "plan", fonts);
    expect(await extractText(bytes)).toContain("pequenas demais para rotular");
  });

  it("mesma entrada → mesmos bytes", async () => {
    const model = buildExportModel(exportProject(), opts);
    const a = await generateCutPlanPdf(model, "plan", fonts);
    const b = await generateCutPlanPdf(model, "plan", fonts);
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
  });

  it("modo 'só lista' não tem desenhos de chapa", async () => {
    const model = buildExportModel(exportProject(), opts);
    const layout = await layoutCutPlanPreview(model, "list", fonts);
    expect(layout.pages.flatMap((p) => p.ops).some((o) => o.t === "rect" && o.tag?.startsWith("piece:"))).toBe(false);
    const { bytes } = await generateCutPlanPdf(model, "list", fonts);
    const text = await extractText(bytes);
    expect(text).toContain("Lista de peças");
    expect(text).toContain("Lista consolidada de peças");
    expect(text).toContain("Fita de borda");
    expect(text).not.toContain("Chapa 1 de");
  });

  it("fita de borda: seção separada indica as bordas e os totais por tipo", async () => {
    const model = buildExportModel(exportProject(), opts);
    const { bytes } = await generateCutPlanPdf(model, "list", fonts);
    const text = await extractText(bytes);
    expect(text).toContain("Fita branca 22 mm (2.400)"); // lateral: borda superior de 2400 mm
    expect(text).toContain("C1 · SUPERIOR");
    expect(text).toContain("L1 · ESQUERDA");
    expect(text).toContain("METROS LÍQUIDOS");
  });
});

describe("privacidade da exportação", () => {
  const FORBIDDEN_KEYS = ["price", "Price", "cost", "markup", "profit", "client", "phone", "cpf", "document", "manualPrice", "labor", "deductions", "description_commercial"];

  it("o modelo não tem nenhum campo de preço, custo, cliente ou contato (por padrão)", () => {
    const model = buildExportModel(exportProject(), opts);
    const json = JSON.stringify(model);
    for (const k of ["priceCents", "pricePerMeter", "markupPercent", "manualPriceCents", "costItems", "labor", "deductions", "clientName", "clientPhone"]) {
      expect(json, k).not.toContain(k);
    }
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
        keys.add(k);
        walk(x);
      }
    };
    walk(model);
    for (const k of keys) expect(FORBIDDEN_KEYS.some((f) => k.toLowerCase().includes(f.toLowerCase())), `chave ${k}`).toBe(false);
  });

  it("PDF (plano e lista) e CSV não contêm preços, 'R$', custos, cliente, telefone, descrição comercial ou observações do orçamento", async () => {
    const model = buildExportModel(exportProject(), opts);
    const texts = [
      await extractText((await generateCutPlanPdf(model, "plan", fonts)).bytes),
      await extractText((await generateCutPlanPdf(model, "list", fonts)).bytes),
      buildPartsCsv(model),
    ];
    for (const t of texts) {
      for (const secret of ["R$", "1.234,57", "91,37", "987,65", "43,21", "1.357,91", "9.999,99", SECRETS.hardware, SECRETS.clientName, "Conceição Açaí", SECRETS.clientPhone, "98888", SECRETS.description, SECRETS.projectNotes, "markup", "Markup", "lucro", "Lucro", "CPF", "preço", "Preço", "custo", "Custo"]) {
        expect(t, secret).not.toContain(secret);
      }
    }
  });

  it("contato da marcenaria só entra quando o usuário marca; telefone do cliente nunca", async () => {
    const without = await extractText((await generateCutPlanPdf(buildExportModel(exportProject(), opts), "plan", fonts)).bytes);
    expect(without).not.toContain("99999-0000");
    const withContact = buildExportModel(exportProject(), { ...opts, includeContact: true, contact: { phone: "(11) 99999-0000", email: "contato@silva.com.br" } });
    const text = await extractText((await generateCutPlanPdf(withContact, "plan", fonts)).bytes);
    expect(text).toContain("(11) 99999-0000");
    expect(text).toContain("contato@silva.com.br");
    expect(text).not.toContain("98888");
  });

  it("o nome do projeto no documento pode ser trocado (para não expor o cliente)", async () => {
    const model = buildExportModel(exportProject({ name: "Casa da Maria Conceição" }), { ...opts, projectName: "Projeto 0003" });
    const text = await extractText((await generateCutPlanPdf(model, "plan", fonts)).bytes);
    expect(text).toContain("Projeto 0003");
    expect(text).not.toContain("Maria");
  });
});

describe("CSV genérico (Excel pt-BR)", () => {
  it("UTF-8 com BOM, separador ';', CRLF, cabeçalho com unidade (mm) e uma linha por tipo de peça", () => {
    const model = buildExportModel(exportProject(), opts);
    const csv = buildPartsCsv(model);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    const lines = csv.slice(1).split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1 + model.pieces.length);
    expect(lines[0]).toBe(CSV_HEADERS.join(";"));
    expect(lines[0]).toContain("Comprimento (mm)");
    expect(lines[0]).toContain("Largura (mm)");
    expect(lines[0]).toContain("Espessura (mm)");
    // todas as linhas têm o mesmo número de colunas
    for (const l of lines.slice(1)) expect(l.split(";").length).toBe(CSV_HEADERS.length);
  });

  it("valores em milímetros, vírgula decimal, 'Sim/Não' e veio", () => {
    const model = buildExportModel(exportProject(), opts);
    const rows = buildPartsCsv(model).slice(1).split("\r\n").filter(Boolean).slice(1).map((l) => l.split(";"));
    const lateral = rows.find((r) => r[0] === "L1")!;
    expect(lateral.slice(0, 15)).toEqual(["L1", "Lateral", "MDF Branco 15 mm", "Branco TX", "15", "2400", "550", "2", "Sim", "Sem veio", "Fita branca 22 mm", "", "", "", "Furação para dobradiças"]);
    const porta = rows.find((r) => r[1] === "Porta de correr")!;
    expect(porta[8]).toBe("Não"); // veio: não gira
    expect(porta[9]).toBe("Comprimento");
    const gaveta = rows.find((r) => r[1] === "Frente de gaveta")!;
    expect(gaveta[8]).toBe("Não"); // rotação desligada na peça
  });

  it("decimais usam vírgula e não usam separador de milhar", () => {
    expect(csvNumber(2750)).toBe("2750");
    expect(csvNumber(450.5)).toBe("450,5");
    expect(csvNumber(0.45)).toBe("0,45");
    expect(csvNumber(1234.567)).toBe("1234,567");
  });

  it("escapa ';', aspas e quebras de linha; neutraliza fórmulas do Excel", () => {
    expect(csvText("Porta; esquerda")).toBe('"Porta; esquerda"');
    expect(csvText('Peça "especial"')).toBe('"Peça ""especial"""');
    expect(csvText("linha 1\nlinha 2")).toBe("linha 1 linha 2");
    expect(csvText("=SOMA(A1:A2)")).toBe("'=SOMA(A1:A2)");
    expect(csvText("-1+1")).toBe("'-1+1");
    expect(csvText("@cmd")).toBe("'@cmd");
    expect(csvText("Açaí ção")).toBe("Açaí ção");
  });

  it("peça com medida decimal (450,5 mm) sai com vírgula", () => {
    const m = mat();
    const model = buildExportModel(project({ materials: [m], pieces: [piece(m.id, 1200.5, 450.5, { description: "Decimal" })] }), opts);
    expect(buildPartsCsv(model)).toContain(";1200,5;450,5;");
  });

  it("não contém preços nem dados pessoais (colunas são só técnicas)", () => {
    for (const h of CSV_HEADERS) expect(/pre[cç]o|custo|cliente|cpf|telefone|valor/i.test(h)).toBe(false);
  });
});

describe("arquitetura de exportadores e nomes de arquivo", () => {
  it("há um CSV genérico e dá para registrar exportadores específicos sem mexer no resto", () => {
    expect(getPartsExporter(GENERIC_CSV_ID)?.extension).toBe("csv");
    expect(getPartsExporter(GENERIC_CSV_ID)?.description).toMatch(/gen[eé]rico/i);
    const model = buildExportModel(exportProject(), opts);
    registerPartsExporter({ id: "teste-seccionadora", label: "Seccionadora X", description: "teste", extension: "txt", mimeType: "text/plain", build: (m) => `${m.pieces.length} peças` });
    expect(listPartsExporters().map((e) => e.id)).toContain("teste-seccionadora");
    expect(getPartsExporter("teste-seccionadora")!.build(model)).toBe("9 peças");
  });

  it("nomes de arquivo seguros", () => {
    const model = buildExportModel(exportProject(), { ...opts, projectName: "Cozinha: Açaí/Armário #1" });
    expect(exportFileName(model, "plano", "pdf")).toBe("Plano-de-corte_P-0003_Cozinha-Acai-Armario-1.pdf");
    expect(exportFileName(model, "lista", "csv")).toBe("Lista-de-pecas_P-0003_Cozinha-Acai-Armario-1.csv");
  });
});
