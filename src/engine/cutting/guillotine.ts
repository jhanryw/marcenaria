/**
 * Heurística de empacotamento 2D com cortes guilhotinados.
 *
 * Funciona sobre a ÁREA ÚTIL da chapa (já descontadas as margens), com origem
 * em (0,0). Cada peça colocada divide o retângulo livre em dois novos
 * retângulos livres (direita e abaixo) separados por uma faixa igual à
 * espessura da serra (kerf). Como toda divisão é um corte de ponta a ponta no
 * retângulo, o resultado é sempre executável em uma serra esquadrejadora.
 *
 * É uma HEURÍSTICA: não garante o número mínimo de chapas. O motor testa várias
 * combinações (ordenação × critério de encaixe × regra de divisão) e escolhe a
 * melhor, mas o resultado continua sendo uma estimativa.
 */

export interface PackItem {
  pieceId: string;
  instance: number;
  ref: string;
  description: string;
  /** Extensão em x na orientação original (comprimento da peça) */
  w: number;
  /** Extensão em y na orientação original (largura da peça) */
  h: number;
  canRotate: boolean;
}

export interface PackedPlacement {
  item: PackItem;
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PackedSheet {
  placements: PackedPlacement[];
  free: Rect[];
}

export type SortKey = "area" | "longSide" | "shortSide" | "width" | "height" | "perimeter";
export type FitKey = "bestShortSide" | "bestLongSide" | "bestArea";
export type SplitKey =
  | "shorterLeftoverAxis"
  | "longerLeftoverAxis"
  | "horizontalFirst"
  | "verticalFirst"
  | "maxAreaSplit"
  | "minAreaSplit";

export interface Strategy {
  sort: SortKey;
  fit: FitKey;
  split: SplitKey;
}

export const SORT_KEYS: SortKey[] = ["area", "longSide", "shortSide", "width", "height", "perimeter"];
export const FIT_KEYS: FitKey[] = ["bestShortSide", "bestLongSide", "bestArea"];
export const SPLIT_KEYS: SplitKey[] = [
  "shorterLeftoverAxis",
  "longerLeftoverAxis",
  "horizontalFirst",
  "verticalFirst",
  "maxAreaSplit",
  "minAreaSplit",
];

export const SORT_LABELS: Record<SortKey, string> = {
  area: "maior área",
  longSide: "maior lado",
  shortSide: "menor lado",
  width: "comprimento",
  height: "largura",
  perimeter: "perímetro",
};
export const FIT_LABELS: Record<FitKey, string> = {
  bestShortSide: "menor sobra no lado curto",
  bestLongSide: "menor sobra no lado longo",
  bestArea: "menor área sobrando",
};
export const SPLIT_LABELS: Record<SplitKey, string> = {
  shorterLeftoverAxis: "eixo de menor sobra",
  longerLeftoverAxis: "eixo de maior sobra",
  horizontalFirst: "corte horizontal primeiro",
  verticalFirst: "corte vertical primeiro",
  maxAreaSplit: "preservar maior retalho",
  minAreaSplit: "equilibrar retalhos",
};

export function describeStrategy(s: Strategy): string {
  return `ordenação por ${SORT_LABELS[s.sort]} · encaixe: ${FIT_LABELS[s.fit]} · divisão: ${SPLIT_LABELS[s.split]}`;
}

const EPS = 1e-9;

function sortItems(items: PackItem[], key: SortKey): PackItem[] {
  const long = (i: PackItem) => Math.max(i.w, i.h);
  const short = (i: PackItem) => Math.min(i.w, i.h);
  const cmp: Record<SortKey, (a: PackItem, b: PackItem) => number> = {
    area: (a, b) => b.w * b.h - a.w * a.h || long(b) - long(a),
    longSide: (a, b) => long(b) - long(a) || short(b) - short(a),
    shortSide: (a, b) => short(b) - short(a) || long(b) - long(a),
    width: (a, b) => b.w - a.w || b.h - a.h,
    height: (a, b) => b.h - a.h || b.w - a.w,
    perimeter: (a, b) => b.w + b.h - (a.w + a.h) || b.w * b.h - a.w * a.h,
  };
  const c = cmp[key];
  // desempate determinístico por pieceId/instância
  return [...items].sort(
    (a, b) => c(a, b) || a.pieceId.localeCompare(b.pieceId) || a.instance - b.instance,
  );
}

function fitScore(fit: FitKey, rect: Rect, pw: number, ph: number): [number, number] {
  const lw = rect.w - pw;
  const lh = rect.h - ph;
  switch (fit) {
    case "bestShortSide":
      return [Math.min(lw, lh), Math.max(lw, lh)];
    case "bestLongSide":
      return [Math.max(lw, lh), Math.min(lw, lh)];
    case "bestArea":
      return [rect.w * rect.h - pw * ph, Math.min(lw, lh)];
  }
}

function lessThan(a: [number, number], b: [number, number]): boolean {
  if (a[0] < b[0] - EPS) return true;
  if (a[0] > b[0] + EPS) return false;
  return a[1] < b[1] - EPS;
}

/** true => corte horizontal primeiro (a faixa de baixo ocupa toda a largura do retângulo) */
function horizontalFirst(split: SplitKey, rect: Rect, pw: number, ph: number, kerf: number): boolean {
  const lw = rect.w - pw - kerf;
  const lh = rect.h - ph - kerf;
  switch (split) {
    case "horizontalFirst":
      return true;
    case "verticalFirst":
      return false;
    case "shorterLeftoverAxis":
      return lw <= lh;
    case "longerLeftoverAxis":
      return lw > lh;
    case "maxAreaSplit":
    case "minAreaSplit": {
      const rw = Math.max(0, lw);
      const bh = Math.max(0, lh);
      // opção A: horizontal primeiro => direita = rw × ph ; baixo = rect.w × bh
      const aMax = Math.max(rw * ph, rect.w * bh);
      // opção B: vertical primeiro   => direita = rw × rect.h ; baixo = pw × bh
      const bMax = Math.max(rw * rect.h, pw * bh);
      return split === "maxAreaSplit" ? aMax >= bMax : aMax < bMax;
    }
  }
}

function splitRect(rect: Rect, pw: number, ph: number, kerf: number, hFirst: boolean): Rect[] {
  const out: Rect[] = [];
  const rightW = rect.w - pw - kerf;
  const bottomH = rect.h - ph - kerf;
  if (hFirst) {
    if (rightW > EPS && ph > EPS) out.push({ x: rect.x + pw + kerf, y: rect.y, w: rightW, h: ph });
    if (bottomH > EPS) out.push({ x: rect.x, y: rect.y + ph + kerf, w: rect.w, h: bottomH });
  } else {
    if (rightW > EPS) out.push({ x: rect.x + pw + kerf, y: rect.y, w: rightW, h: rect.h });
    if (bottomH > EPS && pw > EPS) out.push({ x: rect.x, y: rect.y + ph + kerf, w: pw, h: bottomH });
  }
  return out;
}

interface Candidate {
  sheet: number;
  rectIdx: number;
  w: number;
  h: number;
  rotated: boolean;
  score: [number, number];
}

/**
 * Empacota `items` em quantas chapas forem necessárias.
 * Pré-condição: todo item cabe (em alguma orientação permitida) numa chapa vazia.
 */
export function packGuillotine(
  items: PackItem[],
  usableW: number,
  usableH: number,
  kerf: number,
  strategy: Strategy,
): PackedSheet[] {
  const sheets: PackedSheet[] = [];
  const ordered = sortItems(items, strategy.sort);

  for (const item of ordered) {
    let best: Candidate | null = null;

    for (let s = 0; s < sheets.length; s++) {
      const free = sheets[s].free;
      for (let r = 0; r < free.length; r++) {
        const rect = free[r];
        const orientations: Array<[number, number, boolean]> = [[item.w, item.h, false]];
        if (item.canRotate && Math.abs(item.w - item.h) > EPS) orientations.push([item.h, item.w, true]);
        for (const [pw, ph, rotated] of orientations) {
          if (pw > rect.w + EPS || ph > rect.h + EPS) continue;
          const score = fitScore(strategy.fit, rect, pw, ph);
          if (!best || lessThan(score, best.score)) {
            best = { sheet: s, rectIdx: r, w: pw, h: ph, rotated, score };
          }
        }
      }
    }

    if (!best) {
      // abre uma nova chapa
      const orientations: Array<[number, number, boolean]> = [[item.w, item.h, false]];
      if (item.canRotate && Math.abs(item.w - item.h) > EPS) orientations.push([item.h, item.w, true]);
      const rect: Rect = { x: 0, y: 0, w: usableW, h: usableH };
      let chosen: Candidate | null = null;
      for (const [pw, ph, rotated] of orientations) {
        if (pw > usableW + EPS || ph > usableH + EPS) continue;
        const score = fitScore(strategy.fit, rect, pw, ph);
        if (!chosen || lessThan(score, chosen.score)) {
          chosen = { sheet: sheets.length, rectIdx: 0, w: pw, h: ph, rotated, score };
        }
      }
      if (!chosen) {
        throw new Error(`Peça ${item.pieceId} não cabe em uma chapa vazia (violação de pré-condição).`);
      }
      sheets.push({ placements: [], free: [rect] });
      best = chosen;
    }

    const sheet = sheets[best.sheet];
    const rect = sheet.free[best.rectIdx];
    sheet.placements.push({ item, x: rect.x, y: rect.y, w: best.w, h: best.h, rotated: best.rotated });
    const hFirst = horizontalFirst(strategy.split, rect, best.w, best.h, kerf);
    const pieces = splitRect(rect, best.w, best.h, kerf, hFirst);
    sheet.free.splice(best.rectIdx, 1, ...pieces);
  }

  return sheets;
}
