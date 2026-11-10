/**
 * Persistência e ciclo de vida dos contratos.
 *
 * Estados: rascunho → emitido → assinado | cancelado.
 *  - Só RASCUNHOS aceitam edição de conteúdo.
 *  - Emitir grava uma cópia imutável (`issued`) do conteúdo e do texto final das cláusulas.
 *  - Gerar o PDF NUNCA marca o contrato como assinado; "assinado" é um registro manual do usuário
 *    (o app não verifica a autenticidade de assinaturas).
 *  - Mudar o orçamento depois não altera contratos existentes (eles têm cópia própria dos dados).
 */
import { createContentFromProject } from "@/contracts/build-contract";
import { todayISO } from "@/contracts/dates";
import { reviewContract } from "@/contracts/review";
import { BASE_TEMPLATE_VERSION, DEFAULT_CLAUSES, DEFAULT_TITLE, formatContractNumberSafe, resolveClauses } from "@/contracts/template";
import {
  contractContentSchema,
  contractSchema,
  settingsSchema,
  type Clause,
  type Contract,
  type ContractContent,
} from "@/domain/schema";
import { defaultSettings } from "@/domain/defaults";
import { newId, nowIso } from "@/lib/utils";
import { getDb } from "./db";

export class ContractError extends Error {
  constructor(
    public code: "not-found" | "locked" | "invalid-state" | "not-ready",
    message: string,
  ) {
    super(message);
    this.name = "ContractError";
  }
}

/* ------------------------------ leitura ------------------------------ */

export async function getContract(id: string): Promise<Contract | undefined> {
  const row = await getDb().contracts.get(id);
  if (!row) return undefined;
  const parsed = contractSchema.safeParse(row);
  return parsed.success ? parsed.data : (row as Contract);
}

export async function listContracts(): Promise<Contract[]> {
  const rows = await getDb().contracts.toArray();
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listContractsByProject(projectId: string): Promise<Contract[]> {
  const rows = await getDb().contracts.where("projectId").equals(projectId).toArray();
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Há revisão posterior deste contrato? (para marcar como "substituído") */
export function isSuperseded(contract: Contract, all: Contract[]): boolean {
  return all.some((c) => c.previousContractId === contract.id && c.status !== "cancelado");
}

/* ------------------------------ criação ------------------------------ */

async function readSettings() {
  const db = getDb();
  const row = await db.settings.get("main");
  const parsed = settingsSchema.safeParse(row ?? defaultSettings());
  return parsed.success ? parsed.data : defaultSettings();
}

/** Cria um rascunho com os dados do orçamento. Aloca número do contrato e (se faltar) número do projeto. */
export async function createContractFromProject(projectId: string): Promise<Contract> {
  const db = getDb();
  return db.transaction("rw", [db.projects, db.settings, db.contracts], async () => {
    const project = await db.projects.get(projectId);
    if (!project) throw new ContractError("not-found", "Projeto não encontrado.");
    const settings = await readSettings();

    let projectNumber = project.number;
    let nextProject = settings.nextProjectNumber;
    if (!projectNumber) {
      projectNumber = nextProject++;
      await db.projects.put({ ...project, number: projectNumber });
    }
    const number = settings.nextContractNumber;
    await db.settings.put({ ...settings, id: "main", nextContractNumber: number + 1, nextProjectNumber: nextProject });

    const now = nowIso();
    const contract: Contract = {
      id: newId(),
      number,
      revision: 1,
      previousContractId: null,
      projectId,
      projectNumber,
      projectName: project.name,
      budgetDate: project.updatedAt,
      status: "rascunho",
      createdAt: now,
      updatedAt: now,
      issuedAt: null,
      signedAt: null,
      signedNote: "",
      cancelledAt: null,
      cancelReason: "",
      content: createContentFromProject({ ...project, number: projectNumber }, settings),
      issued: null,
    };
    await db.contracts.put(contract);
    return contract;
  });
}

/* ------------------------------ edição (só rascunho) ------------------------------ */

export async function saveContractDraft(id: string, content: ContractContent): Promise<Contract> {
  const db = getDb();
  return db.transaction("rw", db.contracts, async () => {
    const cur = await db.contracts.get(id);
    if (!cur) throw new ContractError("not-found", "Contrato não encontrado.");
    if (cur.status !== "rascunho") throw new ContractError("locked", "Contratos emitidos não podem ser editados. Crie uma nova revisão.");
    const next: Contract = { ...cur, content: contractContentSchema.parse(content), updatedAt: nowIso() };
    await db.contracts.put(next);
    return next;
  });
}

/* ------------------------------ emissão e estados ------------------------------ */

export async function issueContract(id: string): Promise<Contract> {
  const db = getDb();
  return db.transaction("rw", db.contracts, async () => {
    const cur = await db.contracts.get(id);
    if (!cur) throw new ContractError("not-found", "Contrato não encontrado.");
    if (cur.status !== "rascunho") throw new ContractError("invalid-state", "Este contrato já foi emitido.");
    const review = reviewContract(cur.content);
    if (!review.canIssue) throw new ContractError("not-ready", `Resolva ${review.errors.length} pendência(s) obrigatória(s) antes de emitir.`);

    const frozen = structuredClone(cur.content);
    const numberLabel = formatContractNumberSafe(cur.number, cur.revision);
    const now = nowIso();
    const next: Contract = {
      ...cur,
      status: "emitido",
      issuedAt: now,
      updatedAt: now,
      issued: { content: frozen, clauses: resolveClauses(frozen, { numberLabel }), date: todayISO() },
    };
    await db.contracts.put(next);
    return next;
  });
}

export async function markContractSigned(id: string, opts: { date: string; note?: string }): Promise<Contract> {
  const db = getDb();
  return db.transaction("rw", db.contracts, async () => {
    const cur = await db.contracts.get(id);
    if (!cur) throw new ContractError("not-found", "Contrato não encontrado.");
    if (cur.status !== "emitido") throw new ContractError("invalid-state", "Só contratos emitidos podem ser marcados como assinados.");
    const next: Contract = { ...cur, status: "assinado", signedAt: opts.date, signedNote: (opts.note ?? "").trim(), updatedAt: nowIso() };
    await db.contracts.put(next);
    return next;
  });
}

export async function cancelContract(id: string, reason = ""): Promise<Contract> {
  const db = getDb();
  return db.transaction("rw", db.contracts, async () => {
    const cur = await db.contracts.get(id);
    if (!cur) throw new ContractError("not-found", "Contrato não encontrado.");
    if (cur.status === "cancelado") throw new ContractError("invalid-state", "Este contrato já está cancelado.");
    const now = nowIso();
    const next: Contract = { ...cur, status: "cancelado", cancelledAt: now, cancelReason: reason.trim(), updatedAt: now };
    await db.contracts.put(next);
    return next;
  });
}

/** Nova revisão (rascunho) a partir de um contrato existente. Usa o conteúdo EMITIDO quando houver. */
export async function createRevision(id: string): Promise<Contract> {
  const db = getDb();
  return db.transaction("rw", db.contracts, async () => {
    const cur = await db.contracts.get(id);
    if (!cur) throw new ContractError("not-found", "Contrato não encontrado.");
    const sameNumber = await db.contracts.where("number").equals(cur.number).toArray();
    const revision = Math.max(...sameNumber.map((c) => c.revision)) + 1;
    const now = nowIso();
    const content = structuredClone(cur.issued?.content ?? cur.content);
    const next: Contract = {
      ...cur,
      id: newId(),
      revision,
      previousContractId: cur.id,
      status: "rascunho",
      createdAt: now,
      updatedAt: now,
      issuedAt: null,
      signedAt: null,
      signedNote: "",
      cancelledAt: null,
      cancelReason: "",
      content: { ...content, items: content.items.map((i) => ({ ...i, id: newId() })), payment: { ...content.payment, installments: content.payment.installments.map((i) => ({ ...i, id: newId() })) } },
      issued: null,
    };
    await db.contracts.put(next);
    return next;
  });
}

export async function deleteContract(id: string): Promise<void> {
  await getDb().contracts.delete(id);
}

export async function deleteAllContracts(): Promise<number> {
  const db = getDb();
  const n = await db.contracts.count();
  await db.contracts.clear();
  return n;
}

/** Privacidade: remove nome e telefone de cliente dos orçamentos (os contratos têm exclusão própria). */
export async function scrubClientDataFromProjects(): Promise<number> {
  const db = getDb();
  let n = 0;
  await db.transaction("rw", db.projects, async () => {
    await db.projects.toCollection().modify((p) => {
      if (p.clientName || p.clientPhone || p.commercial?.client) n++;
      p.clientName = "";
      p.clientPhone = "";
      if (p.commercial) delete p.commercial.client;
    });
  });
  return n;
}

/* ------------------------------ modelo de cláusulas ------------------------------ */

export async function saveContractTemplate(title: string, clauses: Clause[]): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.settings, async () => {
    const s = await readSettings();
    const version = (s.contractTemplate?.version ?? BASE_TEMPLATE_VERSION) + 1;
    await db.settings.put({ ...s, id: "main", contractTemplate: { version, title: title.trim() || DEFAULT_TITLE, clauses: structuredClone(clauses) } });
  });
}

export async function resetContractTemplate(): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.settings, async () => {
    const s = await readSettings();
    await db.settings.put({ ...s, id: "main", contractTemplate: null });
  });
}

export function baseClauses(): Clause[] {
  return structuredClone(DEFAULT_CLAUSES);
}
