/**
 * Cadeia de migrações de backup.
 *
 * Cada entrada `migrations[n]` converte o conteúdo de um backup da versão `n`
 * para a versão `n + 1`.
 */
import { SCHEMA_VERSION } from "@/domain/schema";

type RawBackup = Record<string, unknown>;
export type Migration = (backup: RawBackup) => RawBackup;

export const migrations: Record<number, Migration> = {
  // v1 → v2: módulo de contratos. Backups antigos não têm contratos; as novas
  // configurações (empresa, contadores, feriados) recebem valores padrão do Zod.
  1: (b) => {
    const data = (b.data ?? {}) as Record<string, unknown>;
    return { ...b, data: { ...data, contracts: Array.isArray(data.contracts) ? data.contracts : [] } };
  },
};

export function migrateBackupData(
  raw: RawBackup,
  fromVersion: number,
  table: Record<number, Migration> = migrations,
  targetVersion: number = SCHEMA_VERSION,
): RawBackup {
  let current = raw;
  for (let v = fromVersion; v < targetVersion; v++) {
    const step = table[v];
    if (!step) throw new Error(`não há migração da versão ${v} para ${v + 1}`);
    current = { ...step(current), schemaVersion: v + 1 };
  }
  return current;
}
