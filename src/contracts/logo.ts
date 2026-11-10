/**
 * Prepara o logotipo para armazenamento local: reduz para no máximo 480×200 px e guarda como data URL
 * (PNG, preservando transparência, ou JPEG). O limite final é ~180 KB para não pesar no IndexedDB nem no backup JSON.
 */
export const LOGO_MAX_BYTES = 180 * 1024;
export const LOGO_MAX_W = 480;
export const LOGO_MAX_H = 200;

function dataUrlBytes(url: string): number {
  return Math.floor(((url.length - url.indexOf(",") - 1) * 3) / 4);
}

export async function processLogoFile(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.type)) {
    throw new Error("Use uma imagem PNG, JPG, WebP ou SVG.");
  }
  if (file.size > 8 * 1024 * 1024) throw new Error("A imagem é grande demais (máximo 8 MB).");

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("Não foi possível ler esta imagem.");
  const k = Math.min(LOGO_MAX_W / bitmap.width, LOGO_MAX_H / bitmap.height, 1);
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não permite processar imagens.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // PNG primeiro (nítido para logotipos); se ficar grande, JPEG com fundo branco e qualidade decrescente
  let url = canvas.toDataURL("image/png");
  if (dataUrlBytes(url) <= LOGO_MAX_BYTES) return url;

  const flat = document.createElement("canvas");
  flat.width = w;
  flat.height = h;
  const fctx = flat.getContext("2d")!;
  fctx.fillStyle = "#ffffff";
  fctx.fillRect(0, 0, w, h);
  fctx.drawImage(canvas, 0, 0);
  for (const q of [0.9, 0.8, 0.65, 0.5, 0.35]) {
    url = flat.toDataURL("image/jpeg", q);
    if (dataUrlBytes(url) <= LOGO_MAX_BYTES) return url;
  }
  throw new Error("Não foi possível reduzir esta imagem o bastante. Tente uma imagem mais simples.");
}
