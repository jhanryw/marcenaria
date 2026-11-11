import Dexie from "dexie";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { beforeEach, describe, expect, it } from "vitest";
import { MarcenariaDB, __setDbForTests, getDb } from "@/db/db";
import { createProject, getProject, saveProject } from "@/db/repository";
import { buildBackup, importBackup, parseBackup, serializeBackup, wipeAllData } from "@/db/backup";
import { calculateProject } from "@/engine/project-calc";
import { buildExportModel } from "@/export/model";
import { buildPartsCsv } from "@/export/csv";
import { generateCutPlanPdf } from "@/export/pdf/generate";
import { generateContractPdf } from "@/contracts/pdf/generate";
import { DEFAULT_CLAUSES, SPECIAL_CONDITION_DEFS } from "@/contracts/template";
import type { Piece, Project, SheetMaterial } from "@/domain/schema";
import { cmToMm, mmToCm } from "@/lib/units";
import { mat, piece, project } from "./helpers";
import { fontBytesFromDisk, sampleContent } from "./contract-helpers";

/** Projeto "antigo": tudo em MILÍMETROS, como foi salvo antes da interface em cm. */
function oldProject(): Project {
  const m = mat({ priceCents: 32000 });
  return project({
    name: "Projeto antigo",
    materials: [m],
    markupPercent: 50,
    pieces: [piece(m.id, 1800, 600, { quantity: 2 }), piece(m.id, 800, 450, { quantity: 6 }), piece(m.id, 500, 300, { quantity: 4 }), piece(m.id, 2000, 400)],
  });
}

/** O que a interface faz ao abrir e regravar uma peça/chapa: mm → cm (tela) → mm (gravação). */
function throughUi(p: Project): Project {
  const pieces: Piece[] = p.pieces.map((x) => ({ ...x, lengthMm: cmToMm(mmToCm(x.lengthMm)), widthMm: cmToMm(mmToCm(x.widthMm)) }));
  const materials: SheetMaterial[] = p.materials.map((m) => ({ ...m, lengthMm: cmToMm(mmToCm(m.lengthMm)), widthMm: cmToMm(mmToCm(m.widthMm)) }));
  return { ...p, pieces, materials };
}

let n = 0;
beforeEach(() => {
  n++;
  __setDbForTests(new MarcenariaDB(`uni-${n}-${Math.random()}`));
});

describe("cálculo do plano de corte antes e depois da mudança de unidade", () => {
  it("valores de referência (golden) do motor em mm permanecem exatamente os mesmos", () => {
    const c = calculateProject(oldProject());
    const r = c.cut.materials[0];
    expect(r.sheetsUsed).toBe(2);
    expect(r.lowerBoundSheets).toBe(2);
    expect(Math.round(r.metrics.utilizationPercent * 100) / 100).toBe(56.22);
    expect(r.metrics.piecesAreaMm2).toBe(5_720_000);
    expect(c.finance.totalCostCents).toBe(64000);
    expect(c.finance.finalPriceCents).toBe(96000);
    expect(r.sheets.flatMap((s) => s.placements.map((x) => [x.x, x.y, x.w, x.h, x.rotated])).slice(0, 4)).toEqual([
      [10, 10, 600, 1800, true],
      [613, 10, 600, 1800, true],
      [1216, 10, 800, 450, false],
      [1216, 463, 800, 450, false],
    ]);
  });

  it("passar as medidas pela interface (mm → cm → mm) NÃO muda nada: plano, posições e preço idênticos", () => {
    const before = calculateProject(oldProject());
    const after = calculateProject(throughUi(oldProject()));
    // as peças têm ids novos a cada chamada; compara posições e totais
    const key = (c: ReturnType<typeof calculateProject>) =>
      JSON.stringify([
        c.cut.materials.map((r) => [r.sheetsUsed, r.metrics, r.sheets.map((s) => s.placements.map((x) => [x.x, x.y, x.w, x.h, x.rotated]))]),
        c.finance,
        c.tape.totalCostCents,
      ]);
    const p1 = oldProject();
    const p2 = throughUi(structuredClone(p1));
    expect(p2.pieces.map((x) => [x.lengthMm, x.widthMm])).toEqual(p1.pieces.map((x) => [x.lengthMm, x.widthMm]));
    expect(key(calculateProject(p2))).toBe(key(calculateProject(p1)));
    expect(after.cut.totalSheetsToBuy).toBe(before.cut.totalSheetsToBuy);
  });

  it("peça digitada em cm vira os mm certos no plano: 60 × 180 cm → 600 × 1800 mm", () => {
    const m = mat();
    const p = project({ materials: [m], pieces: [piece(m.id, cmToMm(180), cmToMm(60), { description: "Lateral" })] });
    expect([p.pieces[0].lengthMm, p.pieces[0].widthMm]).toEqual([1800, 600]);
    const pl = calculateProject(p).cut.materials[0].sheets[0].placements[0];
    expect([Math.max(pl.w, pl.h), Math.min(pl.w, pl.h)]).toEqual([1800, 600]);
  });

  it("decimais: 60,5 cm → 605 mm no plano; 1,5 cm de espessura → 15 mm", () => {
    const m = mat({ thicknessMm: cmToMm(1.5) });
    expect(m.thicknessMm).toBe(15);
    const p = project({ materials: [m], pieces: [piece(m.id, cmToMm(120), cmToMm(60.5))] });
    expect(p.pieces[0].widthMm).toBe(605);
    const pl = calculateProject(p).cut.materials[0].sheets[0].placements[0];
    expect(Math.min(pl.w, pl.h)).toBe(605);
  });

  it("chapa padrão 275 × 185 cm = 2750 × 1850 mm; margem e serra continuam em mm", () => {
    expect([cmToMm(275), cmToMm(185)]).toEqual([2750, 1850]);
    const m = mat();
    expect([m.lengthMm, m.widthMm, m.marginMm, m.kerfMm]).toEqual([2750, 1850, 10, 3]);
  });
});

describe("projetos antigos: abrir e salvar sem alterar as dimensões", () => {
  it("projeto salvo em mm é lido igual, e salvar de novo mantém 600 × 1800 mm", async () => {
    const old = oldProject();
    await getDb().projects.put(old);
    const loaded = (await getProject(old.id))!;
    expect(loaded.pieces.map((p) => [p.lengthMm, p.widthMm])).toEqual(old.pieces.map((p) => [p.lengthMm, p.widthMm]));
    expect(mmToCm(loaded.pieces[0].widthMm)).toBe(60); // a tela mostra 60 cm
    expect(mmToCm(loaded.pieces[0].lengthMm)).toBe(180);
    const saved = await saveProject(loaded); // regravação sem editar medidas
    const reread = (await getDb().projects.get(old.id))!;
    expect(reread.pieces.map((p) => [p.lengthMm, p.widthMm])).toEqual(old.pieces.map((p) => [p.lengthMm, p.widthMm]));
    expect(reread.materials[0].lengthMm).toBe(2750);
    expect(reread.materials[0].widthMm).toBe(1850);
    expect(saved.pieces[0].widthMm).toBe(600);
    expect(calculateProject(reread).cut.totalSheetsToBuy).toBe(calculateProject(old).cut.totalSheetsToBuy);
  });

  it("nenhuma migração multiplica valores: o banco continua na versão 2 e os mm antigos ficam intactos (inclusive após 'novo deploy')", async () => {
    const name = `deploy-${Math.random()}`;
    const old = new Dexie(name);
    old.version(1).stores({ projects: "id, name, clientName, status, updatedAt", sheetMaterials: "id, name", edgeTapes: "id, name", settings: "id" });
    const p = oldProject();
    await old.table("projects").put(p);
    await old.table("sheetMaterials").put(p.materials[0]);
    await old.table("settings").put({ id: "main", defaultSheetLengthMm: 2750, defaultSheetWidthMm: 1850, remnantMinShortMm: 300, remnantMinLongMm: 600 });
    old.close();

    const db1 = new MarcenariaDB(name); // primeira abertura do app novo (migração v1 → v2)
    __setDbForTests(db1);
    await db1.open();
    expect((await db1.sheetMaterials.get(p.materials[0].id))?.lengthMm).toBe(2750);
    const s1 = await db1.settings.get("main");
    expect([s1?.defaultSheetLengthMm, s1?.defaultSheetWidthMm, s1?.remnantMinShortMm, s1?.remnantMinLongMm]).toEqual([2750, 1850, 300, 600]);
    db1.close();

    const db2 = new MarcenariaDB(name); // "novo deploy": o app é recarregado e abre o mesmo banco
    __setDbForTests(db2);
    expect(db2.verno).toBe(2);
    const again = (await getProject(p.id))!;
    expect(again.pieces.map((x) => [x.lengthMm, x.widthMm])).toEqual(p.pieces.map((x) => [x.lengthMm, x.widthMm]));
    expect(again.remnantMinShortMm).toBe(300);
    expect(calculateProject(again).finance.finalPriceCents).toBe(96000);
  });

  it("um projeto criado pelo app guarda as configurações padrão em mm", async () => {
    const created = await createProject({ name: "Novo" });
    expect([created.remnantMinShortMm, created.remnantMinLongMm]).toEqual([300, 600]);
  });
});

describe("backup e restauração mantêm tudo em mm", () => {
  it("exporta e restaura sem alterar nenhuma dimensão", async () => {
    const old = oldProject();
    await getDb().projects.put(old);
    await getDb().sheetMaterials.put(old.materials[0]);
    const text = serializeBackup(await buildBackup());
    const json = JSON.parse(text);
    expect(json.data.projects[0].pieces[0].widthMm).toBe(600);
    expect(json.data.projects[0].pieces[0].lengthMm).toBe(1800);
    expect(json.data.sheetMaterials[0].lengthMm).toBe(2750);
    await wipeAllData();
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    await importBackup(parsed.backup, "replace");
    const back = (await getProject(old.id))!;
    expect(back.pieces.map((p) => [p.lengthMm, p.widthMm])).toEqual(old.pieces.map((p) => [p.lengthMm, p.widthMm]));
    expect(back.materials[0].widthMm).toBe(1850);
  });
});

describe("exportações do plano de corte permanecem em milímetros", () => {
  const opts = { projectName: "Guarda-roupa", reference: "P-0001", now: new Date("2026-11-10T15:00:00Z") };

  async function text(bytes: Uint8Array) {
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 });
    const doc = await task.promise;
    const out: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(" "));
    await task.destroy();
    return out.join(" ").replace(/\s+/g, " ");
  }

  it("peça digitada como 60 × 180 cm aparece como 1.800 × 600 mm no PDF e 1800;600 no CSV, com a unidade identificada", async () => {
    const m = mat({ name: "MDF Branco 15 mm", lengthMm: cmToMm(275), widthMm: cmToMm(185) });
    const model = buildExportModel(project({ materials: [m], pieces: [piece(m.id, cmToMm(180), cmToMm(60), { description: "Lateral", ref: "L1", quantity: 2 })] }), opts);
    expect(model.valid).toBe(true);
    expect([model.pieces[0].lengthMm, model.pieces[0].widthMm]).toEqual([1800, 600]);

    const csv = buildPartsCsv(model);
    expect(csv).toContain("Comprimento (mm);Largura (mm)");
    expect(csv).toContain("L1;Lateral;MDF Branco 15 mm;;15;1800;600;2;");
    expect(csv).not.toMatch(/\bcm\b/);

    const pdf = await text((await generateCutPlanPdf(model, "plan", fontBytesFromDisk())).bytes);
    expect(pdf).toContain("1.800 × 600");
    expect(pdf).toContain("2.750 × 1.850");
    expect(pdf).toContain("Medidas em milímetros");
    expect(pdf).toContain("MEDIDAS EM mm");
    expect(pdf).toContain("(C × L, MM)");
    expect(pdf).not.toMatch(/\d\s?cm\b/);
  });

  it("decimais em cm: 60,5 cm vira 605 mm no CSV", () => {
    const m = mat();
    const model = buildExportModel(project({ materials: [m], pieces: [piece(m.id, cmToMm(120.5), cmToMm(60.5))] }), opts);
    expect(buildPartsCsv(model)).toContain(";1205;605;");
  });
});

describe("contratos: dimensões em cm nos novos e nenhum texto emitido é alterado", () => {
  it("o modelo de cláusulas não usa mm nem cm (dimensões vêm do item descrito pelo usuário)", () => {
    const all = [...DEFAULT_CLAUSES.map((c) => c.body), ...Object.values(SPECIAL_CONDITION_DEFS).map((d) => d.defaultText)].join(" ");
    expect(all).not.toMatch(/\b\d+\s?mm\b/);
  });

  it("novo contrato aceita dimensões em cm no item e o PDF mostra exatamente o texto informado", async () => {
    const c = sampleContent();
    c.items[0].dimensions = "240 × 220 × 60 cm";
    c.items[0].name = "Guarda-roupa planejado";
    const { bytes } = await generateContractPdf({ content: c, numberLabel: "0001", issuedDate: null, draft: true, metaDate: new Date() }, fontBytesFromDisk());
    const t = await text2(bytes);
    expect(t).toContain("240 × 220 × 60 cm");
  });

  it("contrato antigo/emitido com dimensões em mm renderiza igual: nenhuma conversão é aplicada a textos congelados", async () => {
    const c = sampleContent();
    c.items[0].dimensions = "2400 × 2200 × 600 mm";
    const input = { content: c, numberLabel: "0007", issuedDate: "2026-01-05", draft: false, metaDate: new Date("2026-01-05T12:00:00Z") };
    const a = await generateContractPdf(input, fontBytesFromDisk());
    const b = await generateContractPdf(structuredClone(input), fontBytesFromDisk());
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true); // reproduzível, byte a byte
    const t = await text2(a.bytes);
    expect(t).toContain("2400 × 2200 × 600 mm");
    expect(t).not.toContain("240 × 220 × 60 cm");
  });
});

async function text2(bytes: Uint8Array): Promise<string> {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(" "));
  await task.destroy();
  return out.join(" ").replace(/\s+/g, " ");
}
