import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { MarcenariaDB, __setDbForTests, getDb } from "@/db/db";
import { createProject, getProject, getSettings, saveProject, saveSettings } from "@/db/repository";
import {
  ContractError,
  cancelContract,
  createContractFromProject,
  createRevision,
  deleteAllContracts,
  deleteContract,
  getContract,
  isSuperseded,
  issueContract,
  listContracts,
  listContractsByProject,
  markContractSigned,
  resetContractTemplate,
  saveContractDraft,
  saveContractTemplate,
  scrubClientDataFromProjects,
} from "@/db/contracts";
import { buildBackup, importBackup, parseBackup, serializeBackup, wipeAllData } from "@/db/backup";
import { reviewContract } from "@/contracts/review";
import { recomputePayment } from "@/contracts/payment";
import { calculateProject } from "@/engine/project-calc";
import { BACKUP_FORMAT, SCHEMA_VERSION } from "@/domain/schema";
import { defaultSettings } from "@/domain/defaults";
import { COMPANY, sampleProject } from "./contract-helpers";
import { LOGO_DATA_URL } from "./fixtures/logo-data-url";

let n = 0;
beforeEach(() => {
  n++;
  __setDbForTests(new MarcenariaDB(`ctr-${n}-${Math.random()}`));
});

async function seed() {
  await saveSettings({ ...defaultSettings(), company: COMPANY, contractDefaults: { ...defaultSettings().contractDefaults, warrantyMonths: 12 } });
  const base = sampleProject();
  const created = await createProject({ name: base.name });
  const p = await saveProject({ ...base, id: created.id, createdAt: created.createdAt });
  return p;
}

/** Deixa o rascunho pronto para emitir (obrigatórios preenchidos). */
async function makeReady(id: string) {
  const c = (await getContract(id))!;
  const content = structuredClone(c.content);
  content.schedule.leadTime = 30;
  content.schedule.startDate = "2026-12-01";
  content.payment = recomputePayment({ ...content.payment, downDueDate: "2026-12-01" }, "2026-12-01");
  return saveContractDraft(id, content);
}

describe("criar contrato a partir do orçamento", () => {
  it("importa nome, cliente, descrição, materiais, valor final e data do orçamento", async () => {
    const p = await seed();
    const c = await createContractFromProject(p.id);
    expect(c.status).toBe("rascunho");
    expect(c.number).toBe(1);
    expect(c.revision).toBe(1);
    expect(c.projectId).toBe(p.id);
    expect(c.projectName).toBe("Guarda-roupa do casal");
    expect(c.projectNumber).toBe(1);
    expect(c.budgetDate).toBeTruthy();
    expect(c.content.client.name).toBe("Maria Conceição Açaí");
    expect(c.content.client.phone).toBe("(11) 98888-7777");
    expect(c.content.items).toHaveLength(1);
    expect(c.content.items[0].description).toContain("3 portas de correr");
    expect(c.content.items[0].material).toContain("MDF Branco 15 mm");
    expect(c.content.items[0].color).toBe("Branco TX");
    expect(c.content.notes).toBe("Cliente prefere puxadores embutidos.");
    // empresa vem das configurações
    expect(c.content.company.legalName).toBe(COMPANY.legalName);
    // valor = preço FINAL de venda
    const calc = calculateProject((await getProject(p.id))!);
    expect(c.content.payment.totalCents).toBe(calc.finance.finalPriceCents);
  });

  it("usa o preço MANUAL do orçamento quando existir", async () => {
    const p = await seed();
    await saveProject({ ...(await getProject(p.id))!, manualPriceCents: 777700 });
    const c = await createContractFromProject(p.id);
    expect(c.content.payment.totalCents).toBe(777700);
  });

  it("numeração sequencial; número do projeto é atribuído uma única vez", async () => {
    const p = await seed();
    const a = await createContractFromProject(p.id);
    const b = await createContractFromProject(p.id);
    expect(a.number).toBe(1);
    expect(b.number).toBe(2);
    expect(a.projectNumber).toBe(1);
    expect(b.projectNumber).toBe(1);
    const other = await createProject({ name: "Outro" });
    const c = await createContractFromProject(other.id);
    expect(c.projectNumber).toBe(2);
    expect((await getProject(p.id))?.number).toBe(1);
    expect((await getSettings()).nextContractNumber).toBe(4);
  });

  it("nunca copia custos internos, markup, lucro, aproveitamento ou lista de cortes", async () => {
    const p = await seed();
    const c = await createContractFromProject(p.id);
    const json = JSON.stringify(c);
    for (const k of ["markupPercent", "priceCents", "pricePerMeterCents", "wastePercent", "costItems", "labor", "pieces", "sheetsToBuy", "utilization", "Dobradiça secreta XYZ", "manualPriceCents", "deductions"]) {
      expect(json, k).not.toContain(k);
    }
  });

  it("projeto inexistente → erro claro", async () => {
    await expect(createContractFromProject("nao-existe")).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("valor negociado no contrato", () => {
  it("alterar o valor no contrato não muda custo, markup nem preço do projeto", async () => {
    const p = await seed();
    const before = calculateProject((await getProject(p.id))!);
    const c = await createContractFromProject(p.id);
    const content = structuredClone(c.content);
    content.payment = recomputePayment({ ...content.payment, totalCents: 400000 });
    await saveContractDraft(c.id, content);

    const projectAfter = (await getProject(p.id))!;
    const after = calculateProject(projectAfter);
    expect(after.finance.totalCostCents).toBe(before.finance.totalCostCents);
    expect(after.finance.finalPriceCents).toBe(before.finance.finalPriceCents);
    expect(projectAfter.markupPercent).toBe(63);
    expect(projectAfter.manualPriceCents).toBeNull();
    expect((await getContract(c.id))!.content.payment.totalCents).toBe(400000);
  });
});

describe("rascunhos persistem", () => {
  it("o rascunho sobrevive a fechar e reabrir o banco", async () => {
    const name = `persist-${Math.random()}`;
    __setDbForTests(new MarcenariaDB(name));
    const p = await seed();
    const c = await createContractFromProject(p.id);
    const content = structuredClone(c.content);
    content.client.name = "Fulana de Tal";
    content.items.push({ ...content.items[0], id: "extra", name: "Painel de TV" });
    await saveContractDraft(c.id, content);
    getDb().close();

    __setDbForTests(new MarcenariaDB(name));
    const reopened = (await getContract(c.id))!;
    expect(reopened.content.client.name).toBe("Fulana de Tal");
    expect(reopened.content.items.map((i) => i.name)).toEqual(["Guarda-roupa do casal", "Painel de TV"]);
    expect((await listContractsByProject(p.id)).map((x) => x.id)).toEqual([c.id]);
  });
});

describe("emissão e imutabilidade", () => {
  it("não emite com pendências obrigatórias", async () => {
    const p = await seed();
    const c = await createContractFromProject(p.id); // sem prazo, vencimentos sem data
    await expect(issueContract(c.id)).rejects.toMatchObject({ code: "not-ready" });
    expect((await getContract(c.id))!.status).toBe("rascunho");
  });

  it("emite, congela conteúdo e cláusulas, e bloqueia edições", async () => {
    const p = await seed();
    const c0 = await createContractFromProject(p.id);
    await makeReady(c0.id);
    const issued = await issueContract(c0.id);
    expect(issued.status).toBe("emitido");
    expect(issued.issuedAt).toBeTruthy();
    expect(issued.issued?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(issued.issued?.clauses).toHaveLength(15);
    // placeholders resolvidos no texto final
    const text = issued.issued!.clauses.flatMap((c2) => c2.paragraphs).join(" ");
    expect(text).not.toContain("{{");
    expect(text).toContain("Maria Conceição Açaí".length ? "CONTRATANTE" : "");
    expect(issued.issued!.content).toEqual(issued.content);

    await expect(saveContractDraft(c0.id, { ...issued.content, notes: "tentativa de alteração" })).rejects.toMatchObject({ code: "locked" });
    await expect(issueContract(c0.id)).rejects.toMatchObject({ code: "invalid-state" });
    expect((await getContract(c0.id))!.issued).toEqual(issued.issued);
  });

  it("mudar o orçamento depois NÃO altera o contrato emitido (nem o rascunho já criado)", async () => {
    const p = await seed();
    const c0 = await createContractFromProject(p.id);
    await makeReady(c0.id);
    const issued = await issueContract(c0.id);
    const draft = await createContractFromProject(p.id);

    const cur = (await getProject(p.id))!;
    await saveProject({ ...cur, name: "Nome mudou", clientName: "Outro Cliente", markupPercent: 200, description: "mudou" });

    const after = (await getContract(c0.id))!;
    expect(after.issued).toEqual(issued.issued);
    expect(after.content.client.name).toBe("Maria Conceição Açaí");
    expect(after.projectName).toBe("Guarda-roupa do casal");
    expect((await getContract(draft.id))!.content.client.name).toBe("Maria Conceição Açaí");
  });

  it("alterar as configurações da empresa depois não muda contratos já criados", async () => {
    const p = await seed();
    const c0 = await createContractFromProject(p.id);
    await saveSettings({ ...(await getSettings()), company: { ...COMPANY, legalName: "Outra Empresa" } });
    expect((await getContract(c0.id))!.content.company.legalName).toBe(COMPANY.legalName);
  });

  it("gerar PDF não marca como assinado; assinatura é registro manual e só após emitir", async () => {
    const p = await seed();
    const c0 = await createContractFromProject(p.id);
    await expect(markContractSigned(c0.id, { date: "2026-12-02" })).rejects.toMatchObject({ code: "invalid-state" });
    await makeReady(c0.id);
    const issued = await issueContract(c0.id);
    expect(issued.status).toBe("emitido");
    expect(issued.signedAt).toBeNull();
    const signed = await markContractSigned(c0.id, { date: "2026-12-02", note: "Assinado em papel, via entregue ao cliente" });
    expect(signed.status).toBe("assinado");
    expect(signed.signedAt).toBe("2026-12-02");
    expect(signed.signedNote).toContain("papel");
    expect(signed.issued).toEqual(issued.issued); // conteúdo continua o mesmo
  });

  it("cancelar preserva o conteúdo emitido; não cancela duas vezes", async () => {
    const p = await seed();
    const c0 = await createContractFromProject(p.id);
    await makeReady(c0.id);
    const issued = await issueContract(c0.id);
    const cancelled = await cancelContract(c0.id, "Cliente desistiu");
    expect(cancelled.status).toBe("cancelado");
    expect(cancelled.cancelReason).toBe("Cliente desistiu");
    expect(cancelled.issued).toEqual(issued.issued);
    await expect(cancelContract(c0.id)).rejects.toBeInstanceOf(ContractError);
  });
});

describe("revisões", () => {
  it("nova revisão vincula ao anterior, mantém o número e não altera o original", async () => {
    const p = await seed();
    const c0 = await createContractFromProject(p.id);
    await makeReady(c0.id);
    const issued = await issueContract(c0.id);
    const rev = await createRevision(c0.id);
    expect(rev.number).toBe(issued.number);
    expect(rev.revision).toBe(2);
    expect(rev.previousContractId).toBe(c0.id);
    expect(rev.status).toBe("rascunho");
    expect(rev.issued).toBeNull();
    expect(rev.content.client.name).toBe(issued.content.client.name);
    expect(rev.id).not.toBe(c0.id);

    const edited = structuredClone(rev.content);
    edited.client.name = "Nome na revisão 2";
    await saveContractDraft(rev.id, edited);
    expect((await getContract(c0.id))!.issued).toEqual(issued.issued);
    expect((await getContract(c0.id))!.content.client.name).toBe("Maria Conceição Açaí");

    const rev3 = await createRevision(rev.id);
    expect(rev3.revision).toBe(3);
    const all = await listContracts();
    expect(isSuperseded((await getContract(c0.id))!, all)).toBe(true);
    expect(isSuperseded(rev3, all)).toBe(false);
  });

  it("a revisão parte do conteúdo EMITIDO, não de edições posteriores ao rascunho", async () => {
    const p = await seed();
    const c0 = await createContractFromProject(p.id);
    await makeReady(c0.id);
    const issued = await issueContract(c0.id);
    const rev = await createRevision(c0.id);
    expect(rev.content.payment.totalCents).toBe(issued.issued!.content.payment.totalCents);
  });
});

describe("revisão de pendências", () => {
  it("campos opcionais vazios não bloqueiam; obrigatórios bloqueiam", async () => {
    const p = await seed();
    const c = await createContractFromProject(p.id);
    const content = structuredClone(c.content);
    content.client.document = "";
    content.client.address = "";
    content.company.address = "";
    content.company.pixKey = "";
    content.schedule.deliveryDate = null;
    content.schedule.leadTime = 20;
    content.payment = recomputePayment({ ...content.payment, downDueDate: "2026-12-01" }, "2026-12-01");
    const r = reviewContract(content);
    expect(r.canIssue).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);

    content.client.name = "";
    content.items = [];
    content.schedule.leadTime = 0;
    content.company.legalName = "";
    content.company.tradeName = "";
    const bad = reviewContract(content);
    expect(bad.canIssue).toBe(false);
    const ids = bad.errors.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(["client-name", "items-empty", "lead", "company-name"]));
  });

  it("detecta soma de parcelas diferente do total, com o valor exato da diferença", async () => {
    const p = await seed();
    const c = await createContractFromProject(p.id);
    const content = structuredClone(c.content);
    content.payment.installments[0].amountCents += 1; // um centavo a mais
    const r = reviewContract(content);
    const e = r.errors.find((x) => x.id === "sum");
    expect(e?.message).toMatch(/excedem/);
    expect(e?.message).toMatch(/0,01/);
  });

  it("prazos contraditórios e vencimento sem data são erros", async () => {
    const p = await seed();
    const c = await createContractFromProject(p.id);
    const content = structuredClone(c.content);
    content.schedule.leadTime = 10;
    content.schedule.startDate = "2026-12-10";
    content.schedule.deliveryDate = "2026-12-01";
    content.payment.installments[0].dueDate = null; // vencimento por data sem data
    const r = reviewContract(content);
    expect(r.errors.map((e) => e.id)).toContain("delivery-before-start");
    expect(r.errors.some((e) => e.id.startsWith("inst-"))).toBe(true);
  });

  it("multa acima de 2% gera aviso (não bloqueia)", async () => {
    const p = await seed();
    const c = await createContractFromProject(p.id);
    const content = structuredClone(c.content);
    content.terms.lateFeePercent = 10;
    expect(reviewContract(content).warnings.map((w) => w.id)).toContain("late-fee");
  });
});

describe("modelo de cláusulas personalizado", () => {
  it("salvar como padrão versiona e é usado por novos contratos; restaurar volta ao modelo-base", async () => {
    const p = await seed();
    const c1 = await createContractFromProject(p.id);
    const clauses = structuredClone(c1.content.clauses);
    clauses[1].body = "Objeto personalizado pelo usuário.";
    await saveContractTemplate("Contrato Personalizado", clauses);
    const s = await getSettings();
    expect(s.contractTemplate?.version).toBe(2);
    const c2 = await createContractFromProject(p.id);
    expect(c2.content.title).toBe("Contrato Personalizado");
    expect(c2.content.clauses[1].body).toBe("Objeto personalizado pelo usuário.");
    expect(c2.content.templateVersion).toBe(2);
    expect(c1.content.clauses[1].body).not.toBe("Objeto personalizado pelo usuário."); // existente intacto
    await resetContractTemplate();
    const c3 = await createContractFromProject(p.id);
    expect(c3.content.clauses[1].body).not.toBe("Objeto personalizado pelo usuário.");
    expect(c3.content.templateVersion).toBe(1);
  });
});

describe("privacidade: exclusão de dados", () => {
  it("exclui um contrato, todos os contratos e dados de clientes dos projetos", async () => {
    const p = await seed();
    const a = await createContractFromProject(p.id);
    await createContractFromProject(p.id);
    await deleteContract(a.id);
    expect(await getContract(a.id)).toBeUndefined();
    expect(await deleteAllContracts()).toBe(1);
    expect(await listContracts()).toHaveLength(0);
    expect(await scrubClientDataFromProjects()).toBeGreaterThanOrEqual(1);
    const cleaned = (await getProject(p.id))!;
    expect(cleaned.clientName).toBe("");
    expect(cleaned.clientPhone).toBe("");
    expect(cleaned.pieces.length).toBeGreaterThan(0); // o resto do orçamento permanece
  });
});

describe("migração do banco Dexie v1 → v2", () => {
  it("preserva projetos, materiais e configurações; adiciona contratos e campos novos", async () => {
    const name = `migr-${Math.random()}`;
    // banco "antigo": só versão 1, sem tabela de contratos e com configurações no formato antigo
    const old = new Dexie(name);
    old.version(1).stores({
      projects: "id, name, clientName, status, updatedAt",
      sheetMaterials: "id, name",
      edgeTapes: "id, name",
      settings: "id",
    });
    const proj = sampleProject();
    await old.table("projects").put(proj);
    const m = proj.materials[0];
    await old.table("sheetMaterials").put(m);
    await old.table("settings").put({ id: "main", companyName: "Marcenaria Antiga", defaultMarkupPercent: 70 });
    old.close();

    const db = new MarcenariaDB(name);
    __setDbForTests(db);
    await db.open();
    expect(db.verno).toBe(2);
    expect(await db.projects.count()).toBe(1);
    expect((await db.projects.get(proj.id))?.pieces).toHaveLength(proj.pieces.length);
    expect((await db.sheetMaterials.get(m.id))?.priceCents).toBe(m.priceCents);
    const s = await getSettings();
    expect(s.companyName).toBe("Marcenaria Antiga");
    expect(s.defaultMarkupPercent).toBe(70);
    expect(s.nextContractNumber).toBe(1);
    expect(s.holidays).toEqual([]);
    expect(s.company.legalName).toBe("");
    // contratos funcionam
    const c = await createContractFromProject(proj.id);
    expect(c.number).toBe(1);
    expect(await db.contracts.count()).toBe(1);
    // orçamento antigo continua calculando igual
    expect(calculateProject((await getProject(proj.id))!).finance.finalPriceCents).toBeGreaterThan(0);
  });
});

describe("backup com contratos", () => {
  it("exporta, apaga tudo e restaura contratos (inclusive a versão emitida imutável)", async () => {
    const p = await seed();
    const c0 = await createContractFromProject(p.id);
    await makeReady(c0.id);
    const issued = await issueContract(c0.id);
    const draft = await createContractFromProject(p.id);

    const backup = await buildBackup();
    expect(backup.schemaVersion).toBe(2);
    expect(backup.data.contracts).toHaveLength(2);
    const text = serializeBackup(backup);
    await wipeAllData();
    expect(await getDb().contracts.count()).toBe(0);

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const summary = await importBackup(parsed.backup, "replace");
    expect(summary.contracts).toBe(2);
    expect((await getContract(c0.id))).toEqual(issued);
    expect((await getContract(draft.id))?.status).toBe("rascunho");
    // configurações (empresa e contadores) também voltam
    const s = await getSettings();
    expect(s.company.legalName).toBe(COMPANY.legalName);
    expect(s.nextContractNumber).toBe(3);
  });

  it("logotipo (data URL) entra no backup e volta", async () => {
    const logo = LOGO_DATA_URL;
    await saveSettings({ ...defaultSettings(), company: { ...COMPANY, logoDataUrl: logo } });
    const text = serializeBackup(await buildBackup());
    await wipeAllData();
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    await importBackup(parsed.backup, "replace");
    expect((await getSettings()).company.logoDataUrl).toBe(logo);
  });

  it("merge mantém o contrato mais novo e traz os que faltam", async () => {
    const p = await seed();
    const a = await createContractFromProject(p.id);
    const backup = await buildBackup();
    const edited = structuredClone(a.content);
    edited.notes = "versão mais nova";
    await saveContractDraft(a.id, edited);
    const onlyHere = await createContractFromProject(p.id);
    await importBackup(backup, "merge");
    expect((await getContract(a.id))!.content.notes).toBe("versão mais nova");
    expect(await getContract(onlyHere.id)).toBeDefined();
    await deleteContract(a.id);
    await importBackup(backup, "merge");
    expect(await getContract(a.id)).toBeDefined();
  });

  it("restaurar backup ANTIGO (v1, sem contratos) continua funcionando", async () => {
    const p = await seed();
    const v2 = JSON.parse(serializeBackup(await buildBackup()));
    // reconstrói como um backup v1 real: sem contratos e sem campos novos nas configurações
    const v1 = {
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      exportedAt: v2.exportedAt,
      appVersion: "1.0.0",
      data: {
        projects: v2.data.projects.map((pr: Record<string, unknown>) => {
          const { number: _n, ...rest } = pr;
          void _n;
          return rest;
        }),
        sheetMaterials: v2.data.sheetMaterials,
        edgeTapes: v2.data.edgeTapes,
        settings: { id: "main", companyName: "Antiga", defaultMarkupPercent: 55 },
      },
    };
    await wipeAllData();
    const parsed = parseBackup(JSON.stringify(v1));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.migratedFrom).toBe(1);
    expect(parsed.backup.schemaVersion).toBe(SCHEMA_VERSION);
    await importBackup(parsed.backup, "replace");
    expect((await getProject(p.id))?.name).toBe(p.name);
    expect(await getDb().contracts.count()).toBe(0);
    expect((await getSettings()).companyName).toBe("Antiga");
  });

  it("recusa backup com contrato corrompido e não altera o banco", async () => {
    const p = await seed();
    const c = await createContractFromProject(p.id);
    const bad = JSON.parse(serializeBackup(await buildBackup()));
    bad.data.contracts[0].content.payment.totalCents = -5;
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
    bad.data.contracts[0] = { id: "x" };
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false);
    expect(await getContract(c.id)).toBeDefined();
  });
});
