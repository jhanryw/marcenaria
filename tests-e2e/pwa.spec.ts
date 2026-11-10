import { expect, test } from "@playwright/test";
import { openHome } from "./helpers";

test("manifest, ícones e service worker", async ({ page, request, context }) => {
  await openHome(page);
  const link = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(link).toBeTruthy();
  const res = await request.get(link!);
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.display).toBe("standalone");
  expect(m.start_url).toBeTruthy();
  expect(m.name).toBeTruthy();
  const sizes = m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "192x192:maskable", "512x512:maskable"]));
  for (const icon of m.icons) {
    const r = await request.get(new URL(icon.src, new URL(link!, page.url())).toString());
    expect(r.ok(), icon.src).toBeTruthy();
  }
  // metatags iOS
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]').first()).toHaveCount(1);
  expect(await page.locator('meta[name="viewport"]').getAttribute("content")).toContain("viewport-fit=cover");

  // SW ativo e controlando
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!reg?.active;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  // cache versionado contém as rotas e os assets
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((n) => n.startsWith("marcenaria-"));
    const cache = await caches.open(names[0]);
    const keys = (await cache.keys()).map((r) => new URL(r.url).pathname);
    return { names, keys };
  });
  expect(cached.names).toHaveLength(1);
  for (const route of ["/", "/projetos/", "/projeto/", "/projeto/resultado/", "/materiais/", "/configuracoes/", "/manifest.webmanifest"]) {
    expect(cached.keys, route).toContain(route);
  }
  expect(cached.keys.some((k) => k.includes("/_next/static/") && k.endsWith(".js"))).toBe(true);
  expect(cached.keys.some((k) => k.includes("/_next/static/") && k.endsWith(".css"))).toBe(true);

  // offline: cada rota abre
  await context.setOffline(true);
  for (const [path, heading] of [
    ["/", "Marcenaria"],
    ["/projetos/", "Projetos"],
    ["/materiais/", "Materiais"],
    ["/configuracoes/", "Configurações"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText(/Sem internet — tudo continua/)).toBeVisible();
  await context.setOffline(false);
});

test("atualizar o app (novo service worker) não apaga os orçamentos", async ({ page }) => {
  await openHome(page);
  // grava um projeto direto no IndexedDB do app
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("marcenaria-orcamentos");
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("projects", "readwrite");
        tx.objectStore("projects").put({ id: "keep-me", name: "Não pode sumir", updatedAt: new Date().toISOString() });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
  });
  // desregistra o SW e apaga os caches do APP (equivale a uma atualização completa dos arquivos)
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    for (const k of await caches.keys()) await caches.delete(k);
  });
  await page.reload();
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active);
  const name = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open("marcenaria-orcamentos");
        open.onsuccess = () => {
          const g = open.result.transaction("projects").objectStore("projects").get("keep-me");
          g.onsuccess = () => resolve(g.result?.name);
          g.onerror = () => reject(g.error);
        };
      }),
  );
  expect(name).toBe("Não pode sumir");
});
