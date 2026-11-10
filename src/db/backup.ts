/**
 * Exportação / importação de backups em JSON.
 *
 * O arquivo é versionado (`schemaVersion`). Ao importar:
 *  1. o JSON é lido e a versão detectada;
 *  2. backups ANTIGOS passam pela cadeia de migrações (src/db/migrations.ts);
 *  3. backups de versão MAIS NOVA que o app são recusados com mensagem clara;
 *  4. o resultado é validado com Zod antes de tocar no banco.
 * A gravação é transacional: ou entra tudo, ou nada.
 */
import {
  BACKUP_FORMAT,
  SCHEMA_VERSION,
  backupSchema,
  type Backup,
} from "@/domain/schema";
import { nowIso } from "@/lib/utils";
import { getDb } from "./db";
import { migrateBackupData } from "./migrations";
import { getSettings, saveSettings } from "./repository";

export const APP_VERSION = "1.0.0";

export async function buildBackup(): Promise<Backup> {
  const db = getDb();
  const [projects, sheetMaterials, edgeTapes, settings, contracts] = await Promise.all([
    db.projects.toArray(),
    db.sheetMaterials.toArray(),
    db.edgeTapes.toArray(),
    getSettings(),
    db.contracts.toArray(),
  ]);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    appVersion: APP_VERSION,
    data: { projects, sheetMaterials, edgeTapes, settings, contracts },
  };
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2);
}

export function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `marcenaria-backup-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}.json`;
}

export type ParseBackupResult =
  | { ok: true; backup: Backup; migratedFrom: number | null }
  | { ok: false; error: string };

/** Lê e valida o texto de um backup. Nunca lança exceção. */
export function parseBackup(text: string): ParseBackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "O arquivo não é um JSON válido." };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Formato de backup não reconhecido." };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT) {
    return { ok: false, error: "Este arquivo não parece ser um backup deste aplicativo." };
  }
  const version = obj.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: "Versão do backup ausente ou inválida." };
  }
  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Este backup foi criado por uma versão mais nova do aplicativo (esquema ${version}). Atualize o aplicativo antes de importar.`,
    };
  }

  let migrated: Record<string, unknown> = obj;
  let migratedFrom: number | null = null;
  if (version < SCHEMA_VERSION) {
    try {
      migrated = migrateBackupData(obj, version);
      migratedFrom = version;
    } catch (e) {
      return { ok: false, error: `Falha ao migrar o backup da versão ${version}: ${(e as Error).message}` };
    }
  }

  const parsed = backupSchema.safeParse(migrated);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first ? first.path.join(".") : "";
    return {
      ok: false,
      error: `Backup inválido${where ? ` em "${where}"` : ""}: ${first?.message ?? "dados incompatíveis"}.`,
    };
  }

  // integridade referencial leve: peças precisam apontar para materiais do próprio projeto
  for (const p of parsed.data.data.projects) {
    const ids = new Set(p.materials.map((m) => m.id));
    const bad = p.pieces.find((pc) => !ids.has(pc.materialId));
    if (bad) {
      return {
        ok: false,
        error: `Projeto "${p.name}": a peça "${bad.description}" referencia um material que não está no backup.`,
      };
    }
  }

  return { ok: true, backup: parsed.data, migratedFrom };
}

export type ImportMode = "replace" | "merge";

export interface ImportSummary {
  projects: number;
  sheetMaterials: number;
  edgeTapes: number;
  contracts: number;
  /** Registros que já existiam e foram mantidos por serem mais novos (merge) */
  keptNewer: number;
}

/**
 * Importa um backup já validado.
 *  - "replace": apaga tudo e restaura o backup;
 *  - "merge": adiciona/atualiza por id; em conflito vence o `updatedAt` mais recente.
 */
export async function importBackup(backup: Backup, mode: ImportMode): Promise<ImportSummary> {
  const db = getDb();
  const summary: ImportSummary = { projects: 0, sheetMaterials: 0, edgeTapes: 0, contracts: 0, keptNewer: 0 };

  await db.transaction("rw", [db.projects, db.sheetMaterials, db.edgeTapes, db.settings, db.contracts], async () => {
    if (mode === "replace") {
      await Promise.all([db.projects.clear(), db.sheetMaterials.clear(), db.edgeTapes.clear(), db.contracts.clear()]);
      await db.contracts.bulkPut(backup.data.contracts);
      summary.contracts = backup.data.contracts.length;
      await db.projects.bulkPut(backup.data.projects);
      await db.sheetMaterials.bulkPut(backup.data.sheetMaterials);
      await db.edgeTapes.bulkPut(backup.data.edgeTapes);
      summary.projects = backup.data.projects.length;
      summary.sheetMaterials = backup.data.sheetMaterials.length;
      summary.edgeTapes = backup.data.edgeTapes.length;
      if (backup.data.settings) await db.settings.put({ ...backup.data.settings, id: "main" });
      return;
    }

    const mergeRows = async <T extends { id: string; updatedAt: string }>(
      get: (id: string) => Promise<T | undefined>,
      put: (row: T) => Promise<unknown>,
      rows: T[],
      counter: "projects" | "sheetMaterials" | "edgeTapes" | "contracts",
    ) => {
      for (const row of rows) {
        const existing = await get(row.id);
        if (existing && existing.updatedAt >= row.updatedAt) {
          summary.keptNewer++;
          continue;
        }
        await put(row);
        summary[counter]++;
      }
    };
    await mergeRows((id) => db.projects.get(id), (r) => db.projects.put(r), backup.data.projects, "projects");
    await mergeRows((id) => db.sheetMaterials.get(id), (r) => db.sheetMaterials.put(r), backup.data.sheetMaterials, "sheetMaterials");
    await mergeRows((id) => db.edgeTapes.get(id), (r) => db.edgeTapes.put(r), backup.data.edgeTapes, "edgeTapes");
    await mergeRows((id) => db.contracts.get(id), (r) => db.contracts.put(r), backup.data.contracts, "contracts");
    // configurações atuais do aparelho são mantidas no merge
  });

  return summary;
}

/** Marca o horário do último backup exportado. */
export async function markBackupDone(): Promise<void> {
  const s = await getSettings();
  await saveSettings({ ...s, lastBackupAt: nowIso() });
}

/** Apaga TODOS os dados locais (usado em "Apagar tudo" nas configurações). */
export async function wipeAllData(): Promise<void> {
  const db = getDb();
  await db.transaction("rw", [db.projects, db.sheetMaterials, db.edgeTapes, db.settings, db.contracts], async () => {
    await Promise.all([db.projects.clear(), db.sheetMaterials.clear(), db.edgeTapes.clear(), db.settings.clear(), db.contracts.clear()]);
  });
}
