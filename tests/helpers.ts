import { newEdgeTape, newPiece, newProject, newSheetMaterial, defaultSettings } from "@/domain/defaults";
import type { EdgeTape, Piece, Project, SheetMaterial } from "@/domain/schema";

export const settings = defaultSettings();

let counter = 0;
export function uid(prefix = "id") {
  counter++;
  return `${prefix}-${counter}`;
}

export function mat(partial: Partial<SheetMaterial> = {}): SheetMaterial {
  return newSheetMaterial(settings, {
    id: uid("mat"),
    name: "MDF Branco 15mm",
    thicknessMm: 15,
    ...partial,
  });
}

export function tape(partial: Partial<EdgeTape> = {}): EdgeTape {
  return newEdgeTape(settings, { id: uid("tape"), name: "Fita branca", wastePercent: 0, pricePerMeterCents: 250, ...partial });
}

export function piece(materialId: string, lengthMm: number, widthMm: number, partial: Partial<Piece> = {}): Piece {
  return newPiece(materialId, {
    id: uid("pc"),
    description: `Peça ${lengthMm}x${widthMm}`,
    lengthMm,
    widthMm,
    ...partial,
  });
}

export function project(partial: Partial<Project> = {}): Project {
  return newProject(settings, { id: uid("prj"), name: "Projeto teste", ...partial });
}

/** PRNG determinístico (mulberry32) para testes de fuzz reprodutíveis */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
