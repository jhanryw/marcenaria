import { BASE_PATH } from "@/lib/pwa";
import type { FontKey } from "./layout";

/**
 * Fontes embutidas no PDF (licença SIL OFL — ver public/fonts/LICENSE-*.txt):
 *  - Noto Serif: texto corrido do contrato;
 *  - Inter: títulos, rótulos e rodapé.
 * Subconjunto "latin" completo para o português (acentos, ç, ª, º, §, aspas, travessões, €).
 * Ficam em public/fonts e são pré-cacheadas pelo service worker (geração de PDF offline).
 */
export const FONT_FILES: Record<FontKey, string> = {
  serif: "noto-serif-latin-400-normal.woff",
  serifBold: "noto-serif-latin-700-normal.woff",
  serifItalic: "noto-serif-latin-400-italic.woff",
  sans: "inter-latin-400-normal.woff",
  sansSemi: "inter-latin-600-normal.woff",
  sansBold: "inter-latin-700-normal.woff",
};

export type FontBytes = Record<FontKey, Uint8Array>;

let cached: Promise<FontBytes> | null = null;

export function loadFontBytes(): Promise<FontBytes> {
  if (!cached) {
    cached = (async () => {
      const entries = await Promise.all(
        (Object.keys(FONT_FILES) as FontKey[]).map(async (k) => {
          const res = await fetch(`${BASE_PATH}/fonts/${FONT_FILES[k]}`);
          if (!res.ok) throw new Error(`Não foi possível carregar a fonte ${FONT_FILES[k]}`);
          return [k, new Uint8Array(await res.arrayBuffer())] as const;
        }),
      );
      return Object.fromEntries(entries) as FontBytes;
    })().catch((e) => {
      cached = null; // permite tentar de novo
      throw e;
    });
  }
  return cached;
}
