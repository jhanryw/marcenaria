import { expect, type Page } from "@playwright/test";

/** Só os campos que os testes de unidade conferem do que está gravado no IndexedDB. */
export interface Project {
  name: string;
  pieces: Array<{ id: string; description: string; lengthMm: number; widthMm: number; quantity: number }>;
  materials: Array<{ id: string; lengthMm: number; widthMm: number; thicknessMm: number; marginMm: number; kerfMm: number }>;
}

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
  // a interface trabalha em centímetros; os testes descrevem as peças em mm (como o motor) e o helper converte
  const cm = (mm: number) => String(mm / 10).replace(".", ",");
  await dlg.getByLabel("Comprimento").fill(cm(p.length));
  await dlg.getByLabel("Largura").fill(cm(p.width));
  if (p.qty) await dlg.getByLabel("Quantidade").fill(String(p.qty));
  await dlg.getByRole("button", { name: "Salvar peça" }).click();
  await expect(dlg).toBeHidden();
}

/** Lê um projeto direto do IndexedDB (o que está GRAVADO, em mm). */
export async function readProjectFromDb(page: Page, name: string) {
  return page.evaluate(
    (n) =>
      new Promise<Project | null>((resolve, reject) => {
        const open = indexedDB.open("marcenaria-orcamentos");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction("projects").objectStore("projects").getAll();
          all.onsuccess = () => resolve((all.result as Project[]).find((p) => p.name === n) ?? null);
          all.onerror = () => reject(all.error);
        };
      }),
    name,
  );
}

export async function noHorizontalScroll(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  expect(sw, `scrollWidth ${sw} > innerWidth ${iw}`).toBeLessThanOrEqual(iw);
}
