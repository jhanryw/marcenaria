import { defaultSettings, newEdgeTape, newSheetMaterial } from "@/domain/defaults";
import { getDb } from "./db";

/**
 * Primeira execução: cria configurações e alguns itens de EXEMPLO no catálogo
 * (preços ilustrativos — o usuário deve ajustá-los). Roda uma única vez: depois
 * que o registro de configurações existe, itens apagados não voltam.
 */
export async function ensureSeeded(): Promise<boolean> {
  const db = getDb();
  const existing = await db.settings.get("main");
  if (existing) return false;
  const s = defaultSettings();
  await db.transaction("rw", db.settings, db.sheetMaterials, db.edgeTapes, async () => {
    if ((await db.settings.get("main")) !== undefined) return; // outra aba semeou
    await db.settings.put(s);
    if ((await db.sheetMaterials.count()) === 0) {
      await db.sheetMaterials.bulkPut([
        newSheetMaterial(s, { name: "MDF Branco 15 mm", finish: "Branco TX", thicknessMm: 15, priceCents: 32000 }),
        newSheetMaterial(s, { name: "MDF Amadeirado 18 mm", finish: "Amadeirado", thicknessMm: 18, priceCents: 41000, grainRequired: true }),
        newSheetMaterial(s, { name: "MDF Branco 6 mm (fundos)", finish: "Branco", thicknessMm: 6, priceCents: 15000 }),
      ]);
    }
    if ((await db.edgeTapes.count()) === 0) {
      await db.edgeTapes.bulkPut([
        newEdgeTape(s, { name: "Fita branca 22 mm", color: "Branco", widthMm: 22, thicknessMm: 0.45, pricePerMeterCents: 250 }),
        newEdgeTape(s, { name: "Fita amadeirada 22 mm", color: "Amadeirado", widthMm: 22, thicknessMm: 0.45, pricePerMeterCents: 400 }),
      ]);
    }
  });
  return true;
}
