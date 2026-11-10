// Gera os ícones PWA e as telas de abertura (splash) do iOS a partir de um SVG.
// Uso: node scripts/generate-icons.mjs   (saída em public/icons)
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const OUT = "public/icons";
mkdirSync(OUT, { recursive: true });

const GREEN = "#1f4a3a";
const BG = "#f4f4f0";

/** Desenho: uma chapa de MDF com um plano de corte. `scale` encolhe o desenho (zona segura do ícone maskable). */
function glyph(scale = 1) {
  const s = 512 * scale;
  const o = (512 - s) / 2;
  const k = s / 512;
  const r = (x, y, w, h, fill, extra = "") =>
    `<rect x="${o + x * k}" y="${o + y * k}" width="${w * k}" height="${h * k}" fill="${fill}" ${extra}/>`;
  return `
    <g>
      ${r(96, 112, 320, 288, "#f3ede0", `rx="${18 * k}"`)}
      ${r(116, 132, 170, 150, "#8fc1a4", `rx="${6 * k}" stroke="${GREEN}" stroke-width="${6 * k}"`)}
      ${r(296, 132, 100, 90, "#cfe3d6", `rx="${6 * k}" stroke="${GREEN}" stroke-width="${6 * k}"`)}
      ${r(296, 232, 100, 50, "#e8d9bd", `rx="${6 * k}" stroke="${GREEN}" stroke-width="${6 * k}"`)}
      ${r(116, 292, 110, 88, "#e8d9bd", `rx="${6 * k}" stroke="${GREEN}" stroke-width="${6 * k}"`)}
      ${r(236, 292, 160, 88, "#d9efe1", `rx="${6 * k}" stroke="${GREEN}" stroke-width="${6 * k}" stroke-dasharray="${14 * k} ${8 * k}"`)}
    </g>`;
}

const iconSvg = (size, { rounded, glyphScale }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${GREEN}" ${rounded ? 'rx="112"' : ""}/>
  ${glyph(glyphScale)}
</svg>`;

async function png(svg, file, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`${OUT}/${file}`);
  console.log("✓", file);
}

await png(iconSvg(192, { rounded: true, glyphScale: 1 }), "icon-192.png", 192);
await png(iconSvg(512, { rounded: true, glyphScale: 1 }), "icon-512.png", 512);
// maskable: fundo cheio + desenho dentro dos 80% centrais
await png(iconSvg(512, { rounded: false, glyphScale: 0.72 }), "icon-maskable-512.png", 512);
await png(iconSvg(192, { rounded: false, glyphScale: 0.72 }), "icon-maskable-192.png", 192);
// iOS aplica o arredondamento sozinho: quadrado, sem transparência
await png(iconSvg(180, { rounded: false, glyphScale: 0.86 }), "apple-touch-icon.png", 180);
await png(iconSvg(64, { rounded: true, glyphScale: 1 }), "favicon-64.png", 64);

// Splash screens do iOS (retrato)
const splashes = [
  [1170, 2532], [1179, 2556], [1290, 2796], [750, 1334], [1125, 2436], [828, 1792],
];
for (const [w, h] of splashes) {
  const size = Math.round(Math.min(w, h) * 0.34);
  const icon = await sharp(Buffer.from(iconSvg(512, { rounded: true, glyphScale: 1 }))).resize(size, size).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 3, background: BG } })
    .composite([{ input: icon, left: Math.round((w - size) / 2), top: Math.round((h - size) / 2) }])
    .png()
    .toFile(`${OUT}/splash-${w}x${h}.png`);
  console.log("✓", `splash-${w}x${h}.png`);
}
