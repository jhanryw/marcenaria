import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { addPiece, createProjectViaHome, openHome, readProjectFromDb } from "./helpers";

/** Grava direto no IndexedDB um projeto "antigo": medidas em MILÍMETROS, como salvo antes da interface em cm. */
async function seedOldProject(page: Page) {
  await openHome(page);
  await page.waitForTimeout(500);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const now = new Date().toISOString();
        const mat = {
          id: "m-old", name: "MDF Branco 15 mm", manufacturer: "", finish: "", thicknessMm: 15, widthMm: 1850, lengthMm: 2750,
          priceCents: 32000, marginMm: 10, kerfMm: 3, grainRequired: false, createdAt: now, updatedAt: now,
        };
        const proj = {
          id: "p-old", name: "Projeto antigo", status: "rascunho", createdAt: now, updatedAt: now,
          materials: [mat],
          pieces: [
            { id: "pc1", ref: "", description: "Lateral antiga", materialId: "m-old", widthMm: 600, lengthMm: 1800, quantity: 2, allowRotation: true, notes: "" },
            { id: "pc2", ref: "", description: "Prateleira antiga", materialId: "m-old", widthMm: 450, lengthMm: 800, quantity: 6, allowRotation: true, notes: "" },
          ],
        };
        const open = indexedDB.open("marcenaria-orcamentos");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(["projects"], "readwrite");
          tx.objectStore("projects").put(proj);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

test("campos de peça em centímetros: 60, 60,5 e 60.5 viram 600, 605 e 605 mm gravados", async ({ page }) => {
  await createProjectViaHome(page, "Cm novo");
  await page.getByRole("button", { name: /adicionar primeira peça/i }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByLabel("Comprimento (cm)")).toBeVisible();
  await expect(dlg.getByLabel("Largura (cm)")).toBeVisible();
  for (const label of ["Comprimento (cm)", "Largura (cm)"]) {
    await expect(dlg.getByLabel(label)).toHaveAttribute("inputmode", "decimal");
  }
  await expect(dlg.getByLabel("Comprimento (cm)")).toHaveAttribute("placeholder", "180");

  const savePiece = async (desc: string, len: string, wid: string) => {
    await dlg.getByLabel("Descrição").fill(desc);
    await dlg.getByLabel("Material (chapa)").selectOption({ index: 1 });
    await dlg.getByLabel("Comprimento (cm)").fill(len);
    await dlg.getByLabel("Largura (cm)").fill(wid);
  };
  await savePiece("A", "180", "60");
  await dlg.getByRole("button", { name: "Salvar e adicionar outra" }).click();
  await savePiece("B", "180", "60,5");
  await dlg.getByRole("button", { name: "Salvar e adicionar outra" }).click();
  await savePiece("C", "120,5", "60.5");
  await dlg.getByRole("button", { name: "Salvar peça" }).click();
  await expect(page.getByText("salvo", { exact: true })).toBeVisible();

  const saved = await readProjectFromDb(page, "Cm novo");
  const byDesc = Object.fromEntries(saved!.pieces.map((p) => [p.description, p]));
  expect([byDesc.A.lengthMm, byDesc.A.widthMm]).toEqual([1800, 600]);
  expect([byDesc.B.lengthMm, byDesc.B.widthMm]).toEqual([1800, 605]);
  expect([byDesc.C.lengthMm, byDesc.C.widthMm]).toEqual([1205, 605]);

  // a lista mostra em cm
  await expect(page.getByText(/^180 × 60( cm)?$/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/^180 × 60,5( cm)?$/).filter({ visible: true }).first()).toBeVisible();
});

test("digitar não é atrapalhado: o texto fica como o usuário escreve até sair do campo", async ({ page }) => {
  await createProjectViaHome(page, "Digitacao");
  await page.getByRole("button", { name: /adicionar primeira peça/i }).click();
  const len = page.getByRole("dialog").getByLabel("Comprimento (cm)");
  await len.click();
  await len.pressSequentially("60,", { delay: 40 });
  await expect(len).toHaveValue("60,");
  await len.pressSequentially("5", { delay: 40 });
  await expect(len).toHaveValue("60,5");
  await len.blur();
  await expect(len).toHaveValue("60,5");
  await len.fill("60.5");
  await len.blur();
  await expect(len).toHaveValue("60,5"); // normaliza para vírgula
  await len.fill("");
  await len.pressSequentially("275");
  await expect(len).toHaveValue("275");
});

test("projeto antigo (mm) abre em cm e salvar sem alterar mantém as dimensões originais em mm", async ({ page }) => {
  await seedOldProject(page);
  await page.goto("/projeto/?id=p-old");
  await expect(page.getByRole("heading", { name: "Projeto antigo" })).toBeVisible();
  await expect(page.getByText(/^180 × 60( cm)?$/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/^80 × 45( cm)?$/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/275 × 185 cm/).first()).toBeVisible(); // chapa 2750 × 1850 mm
  const barSheets = await page.getByTestId("bar-sheets").innerText();

  // abre a peça e salva sem mexer
  await page.getByRole("button", { name: "Editar Lateral antiga" }).first().click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByLabel("Comprimento (cm)")).toHaveValue("180");
  await expect(dlg.getByLabel("Largura (cm)")).toHaveValue("60");
  await dlg.getByRole("button", { name: "Salvar peça" }).click();
  // e altera outra coisa (nome) para forçar nova gravação
  await page.getByRole("tab", { name: /dados/i }).click();
  await page.getByLabel("Nome do projeto").fill("Projeto antigo editado");
  await expect(page.getByText("salvo", { exact: true })).toBeVisible();

  const saved = await readProjectFromDb(page, "Projeto antigo editado");
  expect(saved!.pieces.map((p) => [p.lengthMm, p.widthMm])).toEqual([[1800, 600], [800, 450]]);
  expect(saved!.materials[0]).toMatchObject({ lengthMm: 2750, widthMm: 1850, thicknessMm: 15, marginMm: 10, kerfMm: 3 });
  await expect(page.getByTestId("bar-sheets")).toHaveText(barSheets); // mesmo número de chapas
});

test("plano de corte, PDF e CSV continuam em mm, com a unidade identificada", async ({ page }) => {
  await createProjectViaHome(page, "Plano em mm");
  await addPiece(page, { desc: "Lateral", length: 1800, width: 600, qty: 2 }); // digitado como 180 × 60 cm
  await page.getByRole("tab", { name: /corte/i }).click();
  await expect(page.getByText(/Medidas do plano de corte em milímetros/)).toBeVisible();
  await expect(page.getByText(/2\.750 × 1\.850 mm/).first()).toBeVisible();

  await page.getByTestId("export-open").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByTestId("export-preview-btn").click();
  await expect(dlg.getByTestId("export-page").first()).toBeVisible({ timeout: 20_000 });
  const preview = await dlg.getByTestId("export-preview").innerText();
  expect(preview).toContain("1.800 × 600");
  expect(preview).toContain("Medidas em milímetros");
  expect(preview).not.toMatch(/\d\s?cm\b/);

  await dlg.getByRole("radio", { name: /\(csv\)/i }).click();
  const [csv] = await Promise.all([page.waitForEvent("download"), dlg.getByTestId("export-download").click()]);
  const text = readFileSync((await csv.path())!, "utf8");
  expect(text).toContain("Comprimento (mm);Largura (mm)");
  expect(text).toContain(";1800;600;2;");
});

test("chapas em cm: padrão 275 × 185 cm; margem e serra seguem em mm", async ({ page }) => {
  await openHome(page);
  await page.goto("/materiais/");
  await expect(page.getByText("275 × 185 cm").first()).toBeVisible();
  await page.getByRole("button", { name: /novo/i }).first().click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByLabel("Comprimento da chapa (cm)")).toHaveValue("275");
  await expect(dlg.getByLabel("Largura da chapa (cm)")).toHaveValue("185");
  await expect(dlg.getByLabel("Espessura do MDF (mm)")).toBeVisible();
  await expect(dlg.getByLabel("Margem nas extremidades (mm)")).toHaveValue("10");
  await expect(dlg.getByLabel("Espessura do corte da serra (mm)")).toHaveValue("3");
  for (const l of ["Comprimento da chapa (cm)", "Largura da chapa (cm)"]) await expect(dlg.getByLabel(l)).toHaveAttribute("inputmode", "decimal");

  await dlg.getByLabel("Nome / descrição").fill("MDF Teste cm");
  await dlg.getByLabel("Comprimento da chapa (cm)").fill("270,5");
  await dlg.getByLabel("Largura da chapa (cm)").fill("183");
  await dlg.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("270,5 × 183 cm")).toBeVisible();
  const mats = await page.evaluate(
    () =>
      new Promise<Array<{ name: string; lengthMm: number; widthMm: number }>>((resolve) => {
        const open = indexedDB.open("marcenaria-orcamentos");
        open.onsuccess = () => {
          const all = open.result.transaction("sheetMaterials").objectStore("sheetMaterials").getAll();
          all.onsuccess = () => resolve(all.result);
        };
      }),
  );
  const created = mats.find((m) => m.name === "MDF Teste cm")!;
  expect([created.lengthMm, created.widthMm]).toEqual([2705, 1830]);
  // os materiais de exemplo continuam com os valores reais em mm
  expect(mats.find((m) => m.name === "MDF Branco 15 mm")).toMatchObject({ lengthMm: 2750, widthMm: 1850 });
});

test("configurações: chapa padrão e sobras mínimas em cm", async ({ page }) => {
  await openHome(page);
  await page.goto("/configuracoes/");
  await expect(page.getByLabel("Comprimento da chapa (cm)")).toHaveValue("275");
  await expect(page.getByLabel("Largura da chapa (cm)")).toHaveValue("185");
  await expect(page.getByLabel("Menor lado mínimo (cm)")).toHaveValue("30");
  await expect(page.getByLabel("Maior lado mínimo (cm)")).toHaveValue("60");
  await expect(page.getByLabel("Espessura da serra (mm)")).toHaveValue("3");
});

test("novo contrato pede dimensões em cm", async ({ page }) => {
  await createProjectViaHome(page, "Contrato cm");
  await addPiece(page, { desc: "Tampo", length: 1200, width: 600, qty: 2 });
  await page.getByRole("link", { name: /resultado/i }).first().click();
  await page.getByTestId("generate-contract").click();
  await page.waitForURL(/\/contrato\/\?id=/);
  await page.getByRole("tab", { name: /móveis/i }).click();
  const dim = page.getByLabel(/Dimensões externas em cm/);
  await expect(dim).toHaveAttribute("placeholder", /240 × 220 × 60 cm/);
  await dim.fill("240 × 220 × 60 cm");
  await expect(page.getByText("rascunho salvo")).toBeVisible();
});

test("dados persistem após novo deploy (service worker e caches renovados): continuam em mm e aparecem em cm", async ({ page }) => {
  await createProjectViaHome(page, "Deploy cm");
  await addPiece(page, { desc: "Lateral", length: 1800, width: 600, qty: 1 });
  await expect(page.getByText("salvo", { exact: true })).toBeVisible();
  const url = page.url();
  // "novo deploy": remove service worker e caches do app e recarrega
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  });
  await page.goto(url);
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active);
  await expect(page.getByText(/^180 × 60( cm)?$/).filter({ visible: true }).first()).toBeVisible();
  const saved = await readProjectFromDb(page, "Deploy cm");
  expect([saved!.pieces[0].lengthMm, saved!.pieces[0].widthMm]).toEqual([1800, 600]);
});
