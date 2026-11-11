import { newCostItem } from "@/domain/defaults";
import type { Project } from "@/domain/schema";
import { mat, piece, project, tape } from "./helpers";

/** Projeto com valores "marcadores" em preços/custos/cliente para provar que nada disso vaza na exportação. */
export const SECRETS = {
  sheetPrice: 123457, // R$ 1.234,57
  tapePrice: 9137, // R$ 91,37
  hardware: "Dobradiça secreta XYZ",
  clientName: "Maria Conceição Açaí",
  clientPhone: "(11) 98888-7777",
  description: "Descrição comercial confidencial do guarda-roupa",
  projectNotes: "Observação interna: cliente pagou entrada",
  fabrication: 135791,
};

export function exportProject(over: Partial<Project> = {}): Project {
  const branco = mat({ name: "MDF Branco 15 mm", finish: "Branco TX", thicknessMm: 15, priceCents: SECRETS.sheetPrice });
  const amad = mat({ name: "MDF Amadeirado 18 mm", finish: "Carvalho", thicknessMm: 18, priceCents: 98765, grainRequired: true });
  const fundo = mat({ name: "MDF Branco 6 mm (fundos)", finish: "Branco", thicknessMm: 6, priceCents: 15000 });
  const tBranca = tape({ name: "Fita branca 22 mm", color: "Branco", pricePerMeterCents: SECRETS.tapePrice, wastePercent: 10 });
  const tAmad = tape({ name: "Fita carvalho 22 mm", color: "Carvalho", pricePerMeterCents: 4321, wastePercent: 8 });
  const pieces = [
    piece(branco.id, 2400, 550, { description: "Lateral", ref: "L1", quantity: 2, edges: { top: tBranca.id, bottom: null, left: null, right: null }, notes: "Furação para dobradiças" }),
    piece(branco.id, 1800, 550, { description: "Base e tampo", quantity: 2, edges: { top: tBranca.id, bottom: tBranca.id, left: tBranca.id, right: tBranca.id } }),
    piece(branco.id, 880, 500, { description: "Prateleira", quantity: 8, edges: { top: tBranca.id, bottom: null, left: null, right: null } }),
    piece(branco.id, 2300, 500, { description: "Divisória", quantity: 2 }),
    piece(branco.id, 800, 200, { description: "Frente de gaveta", quantity: 6, allowRotation: false, notes: "Puxador cava" }),
    piece(branco.id, 300, 120, { description: "Travessa pequena", quantity: 5 }),
    piece(amad.id, 2350, 620, { description: "Porta de correr", quantity: 3, edges: { top: tAmad.id, bottom: tAmad.id, left: tAmad.id, right: tAmad.id } }),
    piece(amad.id, 1200, 400, { description: "Painel ripado", quantity: 2, edges: { top: null, bottom: null, left: tAmad.id, right: null } }),
    piece(fundo.id, 2350, 900, { description: "Fundo", quantity: 2 }),
  ];
  return project({
    name: "Guarda-roupa do casal",
    clientName: SECRETS.clientName,
    clientPhone: SECRETS.clientPhone,
    description: SECRETS.description,
    notes: SECRETS.projectNotes,
    materials: [branco, amad, fundo],
    tapes: [tBranca, tAmad],
    pieces,
    costItems: [newCostItem({ description: SECRETS.hardware, quantity: 8, unitCents: 7731 })],
    labor: {
      fabrication: { mode: "fixed", fixedCents: SECRETS.fabrication, hours: 0, hourlyCents: 0 },
      installation: { mode: "fixed", fixedCents: 0, hours: 0, hourlyCents: 0 },
    },
    markupPercent: 63,
    manualPriceCents: 999999,
    reserve: { mode: "sheets", value: 1 },
    ...over,
  });
}
