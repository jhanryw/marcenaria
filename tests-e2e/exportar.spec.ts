import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { addPiece, createProjectViaHome, noHorizontalScroll } from "./helpers";

async function openExport(page: Page) {
  await page.getByRole("tab", { name: /corte/i }).click();
  await page.getByTestId("export-open").click();
  await expect(page.getByRole("dialog").getByText("Exportar para madeireira")).toBeVisible();
}

test("exportar para madeireira: validar, pré-visualizar, baixar PDF e CSV, compartilhar e funcionar offline", async ({ page, context }) => {
  await createProjectViaHome(page, "Guarda-roupa do casal");
  await page.getByRole("tab", { name: /dados/i }).click();
  await page.getByLabel("Cliente (opcional)", { exact: true }).fill("Maria Conceição");
  await page.getByRole("tab", { name: /peças/i }).click();
  await addPiece(page, { desc: "Lateral", length: 2400, width: 550, qty: 2 });
  await addPiece(page, { desc: "Prateleira", length: 880, width: 500, qty: 8 });
  await expect(page.getByText("salvo", { exact: true })).toBeVisible();

  await openExport(page);
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByTestId("export-valid")).toBeVisible();
  await expect(dlg.getByText(/estimativa heurística/i)).toBeVisible();
  await noHorizontalScroll(page);

  // pré-visualização com as páginas reais
  await dlg.getByTestId("export-preview-btn").click();
  await expect(dlg.getByTestId("export-page").first()).toBeVisible({ timeout: 20_000 });
  expect(await dlg.getByTestId("export-page").count()).toBeGreaterThanOrEqual(4); // resumo + chapa(s) + lista + fita
  const previewText = await dlg.getByTestId("export-preview").innerText();
  expect(previewText).toMatch(/Plano de corte/i);
  expect(previewText).toContain("2.400 × 550"); // medidas em mm
  expect(previewText).not.toContain("R$");
  expect(previewText).not.toContain("Maria");

  // PDF do plano
  const [pdf] = await Promise.all([page.waitForEvent("download"), dlg.getByTestId("export-download").click()]);
  expect(pdf.suggestedFilename()).toMatch(/^Plano-de-corte_.+\.pdf$/);
  const bytes = readFileSync((await pdf.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBeGreaterThanOrEqual(4);
  expect(doc.getPage(0).getSize().width).toBeGreaterThan(doc.getPage(0).getSize().height); // paisagem

  // só lista de peças (PDF)
  await dlg.getByRole("radio", { name: /só lista de peças/i }).click();
  const [listPdf] = await Promise.all([page.waitForEvent("download"), dlg.getByTestId("export-download").click()]);
  expect(listPdf.suggestedFilename()).toMatch(/^Lista-de-pecas_.+\.pdf$/);

  // CSV com pré-visualização
  await dlg.getByRole("radio", { name: /\(csv\)/i }).click();
  await dlg.getByTestId("export-preview-btn").click();
  await expect(dlg.getByTestId("export-csv-preview")).toContainText("Lateral");
  await expect(dlg.getByText(/Unidade: milímetros/)).toBeVisible();
  const [csv] = await Promise.all([page.waitForEvent("download"), dlg.getByTestId("export-download").click()]);
  expect(csv.suggestedFilename()).toMatch(/^Lista-de-pecas_.+\.csv$/);
  const text = readFileSync((await csv.path())!, "utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain("Código;Descrição;Material");
  expect(text).toContain(";2400;550;2;");
  expect(text).toContain("\r\n");
  expect(text).not.toContain("R$");

  // compartilhar: sem Web Share (Chromium desktop) cai no download
  await dlg.getByRole("radio", { name: /plano completo/i }).click();
  const [shared] = await Promise.all([page.waitForEvent("download"), dlg.getByTestId("export-share").click()]);
  expect(shared.suggestedFilename()).toMatch(/^Plano-de-corte_/);

  // com Web Share disponível: usa o menu nativo com o arquivo
  await page.evaluate(() => {
    (window as unknown as { __shared: unknown }).__shared = null;
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      value: async (data: ShareData) => {
        (window as unknown as { __shared: unknown }).__shared = { files: (data.files ?? []).map((f) => `${f.name}|${f.type}`), text: data.text };
      },
      configurable: true,
    });
  });
  await dlg.getByTestId("export-share").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: unknown }).__shared)).toMatchObject({ files: [expect.stringMatching(/^Plano-de-corte_.+\.pdf\|application\/pdf$/)] });
  const sharedInfo = (await page.evaluate(() => (window as unknown as { __shared: { text: string } }).__shared)) as { text: string };
  expect(sharedInfo.text).toMatch(/heur[ií]stico/i);
  expect(sharedInfo.text).not.toMatch(/Maria|R\$/);

  // OFFLINE
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active && !!navigator.serviceWorker.controller);
  await page.evaluate(() => {
    delete (navigator as unknown as Record<string, unknown>).share;
    delete (navigator as unknown as Record<string, unknown>).canShare;
  });
  await context.setOffline(true);
  const [offlinePdf] = await Promise.all([page.waitForEvent("download"), dlg.getByTestId("export-download").click()]);
  const offlineBytes = readFileSync((await offlinePdf.path())!);
  expect((await PDFDocument.load(offlineBytes)).getPageCount()).toBe(doc.getPageCount());
  await context.setOffline(false);
});

test("plano inválido: exportação do plano é bloqueada e os problemas aparecem; a lista leva aviso", async ({ page }) => {
  await createProjectViaHome(page, "Painel grande");
  await addPiece(page, { desc: "Painel gigante", length: 3500, width: 2500, qty: 1 });
  await addPiece(page, { desc: "Tampo", length: 1200, width: 600, qty: 2 });
  await openExport(page);
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByTestId("export-problems")).toContainText(/bloqueada/i);
  await expect(dlg.getByTestId("export-problems")).toContainText(/Painel gigante/);
  await expect(dlg.getByTestId("export-valid")).toHaveCount(0);
  await expect(dlg.getByTestId("export-download")).toBeDisabled();
  await expect(dlg.getByTestId("export-share")).toBeDisabled();
  await expect(dlg.getByTestId("export-preview-btn")).toBeDisabled();

  // a lista de peças continua disponível, sinalizada como não validada
  await dlg.getByRole("radio", { name: /só lista de peças/i }).click();
  await expect(dlg.getByTestId("export-problems")).toContainText(/NÃO validado/);
  const [listPdf] = await Promise.all([page.waitForEvent("download"), dlg.getByTestId("export-download").click()]);
  expect(listPdf.suggestedFilename()).toContain("PLANO-NAO-VALIDADO");
});

test("diálogo de exportação cabe na tela, sem rolagem horizontal", async ({ page }) => {
  await createProjectViaHome(page, "Layout export");
  await addPiece(page, { desc: "Tampo", length: 1200, width: 600, qty: 2 });
  await openExport(page);
  await noHorizontalScroll(page);
  const box = await page.getByRole("dialog").boundingBox();
  expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.getByRole("dialog").getByTestId("export-preview-btn").click();
  const first = page.getByRole("dialog").getByTestId("export-page").first();
  await expect(first).toBeVisible({ timeout: 20_000 });
  const b = await first.boundingBox();
  expect(b!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(b!.width / b!.height).toBeCloseTo(841.89 / 595.28, 1);
});
