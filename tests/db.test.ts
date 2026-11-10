import { beforeEach, describe, expect, it } from "vitest";
import { MarcenariaDB, __setDbForTests, getDb } from "@/db/db";
import {
  createProject,
  deleteProject,
  duplicateProject,
  filterProjects,
  getProject,
  getSettings,
  refreshMaterialSnapshot,
  saveProject,
  saveSettings,
  saveSheetMaterial,
  withMaterialSnapshot,
} from "@/db/repository";
import { buildBackup, importBackup, parseBackup, serializeBackup, wipeAllData } from "@/db/backup";
import { migrateBackupData } from "@/db/migrations";
import { BACKUP_FORMAT, SCHEMA_VERSION } from "@/domain/schema";
import { calculateProject } from "@/engine/project-calc";
import { mat, piece, settings } from "./helpers";

let n = 0;
beforeEach(() => {
  n++;
  __setDbForTests(new MarcenariaDB(`teste-${n}-${Math.random()}`));
});

async function seedProject() {
  const m = mat({ priceCents: 32000 });
  await saveSheetMaterial(m);
  let p = await createProject({ name: "Guarda-roupa", clientName: "Maria" });
  p = withMaterialSnapshot(p, m);
  p = { ...p, pieces: [piece(m.id, 800, 450, { quantity: 6 }), piece(m.id, 1800, 600)] };
  p = await saveProject(p);
  return { m, p };
}

describe("projetos: criar, editar, duplicar, excluir, buscar", () => {
  it("cria com os padrões das configurações e persiste", async () => {
    await saveSettings({ ...settings, defaultMarkupPercent: 70 });
    const p = await createProject({ name: "Cozinha" });
    expect(p.markupPercent).toBe(70);
    const loaded = await getProject(p.id);
    expect(loaded?.name).toBe("Cozinha");
    expect(loaded?.status).toBe("rascunho");
  });

  it("salvar atualiza updatedAt", async () => {
    const p = await createProject({ name: "A" });
    await new Promise((r) => setTimeout(r, 5));
    const saved = await saveProject({ ...p, name: "B" });
    expect(saved.updatedAt > p.updatedAt).toBe(true);
    expect((await getProject(p.id))?.name).toBe("B");
  });

  it("duplica com novos ids, mantendo peças, materiais e custos", async () => {
    const { p } = await seedProject();
    const copy = (await duplicateProject(p.id))!;
    expect(copy.id).not.toBe(p.id);
    expect(copy.name).toBe("Guarda-roupa (cópia)");
    expect(copy.status).toBe("rascunho");
    expect(copy.pieces).toHaveLength(p.pieces.length);
    expect(copy.pieces.map((x) => x.id)).not.toEqual(p.pieces.map((x) => x.id));
    expect(copy.pieces.map((x) => x.materialId)).toEqual(p.pieces.map((x) => x.materialId));
    expect(calculateProject(copy).finance.finalPriceCents).toBe(calculateProject(p).finance.finalPriceCents);
    // alterar a cópia não afeta o original
    await saveProject({ ...copy, pieces: [] });
    expect((await getProject(p.id))?.pieces).toHaveLength(2);
    expect(await getDb().projects.count()).toBe(2);
  });

  it("exclui apenas o projeto escolhido", async () => {
    const { p } = await seedProject();
    const other = await createProject({ name: "Outro" });
    await deleteProject(p.id);
    expect(await getProject(p.id)).toBeUndefined();
    expect(await getProject(other.id)).toBeDefined();
  });

  it("busca por nome/cliente e filtra por status", async () => {
    const a = await createProject({ name: "Cozinha planejada", clientName: "Ana" });
    const b = await createProject({ name: "Closet", clientName: "Bruno", status: "aprovado" });
    const all = [a, b];
    expect(filterProjects(all, { search: "cozinha" }).map((x) => x.id)).toEqual([a.id]);
    expect(filterProjects(all, { search: "BRUNO" }).map((x) => x.id)).toEqual([b.id]);
    expect(filterProjects(all, { status: "aprovado" }).map((x) => x.id)).toEqual([b.id]);
    expect(filterProjects(all, { status: "todos" })).toHaveLength(2);
  });
});

describe("snapshots: mudar o catálogo não altera orçamentos salvos", () => {
  it("o preço do orçamento permanece o da época; atualizar é ação explícita", async () => {
    const { m, p } = await seedProject();
    const before = calculateProject((await getProject(p.id))!);

    // o preço da chapa sobe de R$ 320 para R$ 450 no catálogo
    await saveSheetMaterial({ ...m, priceCents: 45000 });

    const reloaded = (await getProject(p.id))!;
    const after = calculateProject(reloaded);
    expect(after.sheetsCostCents).toBe(before.sheetsCostCents);
    expect(after.finance.finalPriceCents).toBe(before.finance.finalPriceCents);

    // atualização manual do snapshot
    const catalog = (await getDb().sheetMaterials.get(m.id))!;
    const refreshed = calculateProject(refreshMaterialSnapshot(reloaded, catalog));
    expect(refreshed.sheetsCostCents).toBeGreaterThan(before.sheetsCostCents);
  });

  it("excluir o material do catálogo não quebra o orçamento", async () => {
    const { m, p } = await seedProject();
    await getDb().sheetMaterials.delete(m.id);
    const c = calculateProject((await getProject(p.id))!);
    expect(c.reliable).toBe(true);
    expect(c.cut.totalSheetsToBuy).toBeGreaterThan(0);
  });
});

describe("persistência entre 'sessões'", () => {
  it("dados sobrevivem a fechar e reabrir o banco; edição recalcula chapas e preço", async () => {
    const name = `persist-${Math.random()}`;
    const db1 = new MarcenariaDB(name);
    __setDbForTests(db1);
    const { m, p } = await seedProject();
    const priceBefore = calculateProject((await getProject(p.id))!).finance.finalPriceCents;
    db1.close(); // "fecha o navegador"

    const db2 = new MarcenariaDB(name); // "reabre"
    __setDbForTests(db2);
    const reopened = (await getProject(p.id))!;
    expect(reopened.pieces).toHaveLength(2);
    expect(calculateProject(reopened).finance.finalPriceCents).toBe(priceBefore);

    // edita peças → novo cálculo automático
    const edited = await saveProject({ ...reopened, pieces: [...reopened.pieces, piece(m.id, 700, 500, { quantity: 80 })] });
    const c = calculateProject(edited);
    expect(c.cut.totalSheetsToBuy).toBeGreaterThan(calculateProject(reopened).cut.totalSheetsToBuy);
    expect(c.finance.finalPriceCents).toBeGreaterThan(priceBefore);
  });
});

describe("backup JSON", () => {
  it("exporta, apaga tudo e restaura com dados idênticos", async () => {
    const { p } = await seedProject();
    await saveSettings({ ...settings, companyName: "Marcenaria do Zé", defaultMarkupPercent: 65 });
    const backup = await buildBackup();
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION);

    const text = serializeBackup(backup);
    await wipeAllData();
    expect(await getDb().projects.count()).toBe(0);

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const summary = await importBackup(parsed.backup, "replace");
    expect(summary.projects).toBe(1);

    const restored = (await getProject(p.id))!;
    expect(restored).toEqual(p);
    expect((await getSettings()).companyName).toBe("Marcenaria do Zé");
    expect(calculateProject(restored).finance.finalPriceCents).toBe(calculateProject(p).finance.finalPriceCents);
  });

  it("'replace' remove o que não está no backup", async () => {
    const { p } = await seedProject();
    const backup = await buildBackup();
    const extra = await createProject({ name: "Extra" });
    await importBackup(backup, "replace");
    expect(await getProject(extra.id)).toBeUndefined();
    expect(await getProject(p.id)).toBeDefined();
  });

  it("'merge' mantém o mais novo e adiciona o que faltava", async () => {
    const { p } = await seedProject();
    const backup = await buildBackup(); // contém p na versão atual
    const newer = await saveProject({ ...p, name: "Nome mais novo" });
    const onlyHere = await createProject({ name: "Só aqui" });

    const summary = await importBackup(backup, "merge");
    expect(summary.keptNewer).toBeGreaterThanOrEqual(1);
    expect((await getProject(p.id))?.name).toBe(newer.name); // não regrediu
    expect(await getProject(onlyHere.id)).toBeDefined(); // não apagou

    // projeto apagado volta no merge
    await deleteProject(p.id);
    await importBackup(backup, "merge");
    expect(await getProject(p.id)).toBeDefined();
  });

  it("rejeita arquivos inválidos com mensagem clara", () => {
    expect(parseBackup("isto não é json")).toMatchObject({ ok: false });
    expect(parseBackup("[]")).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ foo: 1 }))).toMatchObject({ ok: false, error: expect.stringMatching(/backup deste aplicativo/) });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT }))).toMatchObject({ ok: false, error: expect.stringMatching(/Versão/) });
  });

  it("rejeita backup de versão mais nova que o app", () => {
    const r = parseBackup(
      JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION + 1, exportedAt: "x", data: {} }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mais nova/);
  });

  it("rejeita dados corrompidos (medida negativa) sem tocar no banco", async () => {
    const { p } = await seedProject();
    const backup = await buildBackup();
    const bad = JSON.parse(serializeBackup(backup));
    bad.data.projects[0].pieces[0].widthMm = -10;
    const r = parseBackup(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    expect((await getProject(p.id))?.pieces).toHaveLength(2);
  });

  it("rejeita peça apontando para material ausente", async () => {
    await seedProject();
    const bad = JSON.parse(serializeBackup(await buildBackup()));
    bad.data.projects[0].materials = [];
    const r = parseBackup(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/material/);
  });

  it("campos novos ausentes em backups antigos recebem valores padrão", async () => {
    const { p } = await seedProject();
    const raw = JSON.parse(serializeBackup(await buildBackup()));
    delete raw.data.projects[0].reserve;
    delete raw.data.projects[0].deductions;
    delete raw.data.projects[0].pieces[0].allowRotation;
    const r = parseBackup(JSON.stringify(raw));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.backup.data.projects[0].reserve).toEqual({ mode: "none", value: 0 });
      expect(r.backup.data.projects[0].pieces[0].allowRotation).toBe(true);
      expect(r.backup.data.projects[0].id).toBe(p.id);
    }
  });

  it("cadeia de migrações aplica cada passo em ordem", () => {
    const table = {
      1: (b: Record<string, unknown>) => ({ ...b, trail: [...((b.trail as string[]) ?? []), "1→2"] }),
      2: (b: Record<string, unknown>) => ({ ...b, trail: [...((b.trail as string[]) ?? []), "2→3"] }),
    };
    const out = migrateBackupData({ schemaVersion: 1 }, 1, table, 3);
    expect(out.schemaVersion).toBe(3);
    expect(out.trail).toEqual(["1→2", "2→3"]);
    expect(() => migrateBackupData({ schemaVersion: 1 }, 1, {}, 2)).toThrow(/migração/);
  });
});
