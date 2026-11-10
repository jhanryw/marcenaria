import { expect, test } from "@playwright/test";
import { addPiece, createProjectViaHome, noHorizontalScroll } from "./helpers";

test("todas as telas: sem rolagem horizontal e navegação adequada ao tamanho", async ({ page }, info) => {
  const width = page.viewportSize()!.width;
  const mobile = width < 768;

  await createProjectViaHome(page, "Teste responsivo");
  await addPiece(page, { desc: "Lateral esquerda com nome bem comprido para testar quebra de linha", length: 1800, width: 600, qty: 2 });
  await addPiece(page, { desc: "Prateleira", length: 800, width: 450, qty: 8 });
  await page.getByRole("tab", { name: /dados/i }).click();
  await page.getByLabel("Cliente (opcional)", { exact: true }).fill("Cliente Com Nome Muito Muito Longo Da Silva Pereira");

  for (const tab of [/dados/i, /peças/i, /corte/i, /custos/i, /preço/i]) {
    await page.getByRole("tab", { name: tab }).click();
    await page.waitForTimeout(150);
    await noHorizontalScroll(page);
  }

  // navegação: inferior no celular, lateral em telas maiores
  const nav = page.getByRole("navigation", { name: "Principal" });
  if (mobile) {
    const bottom = page.locator("nav.fixed");
    await expect(bottom).toBeVisible();
    const box = await bottom.boundingBox();
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1);
  } else {
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.locator("nav.fixed")).toBeHidden();
  }
  await expect(nav.first()).toBeVisible();

  for (const path of ["/", "/projetos/", "/materiais/", "/configuracoes/"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await noHorizontalScroll(page);
  }

  // alvos de toque grandes nos botões principais (≥ 40px de altura)
  await page.goto("/projetos/");
  const newBtn = page.getByRole("button", { name: /novo/i }).first();
  const b = await newBtn.boundingBox();
  expect(b!.height).toBeGreaterThanOrEqual(40);

  await page.screenshot({ path: `test-results/shots/${info.project.name}-projetos.png`, fullPage: false });
});

test("campos numéricos abrem teclado decimal e valores são formatados em reais", async ({ page }) => {
  await createProjectViaHome(page, "Teclado");
  await page.getByRole("button", { name: /adicionar primeira peça/i }).click();
  const dlg = page.getByRole("dialog");
  for (const label of ["Comprimento", "Largura", "Quantidade"]) {
    await expect(dlg.getByLabel(label)).toHaveAttribute("inputmode", "decimal");
  }
  await dlg.getByRole("button", { name: /fechar/i }).click();
  await page.getByRole("tab", { name: /custos/i }).click();
  await page.getByRole("button", { name: "+ Frete" }).click();
  await expect(page.getByRole("dialog").getByText("R$").first()).toBeVisible();
});
