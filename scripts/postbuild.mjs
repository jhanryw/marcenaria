// Pós-build: gera out/sw.js com a lista de arquivos a pré-cachear e uma versão
// derivada do conteúdo (muda sempre que qualquer arquivo do app mudar).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = "out";

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const all = walk(OUT)
  .map((f) => relative(OUT, f).split(sep).join("/"))
  .filter((f) => f !== "sw.js" && !f.endsWith(".map") && !f.startsWith(".") && !f.includes("/."))
  .sort();

const hash = createHash("sha1");
for (const f of all) {
  hash.update(f);
  hash.update(readFileSync(join(OUT, f)));
}
const version = hash.digest("hex").slice(0, 12);

// URLs relativas ao escopo: "x/index.html" vira "x/"; "index.html" vira "./"
const urls = new Set();
for (const f of all) {
  if (f === "index.html") {
    urls.add("./");
  } else if (f.endsWith("/index.html")) {
    urls.add(f.slice(0, -"index.html".length));
  } else {
    urls.add(f);
  }
}
// 404.html é útil como fallback, mas não precisa estar offline
urls.delete("404.html");

const template = readFileSync("scripts/sw.template.js", "utf8");
const sw = template.replace("__VERSION__", version).replace("__PRECACHE__", JSON.stringify([...urls], null, 2));
writeFileSync(join(OUT, "sw.js"), sw);
console.log(`✓ out/sw.js gerado — versão ${version}, ${urls.size} arquivos no pré-cache`);
