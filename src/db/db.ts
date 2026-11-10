/**
 * Banco local (IndexedDB via Dexie).
 *
 * IMPORTANTE sobre atualizações: o service worker só guarda ARQUIVOS DO APP
 * (HTML/JS/CSS). Os dados dos orçamentos ficam no IndexedDB, que o service
 * worker nunca toca; atualizar o aplicativo não apaga orçamentos.
 *
 * Mudanças de esquema do banco devem ser feitas com novas chamadas
 * `db.version(n+1).stores(...).upgrade(...)`, nunca editando a versão 1.
 */
import Dexie, { type EntityTable } from "dexie";
import { settingsSchema, type Contract, type EdgeTape, type Project, type SheetMaterial, type Settings } from "@/domain/schema";

export class MarcenariaDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  sheetMaterials!: EntityTable<SheetMaterial, "id">;
  edgeTapes!: EntityTable<EdgeTape, "id">;
  settings!: EntityTable<Settings, "id">;
  contracts!: EntityTable<Contract, "id">;

  constructor(name = "marcenaria-orcamentos") {
    super(name);
    this.version(1).stores({
      projects: "id, name, clientName, status, updatedAt",
      sheetMaterials: "id, name",
      edgeTapes: "id, name",
      settings: "id",
    });
    // v2: módulo de contratos. Só ADICIONA a tabela `contracts`; nenhuma tabela existente é alterada ou apagada.
    this.version(2)
      .stores({
        projects: "id, name, clientName, status, updatedAt",
        sheetMaterials: "id, name",
        edgeTapes: "id, name",
        settings: "id",
        contracts: "id, projectId, number, status, updatedAt",
      })
      .upgrade(async (tx) => {
        // completa as configurações antigas com os campos novos (empresa, contadores, feriados...)
        await tx
          .table("settings")
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            const full = settingsSchema.parse(row);
            Object.assign(row, {
              company: full.company,
              nextContractNumber: full.nextContractNumber,
              nextProjectNumber: full.nextProjectNumber,
              holidays: full.holidays,
              contractDefaults: full.contractDefaults,
              contractTemplate: full.contractTemplate,
            });
          });
      });
  }
}

let instance: MarcenariaDB | null = null;

export function getDb(): MarcenariaDB {
  if (!instance) instance = new MarcenariaDB();
  return instance;
}

/** Somente para testes: troca/zera a instância. */
export function __setDbForTests(db: MarcenariaDB | null) {
  instance = db;
}
