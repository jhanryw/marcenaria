/**
 * Service worker do app (gerado no build por scripts/postbuild.mjs).
 *
 *  - Guarda TODOS os arquivos do app (HTML, JS, CSS, ícones) em um cache versionado.
 *  - Só GUARDA ARQUIVOS DO APP. Os dados do usuário ficam no IndexedDB, que o service
 *    worker nunca acessa: atualizar o app não apaga orçamentos.
 *  - Atualização controlada: a nova versão é baixada em segundo plano, fica "em espera"
 *    e só assume quando o usuário toca em "Atualizar agora" (mensagem SKIP_WAITING).
 */
const VERSION = "__VERSION__";
const CACHE = "marcenaria-" + VERSION;
const PRECACHE = __PRECACHE__;
const SCOPE = self.registration.scope; // termina com "/"

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Tudo ou nada: se um arquivo falhar, a instalação falha e tenta de novo depois.
      await Promise.all(
        PRECACHE.map(async (rel) => {
          const url = new URL(rel, SCOPE).toString();
          const res = await fetch(url, { cache: "reload" });
          if (!res.ok) throw new Error("Falha ao baixar " + url + " (" + res.status + ")");
          await cache.put(url, res);
        }),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("marcenaria-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data && event.data.type === "GET_VERSION" && event.source) event.source.postMessage({ type: "VERSION", version: VERSION });
});

async function fromCache(cache, url) {
  const hit = await cache.match(url, { ignoreSearch: true });
  return hit || null;
}

async function handle(request) {
  const cache = await caches.open(CACHE);
  const url = new URL(request.url);

  // 1) cache primeiro (o app inteiro está pré-baixado)
  let res = await fromCache(cache, url.origin + url.pathname);
  if (res) return res;

  if (request.mode === "navigate") {
    // rotas sem barra final / com index.html
    const path = url.pathname;
    const candidates = [];
    if (!path.endsWith("/")) candidates.push(url.origin + path + "/");
    if (path.endsWith("/")) candidates.push(url.origin + path + "index.html");
    for (const c of candidates) {
      res = await fromCache(cache, c);
      if (res) return res;
    }
  }

  // 2) rede
  try {
    return await fetch(request);
  } catch {
    // 3) sem rede e fora do cache: para navegação, abre o app (início)
    if (request.mode === "navigate") {
      const home = await fromCache(cache, new URL("./", SCOPE).toString());
      if (home) return home;
    }
    return new Response("Sem conexão e arquivo não disponível offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(SCOPE)) return;
  event.respondWith(handle(request));
});
