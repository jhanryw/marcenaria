import { expect, type Page } from "@playwright/test";

export const money = (v: string) => new RegExp(v.replace(/\s/g, "\\s").replace(/\./g, "\\.").replace("$", "\\$"));

/** Abre o app e espera o banco inicial (itens de exemplo) estar pronto. */
export async function openHome(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Marcenaria" })).toBeVisible();
  // o catálogo de exemplo é criado na primeira execução
  await page.waitForFunction(async () => {
    const dbs = await indexedDB.databases();
    return dbs.some((d) => d.name === "marcenaria-orcamentos");
  });
}

export async function createProjectViaHome(page: Page, name: string) {
  await openHome(page);
  await page.getByRole("button", { name: /novo/i }).first().click();
  await page.waitForURL(/\/projeto\/\?id=/);
  await page.getByRole("tab", { name: /dados/i }).click();
  await page.getByLabel("Nome do projeto").fill(name);
  await page.getByRole("tab", { name: /peças/i }).click();
}

export async function addPiece(
  page: Page,
  p: { desc: string; length: number; width: number; qty?: number; material?: string; rotate?: boolean; another?: boolean },
) {
  const addBtn = page.getByRole("button", { name: /adicionar primeira peça|^\s*\+?\s*Peça$|adicionar peça/i }).first();
  await addBtn.click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible();
  await dlg.getByLabel("Descrição").fill(p.desc);
  const sel = dlg.getByLabel("Material (chapa)");
  const wanted = p.material ?? "MDF Branco 15 mm";
  const labels = await sel.locator("option").allTextContents();
  const label = labels.find((l) => l.startsWith(wanted));
  if (!label) throw new Error(`Material "${wanted}" não encontrado: ${labels.join(" | ")}`);
  await sel.selectOption({ label });
  await dlg.getByLabel("Comprimento").fill(String(p.length));
  await dlg.getByLabel("Largura").fill(String(p.width));
  if (p.qty) await dlg.getByLabel("Quantidade").fill(String(p.qty));
  await dlg.getByRole("button", { name: "Salvar peça" }).click();
  await expect(dlg).toBeHidden();
}

export async function noHorizontalScroll(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  expect(sw, `scrollWidth ${sw} > innerWidth ${iw}`).toBeLessThanOrEqual(iw);
}
