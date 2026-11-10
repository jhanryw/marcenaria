/**
 * Operações de dados. Toda leitura/escrita passa por aqui para que a interface
 * não dependa diretamente do Dexie (facilita migrar para um backend depois).
 */
import { defaultSettings, newProject } from "@/domain/defaults";
import {
  edgeTapeSchema,
  projectSchema,
  settingsSchema,
  sheetMaterialSchema,
  type EdgeTape,
  type Piece,
  type Project,
  type Settings,
  type SheetMaterial,
} from "@/domain/schema";
import { newId, nowIso } from "@/lib/utils";
import { getDb } from "./db";

/* ------------------------------ Configurações ----------------------------- */

export async function getSettings(): Promise<Settings> {
  const db = getDb();
  const row = await db.settings.get("main");
  if (!row) return defaultSettings();
  // `parse` preenche campos novos com defaults caso o registro seja antigo
  const parsed = settingsSchema.safeParse(row);
  return parsed.success ? parsed.data : defaultSettings();
}

export async function saveSettings(settings: Settings): Promise<void> {
  await getDb().settings.put(settingsSchema.parse({ ...settings, id: "main" }));
}

/* -------------------------------- Projetos -------------------------------- */

export async function createProject(partial: Partial<Project> = {}): Promise<Project> {
  const settings = await getSettings();
  const project = newProject(settings, partial);
  await getDb().projects.put(project);
  return project;
}

export async function getProject(id: string): Promise<Project | undefined> {
  const row = await getDb().projects.get(id);
  if (!row) return undefined;
  const parsed = projectSchema.safeParse(row);
  return parsed.success ? parsed.data : (row as Project);
}

/** Salva o projeto atualizando `updatedAt`. Retorna o projeto salvo. */
export async function saveProject(project: Project): Promise<Project> {
  const toSave: Project = { ...project, updatedAt: nowIso() };
  await getDb().projects.put(toSave);
  return toSave;
}

export async function deleteProject(id: string): Promise<void> {
  await getDb().projects.delete(id);
}

/**
 * Duplica o projeto: novos ids para projeto, peças e custos. Os snapshots de
 * material/fita são copiados como estão (preços da época do original).
 */
export async function duplicateProject(id: string): Promise<Project | undefined> {
  const original = await getProject(id);
  if (!original) return undefined;
  const now = nowIso();
  const copy: Project = structuredClone(original);
  copy.id = newId();
  copy.name = `${original.name} (cópia)`;
  copy.status = "rascunho";
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.pieces = copy.pieces.map((p) => ({ ...p, id: newId() }));
  copy.costItems = copy.costItems.map((c) => ({ ...c, id: newId() }));
  await getDb().projects.put(copy);
  return copy;
}

export interface ProjectFilter {
  search?: string;
  status?: Project["status"] | "todos";
}

export function filterProjects(projects: Project[], filter: ProjectFilter): Project[] {
  const q = (filter.search ?? "").trim().toLowerCase();
  return projects
    .filter((p) => (filter.status && filter.status !== "todos" ? p.status === filter.status : true))
    .filter((p) =>
      q === "" ? true : p.name.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/* ----------------------------- Catálogo (MDF/fita) ----------------------- */

export async function saveSheetMaterial(m: SheetMaterial): Promise<void> {
  await getDb().sheetMaterials.put(sheetMaterialSchema.parse({ ...m, updatedAt: nowIso() }));
}
export async function deleteSheetMaterial(id: string): Promise<void> {
  await getDb().sheetMaterials.delete(id);
}
export async function saveEdgeTape(t: EdgeTape): Promise<void> {
  await getDb().edgeTapes.put(edgeTapeSchema.parse({ ...t, updatedAt: nowIso() }));
}
export async function deleteEdgeTape(id: string): Promise<void> {
  await getDb().edgeTapes.delete(id);
}

/* ------------------- Snapshots de materiais dentro do projeto ------------- */

/** Copia um material do catálogo para o orçamento (se ainda não estiver nele). */
export function withMaterialSnapshot(project: Project, material: SheetMaterial): Project {
  if (project.materials.some((m) => m.id === material.id)) return project;
  return { ...project, materials: [...project.materials, structuredClone(material)] };
}

export function withTapeSnapshot(project: Project, tape: EdgeTape): Project {
  if (project.tapes.some((t) => t.id === tape.id)) return project;
  return { ...project, tapes: [...project.tapes, structuredClone(tape)] };
}

/** Atualiza o snapshot com os valores atuais do catálogo (ação explícita do usuário). */
export function refreshMaterialSnapshot(project: Project, material: SheetMaterial): Project {
  return {
    ...project,
    materials: project.materials.map((m) => (m.id === material.id ? structuredClone(material) : m)),
  };
}

export function refreshTapeSnapshot(project: Project, tape: EdgeTape): Project {
  return {
    ...project,
    tapes: project.tapes.map((t) => (t.id === tape.id ? structuredClone(tape) : t)),
  };
}

export function removePiecesOfMaterial(project: Project, materialId: string): Piece[] {
  return project.pieces.filter((p) => p.materialId !== materialId);
}
