import { defineConfig } from "@playwright/test";

const viewports = {
  "iphone-se": { width: 375, height: 667 },
  "iphone-14": { width: 390, height: 844 },
  "android-pequeno": { width: 360, height: 740 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
} as const;

/**
 * E2E_BASE_URL: aponta os testes para um servidor JÁ em execução (ex.: o container Docker com nginx),
 * em vez de subir o servidor local. Ex.: E2E_BASE_URL=http://localhost:8080 npx playwright test deploy
 */
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "tests-e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: external ?? "http://localhost:4173",
    serviceWorkers: "allow",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  webServer: external
    ? undefined
    : {
        command: "node scripts/serve.mjs",
        env: { PORT: "4173" },
        url: "http://localhost:4173",
        reuseExistingServer: true,
        timeout: 30_000,
      },
  projects: Object.entries(viewports).map(([name, viewport]) => ({
    name,
    use: {
      browserName: "chromium",
      viewport,
      isMobile: viewport.width < 768,
      hasTouch: viewport.width < 1024,
      deviceScaleFactor: viewport.width < 768 ? 2 : 1,
    },
  })),
});
