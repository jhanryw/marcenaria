import type { EdgeSide, EdgeTape, Piece } from "@/domain/schema";
import { EDGE_SIDES } from "@/domain/schema";
import { mulCents } from "@/lib/money";

/**
 * Convenção das bordas (peça desenhada com o COMPRIMENTO na horizontal):
 *   superior / inferior → medem o COMPRIMENTO da peça
 *   esquerda / direita  → medem a LARGURA da peça
 */
export function edgeLengthMm(piece: Pick<Piece, "widthMm" | "lengthMm">, side: EdgeSide): number {
  return side === "top" || side === "bottom" ? piece.lengthMm : piece.widthMm;
}

/** Comprimento de fita (mm) de UMA unidade da peça, somando só as bordas marcadas. */
export function pieceTapeMm(piece: Piece): number {
  let total = 0;
  for (const side of EDGE_SIDES) {
    if (piece.edges[side]) total += edgeLengthMm(piece, side);
  }
  return total;
}

export interface TapeUsage {
  tapeId: string;
  tape: EdgeTape;
  /** Comprimento líquido (só as bordas) em mm */
  netMm: number;
  /** Com o percentual de perda aplicado, em mm */
  grossMm: number;
  meters: number;
  costCents: number;
}

export interface EdgeBandingResult {
  usages: TapeUsage[];
  totalCostCents: number;
  totalGrossMm: number;
  /** Bordas que apontam para uma fita que não existe no orçamento */
  missingTapeIds: string[];
}

export function computeEdgeBanding(pieces: Piece[], tapes: EdgeTape[]): EdgeBandingResult {
  const netByTape = new Map<string, number>();
  const missing = new Set<string>();
  const tapeIds = new Set(tapes.map((t) => t.id));

  for (const p of pieces) {
    if (!(p.widthMm > 0 && p.lengthMm > 0) || !(p.quantity >= 1)) continue;
    for (const side of EDGE_SIDES) {
      const tapeId = p.edges[side];
      if (!tapeId) continue;
      if (!tapeIds.has(tapeId)) {
        missing.add(tapeId);
        continue;
      }
      netByTape.set(tapeId, (netByTape.get(tapeId) ?? 0) + edgeLengthMm(p, side) * Math.floor(p.quantity));
    }
  }

  const usages: TapeUsage[] = [];
  for (const tape of tapes) {
    const net = netByTape.get(tape.id);
    if (!net) continue;
    const gross = net * (1 + tape.wastePercent / 100);
    usages.push({
      tapeId: tape.id,
      tape,
      netMm: net,
      grossMm: gross,
      meters: gross / 1000,
      // preço por metro × metros, arredondado ao centavo
      costCents: mulCents(tape.pricePerMeterCents, gross / 1000),
    });
  }

  return {
    usages,
    totalCostCents: usages.reduce((a, u) => a + u.costCents, 0),
    totalGrossMm: usages.reduce((a, u) => a + u.grossMm, 0),
    missingTapeIds: [...missing],
  };
}
