// Servidor estático mínimo para testar o build de produção (out/) localmente.
// Uso: npm run build && npm start   (PORT=3000 por padrão)
//
// NGINX_LIKE=1 imita as regras do nginx.conf do deploy (sem redirecionamento de /rota para /rota/,
// mesmos cabeçalhos de cache, /healthz e 404 real). Serve para rodar os testes E2E com o mesmo
// comportamento de rotas do container. NÃO substitui um teste com o nginx de verdade.
import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = join(process.cwd(), "out");
const PORT = Number(process.env.PORT ?? 3000);
const BASE = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
const NGINX_LIKE = process.env.NGINX_LIKE === "1";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2", ".woff": "font/woff", ".map": "application/json",
};
const GZIP = new Set([".html", ".js", ".css", ".json", ".webmanifest", ".svg", ".txt"]);

// mesmos cabeçalhos de segurança do nginx.conf
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

function cacheControl(path) {
  if (NGINX_LIKE) {
    if (path.startsWith("/_next/static/")) return "public, max-age=31536000, immutable";
    if (/^\/(icons|fonts)\//.test(path)) return "public, max-age=604800";
    return "no-cache";
  }
  return path.includes("/_next/static/") ? "public, max-age=31536000, immutable" : "no-cache";
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path = decodeURIComponent(url.pathname);
  if (BASE && path.startsWith(BASE)) path = path.slice(BASE.length) || "/";

  if (NGINX_LIKE && path === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("ok\n");
    return;
  }

  let file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }

  if (NGINX_LIKE) {
    // try_files $uri $uri/index.html =404
    if (!(existsSync(file) && statSync(file).isFile() && !path.endsWith("/"))) {
      const idx = join(file, "index.html");
      file = existsSync(idx) && statSync(idx).isFile() ? idx : "";
    }
  } else if (existsSync(file) && statSync(file).isDirectory()) {
    if (!path.endsWith("/")) { res.writeHead(308, { Location: `${BASE}${path}/${url.search}` }).end(); return; }
    file = join(file, "index.html");
  }

  if (!file || !existsSync(file)) {
    const nf = join(ROOT, "404.html");
    res.writeHead(404, { "Content-Type": TYPES[".html"], "Cache-Control": "no-cache", ...(NGINX_LIKE ? SECURITY : {}) });
    if (existsSync(nf)) createReadStream(nf).pipe(res); else res.end("404");
    return;
  }

  const ext = extname(file);
  const headers = { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": cacheControl(path), ...(NGINX_LIKE ? SECURITY : {}) };
  if (NGINX_LIKE && GZIP.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "") && statSync(file).size >= 512) {
    const body = gzipSync(readFileSync(file));
    res.writeHead(200, { ...headers, "Content-Encoding": "gzip", Vary: "Accept-Encoding", "Content-Length": body.length }).end(body);
    return;
  }
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Servindo out/ em http://localhost:${PORT}${NGINX_LIKE ? " (modo NGINX_LIKE)" : ""}`));
