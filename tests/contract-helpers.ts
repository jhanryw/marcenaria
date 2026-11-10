import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultSettings, newCostItem } from "@/domain/defaults";
import type { Contract, ContractContent, Project } from "@/domain/schema";
import { companySchema } from "@/domain/schema";
import { FONT_FILES, type FontBytes } from "@/contracts/pdf/fonts";
import type { FontKey } from "@/contracts/pdf/layout";
import { createContentFromProject } from "@/contracts/build-contract";
import { mat, piece, project, settings as baseSettings, tape } from "./helpers";

export function fontBytesFromDisk(): FontBytes {
  const out = {} as FontBytes;
  for (const k of Object.keys(FONT_FILES) as FontKey[]) {
    out[k] = new Uint8Array(readFileSync(join(process.cwd(), "public/fonts", FONT_FILES[k])));
  }
  return out;
}

export const COMPANY = companySchema.parse({
  legalName: "Silva Móveis Planejados Ltda.",
  tradeName: "Silva Marcenaria",
  document: "11.222.333/0001-81",
  address: "Rua das Acácias, 123, Centro",
  city: "São Paulo",
  state: "SP",
  phone: "(11) 99999-0000",
  email: "contato@silvamarcenaria.com.br",
  responsible: "João da Silva",
  pixKey: "contato@silvamarcenaria.com.br",
});

/** Projeto com custos internos "marcadores" para testar vazamento. */
export function sampleProject(): Project {
  const m = mat({ name: "MDF Branco 15 mm", finish: "Branco TX", priceCents: 123457 });
  const t = tape({ pricePerMeterCents: 9137 });
  return project({
    name: "Guarda-roupa do casal",
    clientName: "Maria Conceição Açaí",
    clientPhone: "(11) 98888-7777",
    description: "Guarda-roupa planejado com 3 portas de correr, gavetas e prateleiras.",
    notes: "Cliente prefere puxadores embutidos.",
    materials: [m],
    tapes: [t],
    pieces: [piece(m.id, 2400, 550, { quantity: 2, edges: { top: t.id, bottom: null, left: null, right: null } }), piece(m.id, 880, 500, { quantity: 8 })],
    costItems: [newCostItem({ description: "Dobradiça secreta XYZ", quantity: 8, unitCents: 7731 })],
    labor: {
      fabrication: { mode: "fixed", fixedCents: 135791, hours: 0, hourlyCents: 0 },
      installation: { mode: "fixed", fixedCents: 0, hours: 0, hourlyCents: 0 },
    },
    markupPercent: 63,
  });
}

export function sampleContent(over: Partial<ContractContent> = {}): ContractContent {
  const s = { ...baseSettings, company: COMPANY, contractDefaults: { ...baseSettings.contractDefaults, warrantyMonths: 12 } };
  const c = createContentFromProject(sampleProject(), s);
  c.schedule.leadTime = 30;
  c.schedule.startDate = "2026-12-01";
  c.schedule.deliveryDate = "2027-01-15";
  c.schedule.installationDate = "2027-01-18";
  c.schedule.installationLocation = "Av. Paulista, 1000, apto 52 — São Paulo/SP";
  c.client.document = "529.982.247-25";
  c.client.address = "Av. Paulista, 1000, apto 52, Bela Vista, São Paulo/SP";
  return { ...c, ...over };
}

export function sampleContract(content: ContractContent = sampleContent(), over: Partial<Contract> = {}): Contract {
  return {
    id: "ctr-1",
    number: 1,
    revision: 1,
    previousContractId: null,
    projectId: "prj-1",
    projectNumber: 1,
    projectName: "Guarda-roupa do casal",
    budgetDate: new Date().toISOString(),
    status: "rascunho",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    issuedAt: null,
    signedAt: null,
    signedNote: "",
    cancelledAt: null,
    cancelReason: "",
    content,
    issued: null,
    ...over,
  };
}

export { defaultSettings };
