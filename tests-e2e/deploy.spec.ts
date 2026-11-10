import { expect, test } from "@playwright/test";

/**
 * Smoke test de DEPLOY (nginx): rotas diretas, refresh, MIME, cache, PWA e ausência de 404 em assets.
 * Roda uma vez (projeto "desktop"). Para testar o container de verdade:
 *   docker run -d -p 8080:80 marcenaria && E2E_BASE_URL=http://localhost:8080 npx playwright test deploy --project=desktop
 */
test.beforeEach(async ({ browserName }, testInfo) => {
  void browserName;
  test.skip(testInfo.project.name !== "desktop", "smoke de deploy roda uma vez");
});

const ROUTES: Array<[string, string]> = [
  ["/", "Marcenaria"],
  ["/projetos", "Projetos"],
  ["/materiais", "Materiais"],
  ["/configuracoes", "Configurações"],
  ["/contratos", "Contratos"],
  ["/projetos/", "Projetos"],
];

test("rotas abrem direto (sem barra final), sobrevivem ao refresh e não geram erro HTTP", async ({ page }) => {
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });

  for (const [route, heading] of ROUTES) {
    const res = await page.goto(route);
    expect(res?.status(), route).toBe(200);
    await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
  }

  // rotas com parâmetro de consulta (lidos no navegador)
  for (const [route, text] of [
    ["/projeto?id=nao-existe", /projeto não encontrado/i],
    ["/projeto/?id=nao-existe", /projeto não encontrado/i],
    ["/projeto/resultado?id=nao-existe", /projeto não encontrado/i],
    ["/contrato?id=nao-existe", /contrato não encontrado/i],
  ] as const) {
    const res = await page.goto(route);
    expect(res?.status(), route).toBe(200);
    await expect(page.getByText(text).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(text).first()).toBeVisible();
  }

  expect(failed, `respostas com erro: ${failed.join(" | ")}`).toEqual([]);
});

test("manifest, service worker e cabeçalhos de cache", async ({ request, page }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect(manifest.headers()["content-type"]).toContain("application/manifest+json");
  const json = await manifest.json();
  expect(json.display).toBe("standalone");
  for (const icon of json.icons) {
    const r = await request.get(`/${icon.src}`);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()["content-type"]).toContain("image/png");
    expect(r.headers()["cache-control"]).toContain("max-age=604800");
  }

  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toMatch(/javascript/);
  expect(sw.headers()["cache-control"]).toContain("no-cache"); // sempre revalidado: atualizações do app chegam

  const html = await request.get("/");
  expect(html.headers()["content-type"]).toContain("text/html");
  expect(html.headers()["cache-control"]).toContain("no-cache");

  // asset com hash: cache de 1 ano, imutável
  const body = await html.text();
  const chunk = /\/_next\/static\/[^"\\\s]+\.js/.exec(body)?.[0];
  expect(chunk, "HTML referencia um chunk JS").toBeTruthy();
  const asset = await request.get(chunk!);
  expect(asset.status()).toBe(200);
  expect(asset.headers()["cache-control"]).toContain("max-age=31536000");
  expect(asset.headers()["cache-control"]).toContain("immutable");
  expect(asset.headers()["content-type"]).toMatch(/javascript/);

  const css = /\/_next\/static\/[^"\\\s]+\.css/.exec(body)?.[0];
  expect(css).toBeTruthy();
  expect((await request.get(css!)).headers()["content-type"]).toContain("text/css");

  // fontes do PDF (offline) e cabeçalhos de segurança
  const font = await request.get("/fonts/noto-serif-latin-400-normal.woff");
  expect(font.status()).toBe(200);
  expect(html.headers()["x-content-type-options"]).toBe("nosniff");

  // ... e o service worker registra e ativa
  await page.goto("/");
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active);
});

test("arquivo inexistente é 404 de verdade (sem fallback para index.html) e /healthz responde", async ({ request }) => {
  for (const path of ["/nao-existe.js", "/_next/static/chunks/inexistente.js", "/icons/nao-existe.png", "/rota-inexistente/"]) {
    const r = await request.get(path);
    expect(r.status(), path).toBe(404);
  }
  const wrong = await request.get("/nao-existe.js");
  expect(await wrong.text()).not.toContain("Marcenaria — Orçamentos orçamento"); // não devolve o app no lugar do arquivo
  const health = await request.get("/healthz");
  expect(health.status()).toBe(200);
  expect(await health.text()).toContain("ok");
  const dot = await request.get("/.env");
  expect(dot.status()).toBe(404);
});
