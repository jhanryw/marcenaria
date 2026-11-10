import { expect, test } from "@playwright/test";
import { addPiece, createProjectViaHome, money, noHorizontalScroll } from "./helpers";

/**
 * Critério principal de aceitação: criar um orçamento completo, fechar e reabrir
 * o navegador, recuperar os dados, editar as peças e obter nova quantidade de
 * chapas, custos e preço — inclusive offline.
 */
test("orçamento completo: criar → recalcular → recarregar → offline", async ({ page, context }) => {
  await createProjectViaHome(page, "Armário de teste");

  // peças: 1 chapa
  await addPiece(page, { desc: "Lateral", length: 1800, width: 600, qty: 2 });
  await addPiece(page, { desc: "Prateleira", length: 800, width: 450, qty: 4 });
  await expect(page.getByTestId("bar-sheets")).toHaveText("1");
  // 1 chapa de R$ 320,00 (sem fita, sem outros custos) → custo R$ 320,00; markup padrão 50% → R$ 480,00
  await expect(page.getByTestId("bar-cost")).toHaveText(money("R$ 320,00"));
  await expect(page.getByTestId("bar-price")).toHaveText(money("R$ 480,00"));
  await noHorizontalScroll(page);

  // aumenta muito a quantidade → mais chapas, mais custo, mais preço, automaticamente
  await addPiece(page, { desc: "Fundo grande", length: 1000, width: 900, qty: 12 });
  await expect(page.getByTestId("bar-sheets")).not.toHaveText("1"); // recalculado sozinho
  const sheetsAfter = Number(await page.getByTestId("bar-sheets").innerText());
  expect(sheetsAfter).toBeGreaterThan(1);
  await expect(page.getByTestId("bar-cost")).toHaveText(money(`R$ ${(sheetsAfter * 320).toLocaleString("pt-BR")},00`));

  // custos extras: 8 dobradiças × R$ 8,00 = R$ 64,00
  await page.getByRole("tab", { name: /custos/i }).click();
  await page.getByRole("button", { name: "+ Dobradiças" }).click();
  const d = page.getByRole("dialog");
  await d.getByText("Valor unitário").locator("..").locator("input").fill("8");
  await d.getByText("Quantidade", { exact: true }).locator("..").locator("input").fill("8");
  await expect(d.getByText("R$ 64,00").first()).toBeVisible();
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("R$ 64,00").first()).toBeVisible();

  // mão de obra fixa R$ 200 de fabricação
  await page.getByLabel("Valor fixo de Fabricação").fill("200");

  // markup 100%
  await page.getByRole("tab", { name: /preço/i }).click();
  await page.getByLabel("Markup sobre o custo").fill("100");
  const cost = sheetsAfter * 32000 + 6400 + 20000;
  const priceText = (cost * 2) / 100;
  await expect(page.getByTestId("bar-price")).toHaveText(money(`R$ ${priceText.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`));

  // preço manual recalcula margem/markup
  await page.getByLabel("Definir preço manualmente (opcional)").fill("5000");
  await expect(page.getByTestId("bar-price")).toHaveText(money("R$ 5.000,00"));
  await page.getByRole("button", { name: "Voltar ao preço sugerido" }).click();
  await expect(page.getByTestId("bar-price")).toHaveText(money(`R$ ${priceText.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`));

  // espera o autosave
  await expect(page.getByText("salvo", { exact: true })).toBeVisible();
  const url = page.url();

  // ----- "fecha e reabre o navegador": recarrega -----
  await page.reload();
  await expect(page.getByRole("heading", { name: "Armário de teste" })).toBeVisible();
  await expect(page.getByTestId("bar-sheets")).toHaveText(String(sheetsAfter));
  await expect(page.getByTestId("bar-price")).toHaveText(money(`R$ ${priceText.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`));

  // ----- offline -----
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!reg?.active && !!navigator.serviceWorker.controller;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Armário de teste" })).toBeVisible();
  await expect(page.getByTestId("bar-sheets")).toHaveText(String(sheetsAfter));

  // edita peças offline: remove a peça grande → recalcula
  await page.getByRole("tab", { name: /peças/i }).click();
  await page.getByRole("button", { name: "Excluir Fundo grande" }).or(page.getByRole("button", { name: /^excluir$/i }).last()).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByTestId("bar-sheets")).toHaveText("1");
  await expect(page.getByTestId("bar-price")).toHaveText(money(`R$ ${((32000 + 6400 + 20000) * 2 / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`));

  await expect(page.getByText("salvo", { exact: true })).toBeVisible(); // autosave concluído
  // navega entre as telas offline
  await page.goto(url.replace("/projeto/", "/projeto/resultado/"));
  await expect(page.getByRole("heading", { name: "Resultado" })).toBeVisible();
  await expect(page.getByTestId("res-sheets")).toHaveText("1");
  await page.goto("/projetos/");
  await expect(page.getByText("Armário de teste")).toBeVisible();
  await page.goto("/materiais/");
  await expect(page.getByText("MDF Branco 15 mm").first()).toBeVisible();
  await page.goto("/configuracoes/");
  await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
  await context.setOffline(false);
});

test("peça que não cabe: erro claro e sem chapa fictícia", async ({ page }) => {
  await createProjectViaHome(page, "Peça gigante");
  await addPiece(page, { desc: "Painel enorme", length: 3500, width: 2500, qty: 1 });
  await page.getByRole("tab", { name: /corte/i }).click();
  await expect(page.getByRole("alert").first()).toContainText(/não foi possível montar um plano/i);
  await expect(page.getByText("Painel enorme").first()).toBeVisible();
  await expect(page.getByTestId("bar-sheets")).toHaveText("0*");
  // tela de resultado marca como incompleto
  await page.getByRole("tab", { name: /preço/i }).click();
  await expect(page.getByText(/orçamento incompleto/i).first()).toBeVisible();
});

test("visão do cliente não revela custos internos", async ({ page }) => {
  await createProjectViaHome(page, "Estante");
  await addPiece(page, { desc: "Lateral", length: 1800, width: 600, qty: 2 });
  await page.getByRole("tab", { name: /dados/i }).click();
  await page.getByLabel("Cliente (opcional)", { exact: true }).fill("Dona Maria");
  await page.getByRole("link", { name: /resultado/i }).first().click();
  await expect(page.getByTestId("res-price")).toBeVisible();
  await page.getByRole("radio", { name: /cliente/i }).click();
  const view = page.getByTestId("client-view");
  await expect(view).toContainText("Estante");
  await expect(view).toContainText("Dona Maria");
  await expect(view).toContainText("Valor total");
  const text = await view.innerText();
  expect(text).not.toMatch(/markup|margem|lucro|custo/i);
});
