import { expect, test } from "@playwright/test";
import { addPiece, createProjectViaHome } from "./helpers";
import { readFileSync } from "node:fs";

test("exportar backup, apagar tudo e restaurar", async ({ page }) => {
  await createProjectViaHome(page, "Projeto do backup");
  await addPiece(page, { desc: "Tampo", length: 1200, width: 600, qty: 3 });
  await expect(page.getByText("salvo", { exact: true })).toBeVisible();

  await page.goto("/configuracoes/");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /exportar backup/i }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^marcenaria-backup-\d{8}-\d{4}\.json$/);
  const path = await download.path();
  const json = JSON.parse(readFileSync(path!, "utf8"));
  expect(json.format).toBe("marcenaria-orcamentos-backup");
  expect(json.schemaVersion).toBe(2);
  expect(Array.isArray(json.data.contracts)).toBe(true);
  expect(json.data.projects.some((p: { name: string }) => p.name === "Projeto do backup")).toBe(true);

  // apagar tudo
  await page.getByRole("button", { name: /apagar todos os dados/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Apagar tudo" }).click();
  await expect(page.getByText("Dados apagados")).toBeVisible();
  await page.goto("/projetos/");
  await expect(page.getByText("Nenhum projeto ainda")).toBeVisible();

  // restaurar
  await page.goto("/configuracoes/");
  await page.getByTestId("import-file").setInputFiles(path!);
  await expect(page.getByRole("dialog")).toContainText("Arquivo válido");
  await page.getByRole("dialog").getByRole("button", { name: "Substituir tudo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Substituir tudo" }).click();
  await expect(page.getByText(/Backup restaurado/)).toBeVisible();
  await page.goto("/projetos/");
  await expect(page.getByText("Projeto do backup")).toBeVisible();
});

test("arquivo inválido é recusado com mensagem", async ({ page }) => {
  await page.goto("/configuracoes/");
  await page.getByTestId("import-file").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"oi":1}') });
  await expect(page.getByText(/não parece ser um backup/i)).toBeVisible();
});
