// Auditoria do site estático gerado (out/). Falha (exit 1) se algo que o navegador pedirá não existir.
// Simula a resolução de arquivos do nginx.conf (`try_files $uri $uri/index.html =404`) sem precisar de servidor.
//
// Uso: npm run build && npm run verify:out        (também roda dentro do Dockerfile)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";

const OUT = process.env.OUT_DIR ?? "out";
const errors = [];
const fail = (msg) => errors.push(msg);

const isFile = (p) => existsSync(p) && statSync(p).isFile();

/** Equivalente ao `try_files $uri $uri/index.html =404` do nginx.conf. Retorna o arquivo servido ou null. */
function resolveLikeNginx(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const rel = posix.normalize(clean).replace(/^\/+/, "");
  const direct = join(OUT, rel);
  if (!clean.endsWith("/") && rel !== "" && isFile(direct)) return direct;
  const idx = join(OUT, rel, "index.html");
  return isFile(idx) ? idx : null;
}

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });
}

if (!existsSync(OUT)) {
  console.error(`✗ pasta ${OUT}/ não existe — rode "npm run build" antes.`);
  process.exit(1);
}

// ---- 1) Rotas: acessíveis com e sem barra final e com query string ----
const routes = new Set(["/"]);
for (const f of walk(OUT)) {
  const rel = f.slice(OUT.length + 1).split("\\").join("/");
  if (rel.endsWith("/index.html") && !rel.startsWith("_") && !rel.startsWith("404/")) routes.add(`/${rel.slice(0, -"index.html".length)}`);
}
const EXPECTED = ["/", "/projetos/", "/projeto/", "/projeto/resultado/", "/materiais/", "/configuracoes/", "/contratos/", "/contrato/"];
for (const r of EXPECTED) if (!routes.has(r)) fail(`rota esperada ausente no export: ${r}`);

const htmlOf = new Map();
for (const r of routes) {
  for (const variant of [r, r === "/" ? "/" : r.replace(/\/$/, ""), `${r}?id=abc`]) {
    if (!resolveLikeNginx(variant)) fail(`rota não resolve: ${variant}`);
  }
  const f = resolveLikeNginx(r);
  if (f) htmlOf.set(r, readFileSync(f, "utf8"));
}

// ---- 2) Todo arquivo referenciado pelo HTML existe ----
const refs = new Set();
for (const html of htmlOf.values()) {
  for (const m of html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)) refs.add(m[1]);
  for (const m of html.matchAll(/"(\/_next\/static\/[^"\\\s]+)"/g)) refs.add(m[1]);
}
for (const ref of refs) {
  if (ref.startsWith("//")) continue;
  const looksLikeRoute = routes.has(ref.endsWith("/") ? ref : `${ref}/`);
  if (!resolveLikeNginx(ref) && !looksLikeRoute) fail(`referenciado no HTML mas inexistente: ${ref}`);
}

// ---- 3) Manifest ----
try {
  const man = JSON.parse(readFileSync(join(OUT, "manifest.webmanifest"), "utf8"));
  if (man.display !== "standalone") fail("manifest: display deveria ser 'standalone'");
  if (!man.start_url || !man.scope) fail("manifest: start_url/scope ausentes");
  for (const icon of man.icons ?? []) {
    if (!resolveLikeNginx(`/${icon.src}`)) fail(`manifest: ícone inexistente ${icon.src}`);
  }
  const purposes = (man.icons ?? []).map((i) => `${i.sizes}:${i.purpose}`);
  for (const need of ["192x192:any", "512x512:any", "512x512:maskable"]) if (!purposes.includes(need)) fail(`manifest: falta ícone ${need}`);
} catch (e) {
  fail(`manifest inválido: ${e.message}`);
}

// ---- 4) Service worker: placeholders resolvidos e TODO arquivo do pré-cache existe ----
try {
  const sw = readFileSync(join(OUT, "sw.js"), "utf8");
  if (sw.includes("__VERSION__") || sw.includes("__PRECACHE__")) fail("sw.js: placeholders não foram substituídos (rode scripts/postbuild.mjs)");
  const m = /const PRECACHE = (\[[\s\S]*?\]);/.exec(sw);
  if (!m) fail("sw.js: lista PRECACHE não encontrada");
  else {
    const list = JSON.parse(m[1]);
    if (list.length < 20) fail(`sw.js: pré-cache suspeitamente pequeno (${list.length})`);
    for (const rel of list) {
      const url = rel === "./" ? "/" : `/${rel}`;
      if (!resolveLikeNginx(url)) fail(`sw.js: arquivo do pré-cache inexistente: ${rel}`);
    }
    for (const must of ["./", "projetos/", "contratos/", "contrato/", "manifest.webmanifest"]) if (!list.includes(must)) fail(`sw.js: pré-cache não inclui ${must}`);
    if (!list.some((x) => x.startsWith("fonts/"))) fail("sw.js: fontes do PDF não estão no pré-cache (PDF offline)");
    console.log(`  service worker: ${list.length} arquivos no pré-cache`);
  }
} catch (e) {
  fail(`sw.js ausente ou ilegível: ${e.message}`);
}

// ---- 5) Fontes do PDF e 404 ----
for (const font of ["noto-serif-latin-400-normal.woff", "noto-serif-latin-700-normal.woff", "inter-latin-400-normal.woff", "inter-latin-700-normal.woff"]) {
  if (!resolveLikeNginx(`/fonts/${font}`)) fail(`fonte ausente: /fonts/${font}`);
}
if (resolveLikeNginx("/arquivo-que-nao-existe.js")) fail("um arquivo inexistente não deveria resolver");
if (!isFile(join(OUT, "404.html"))) fail("404.html ausente (error_page do nginx)");

// ---- 6) Nada de código-fonte/segredos dentro do export ----
for (const f of walk(OUT)) {
  const rel = f.slice(OUT.length + 1);
  if (/(^|\/)(\.env|node_modules|\.git)(\/|$)/.test(rel) || rel.endsWith(".map")) fail(`arquivo indevido no export: ${rel}`);
}

if (errors.length) {
  console.error(`✗ ${errors.length} problema(s) em ${OUT}/:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ ${OUT}/ OK — ${routes.size} rotas, ${refs.size} arquivos referenciados, manifest e service worker consistentes`);
