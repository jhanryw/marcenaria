import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { addPiece, createProjectViaHome, money, noHorizontalScroll } from "./helpers";

async function fillCompany(page: Page) {
  await page.goto("/configuracoes/");
  await page.getByLabel("Nome empresarial ou nome completo").fill("Silva Móveis Planejados Ltda.");
  await page.getByLabel("Nome fantasia").fill("Silva Marcenaria");
  await page.getByLabel("CPF ou CNPJ").fill("11222333000181");
  await page.getByLabel("Endereço completo").fill("Rua das Acácias, 123, Centro");
  await page.getByLabel("Cidade", { exact: true }).fill("São Paulo");
  await page.getByLabel("UF").fill("sp");
  await page.getByLabel("Telefone").fill("(11) 99999-0000");
  await page.getByLabel("E-mail").fill("contato@silva.com.br");
  await page.getByLabel("Nome do responsável").fill("João da Silva");
  await page.getByLabel("CPF ou CNPJ").blur();
  await expect(page.getByLabel("CPF ou CNPJ")).toHaveValue("11.222.333/0001-81");
  await page.waitForTimeout(700); // autosave das configurações
}

const next = (page: Page) => page.getByRole("button", { name: /próxima/i }).click();
const tab = (page: Page, name: RegExp) => page.getByRole("tab", { name });

test("contrato completo: criar → preencher → pré-visualizar → emitir → PDF → offline", async ({ page, context }) => {
  await fillCompany(page);

  await createProjectViaHome(page, "Guarda-roupa do casal");
  await page.getByRole("tab", { name: /dados/i }).click();
  await page.getByLabel("Cliente (opcional)", { exact: true }).fill("Maria Conceição");
  await page.getByLabel("Descrição do serviço").fill("Guarda-roupa com 3 portas de correr.");
  await page.getByRole("tab", { name: /peças/i }).click();
  await addPiece(page, { desc: "Lateral", length: 2400, width: 550, qty: 2 });
  await expect(page.getByText("salvo", { exact: true })).toBeVisible();

  // ---- botão na tela de resultado ----
  await page.getByRole("link", { name: /resultado/i }).first().click();
  await expect(page.getByTestId("generate-contract")).toBeVisible();
  await page.getByTestId("generate-contract").click();
  await page.waitForURL(/\/contrato\/\?id=/);
  await expect(page.getByRole("heading", { name: "Contrato nº 0001" })).toBeVisible();
  const contractUrl = page.url();

  // ---- etapa 1: cliente (dados importados) ----
  await expect(page.getByLabel("Nome completo ou razão social")).toHaveValue("Maria Conceição");
  await expect(page.getByText("Silva Móveis Planejados Ltda.")).toBeVisible();
  await page.getByLabel("CPF ou CNPJ").fill("52998224726"); // inválido: só avisa
  await page.getByLabel("CPF ou CNPJ").blur();
  await expect(page.getByText(/dígitos não conferem/i)).toBeVisible();
  await page.getByLabel("CPF ou CNPJ").fill("52998224725");
  await page.getByLabel("CPF ou CNPJ").blur();
  await expect(page.getByLabel("CPF ou CNPJ")).toHaveValue("529.982.247-25");
  await page.getByLabel("Endereço completo").first().fill("Av. Paulista, 1000, apto 52, São Paulo/SP");
  await noHorizontalScroll(page);
  await next(page);

  // ---- etapa 2: móveis (descrição do orçamento, não a lista de cortes) ----
  await expect(page.getByLabel("Nome do móvel ou serviço")).toHaveValue("Guarda-roupa do casal");
  await expect(page.locator("body")).not.toContainText(/Lateral/);
  await expect(page.locator("body")).not.toContainText(/markup|lucro|margem|aproveitamento/i);
  await page.getByRole("button", { name: /^\+?\s*Móvel$/ }).click();
  await page.getByLabel("Nome do móvel ou serviço").last().fill("Painel de TV");
  await page.getByLabel("Descrição", { exact: true }).last().fill("Painel ripado com nicho para equipamentos.");
  await next(page);

  // ---- etapa 3: pagamento ----
  await page.getByLabel("Valor total contratado").fill("5000");
  await page.getByLabel("Entrada", { exact: true }).fill("40");
  const summary = page.getByTestId("payment-summary");
  await expect(summary).toContainText("Entrada + parcelas = valor total");
  await expect(summary).toContainText(money("R$ 2.000,00"));
  await expect(page.getByLabel("Valor da parcela 1")).toHaveValue("1.500,00");
  await expect(page.getByLabel("Valor da parcela 2")).toHaveValue("1.500,00");
  // edita uma parcela → diferença detectada, com valor exato
  await page.getByLabel("Valor da parcela 1").fill("1000");
  await expect(summary).toContainText(/Faltam R\$\s500,00/);
  await page.getByRole("button", { name: "Dividir saldo igualmente" }).click();
  await expect(summary).toContainText("Entrada + parcelas = valor total");
  await page.getByRole("button", { name: "Boleto" }).click();
  await noHorizontalScroll(page);
  await next(page);

  // ---- etapa 4: prazo ----
  await page.getByLabel("Prazo de fabricação").fill("30");
  await page.getByLabel("Data prevista de início").fill("2026-12-01");
  await page.getByRole("button", { name: /sugerir entrega/i }).click();
  await expect(page.getByLabel("Data prevista de entrega")).not.toHaveValue("");
  await page.getByLabel("Garantia contratual adicional").fill("12");
  await page.getByRole("switch", { name: "Acesso por escadas" }).click();
  await noHorizontalScroll(page);
  await next(page);

  // ---- etapa 5: revisão ----
  await expect(page.getByTestId("review-error")).toHaveCount(0);
  await expect(page.getByText(/campos obrigatórios estão preenchidos/i)).toBeVisible();
  await expect(page.getByTestId("review-warning")).toBeVisible(); // avisos não bloqueiam

  // pré-visualização com as páginas do PDF
  await page.getByRole("button", { name: /pré-visualizar contrato/i }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByTestId("contract-page").first()).toBeVisible({ timeout: 15_000 });
  expect(await dlg.getByTestId("contract-page").count()).toBeGreaterThanOrEqual(4);
  await expect(dlg).toContainText("Silva Móveis Planejados Ltda.");
  await dlg.getByRole("button", { name: /fechar/i }).click();

  // minuta (rascunho) em PDF
  const [draftDl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /baixar minuta/i }).click()]);
  expect(draftDl.suggestedFilename()).toBe("Contrato_0001_Maria-Conceicao_MINUTA.pdf");

  // rascunho persiste ao recarregar
  await expect(page.getByText("rascunho salvo")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Contrato nº 0001" })).toBeVisible();
  await tab(page, /cliente/i).click();
  await expect(page.getByLabel("Nome completo ou razão social")).toHaveValue("Maria Conceição");

  // emitir
  await tab(page, /revisão/i).click();
  await page.getByTestId("issue-button").click();
  await page.getByRole("dialog").getByRole("button", { name: "Emitir contrato" }).click();
  await expect(page.getByText("Emitido", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("viewer-total")).toHaveText(money("R$ 5.000,00"));

  // PDF definitivo
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar PDF" }).click()]);
  expect(dl.suggestedFilename()).toBe("Contrato_0001_Maria-Conceicao.pdf");
  const bytes = readFileSync((await dl.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBeGreaterThanOrEqual(4);

  // "assinado" só por registro manual
  await expect(page.getByText("Assinado", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /registrar assinatura/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("Assinado", { exact: true }).first()).toBeVisible();

  // ---- fecha e reabre OFFLINE: contrato salvo e PDF ainda funcionam ----
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active && !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.goto(contractUrl);
  await expect(page.getByRole("heading", { name: "Contrato nº 0001" })).toBeVisible();
  await expect(page.getByText(/Sem internet — tudo continua/)).toBeVisible();
  await expect(page.getByTestId("viewer-total")).toHaveText(money("R$ 5.000,00"));
  const [offlineDl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar PDF" }).click()]);
  const offlineBytes = readFileSync((await offlineDl.path())!);
  expect((await PDFDocument.load(offlineBytes)).getPageCount()).toBe(doc.getPageCount());
  // visualização offline
  await page.getByRole("button", { name: /visualizar contrato/i }).click();
  await expect(page.getByRole("dialog").getByTestId("contract-page").first()).toBeVisible({ timeout: 15_000 });
  await context.setOffline(false);
});

test("emissão bloqueada com pendências; revisão nova a partir de contrato emitido", async ({ page }) => {
  await fillCompany(page);
  await createProjectViaHome(page, "Cozinha");
  await addPiece(page, { desc: "Tampo", length: 1200, width: 600, qty: 2 });
  await page.getByRole("link", { name: /resultado/i }).first().click();
  await page.getByTestId("generate-contract").click();
  await page.waitForURL(/\/contrato\/\?id=/);

  await tab(page, /revisão/i).click();
  await expect(page.getByTestId("issue-button")).toBeDisabled();
  await expect(page.getByTestId("review-error")).toContainText(/nome completo ou a razão social/i);
  await expect(page.getByTestId("review-error")).toContainText(/prazo de fabricação não informado/i);

  // corrige pelos atalhos "Corrigir"
  await tab(page, /cliente/i).click();
  await page.getByLabel("Nome completo ou razão social").fill("João Souza");
  await tab(page, /prazo/i).click();
  await page.getByLabel("Prazo de fabricação").fill("20");
  await tab(page, /revisão/i).click();
  await expect(page.getByTestId("issue-button")).toBeEnabled();
  await page.getByTestId("issue-button").click();
  await page.getByRole("dialog").getByRole("button", { name: "Emitir contrato" }).click();
  await expect(page.getByText("Emitido", { exact: true }).first()).toBeVisible();

  // emitido não é editável: não há campos do assistente
  await expect(page.getByLabel("Nome completo ou razão social")).toHaveCount(0);

  // nova revisão
  await page.getByRole("button", { name: /nova revisão/i }).click();
  await expect(page.getByRole("heading", { name: "Contrato nº 0001-R2" })).toBeVisible();
  await expect(page.getByLabel("Nome completo ou razão social")).toHaveValue("João Souza");

  // lista de contratos mostra as duas versões
  await page.goto("/contratos/");
  await expect(page.getByTestId("contract-card")).toHaveCount(2);
  await expect(page.getByText("substituído")).toBeVisible();
});

test("telas do contrato não rolam na horizontal e a prévia cabe na tela", async ({ page }) => {
  await fillCompany(page);
  await createProjectViaHome(page, "Layout");
  await addPiece(page, { desc: "Tampo", length: 1200, width: 600, qty: 2 });
  await page.getByRole("link", { name: /resultado/i }).first().click();
  await page.getByTestId("generate-contract").click();
  await page.waitForURL(/\/contrato\/\?id=/);
  for (const t of [/cliente/i, /móveis/i, /valores/i, /prazo/i, /revisão/i]) {
    await tab(page, t).click();
    await page.waitForTimeout(150);
    await noHorizontalScroll(page);
  }
  await page.getByRole("button", { name: /pré-visualizar contrato/i }).click();
  const first = page.getByRole("dialog").getByTestId("contract-page").first();
  await expect(first).toBeVisible({ timeout: 15_000 });
  const box = await first.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box!.height / box!.width).toBeCloseTo(841.89 / 595.28, 1);
  await page.getByRole("dialog").getByRole("button", { name: /fechar/i }).click();
  await page.goto("/contratos/");
  await noHorizontalScroll(page);
});

test("logotipo é reduzido, guardado e aparece no contrato", async ({ page }) => {
  await page.goto("/configuracoes/");
  const png = readFileSync("tests/fixtures/logo.png");
  await page.getByTestId("logo-file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
  await expect(page.getByAltText("Logotipo da empresa")).toBeVisible();
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByAltText("Logotipo da empresa")).toBeVisible();
  // arquivo que não é imagem é recusado
  await page.getByTestId("logo-file").setInputFiles({ name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });
  await expect(page.getByText(/use uma imagem/i)).toBeVisible();
});
