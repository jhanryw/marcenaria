/**
 * Validação geométrica independente do algoritmo de empacotamento.
 * Usada nos testes e também em tempo de execução: se o motor algum dia
 * produzir um plano inválido, a interface mostra erro em vez de números falsos.
 */
import type { Piece } from "@/domain/schema";
import type { MaterialCutResult, Placement } from "./types";

const EPS = 1e-6;

export interface LayoutViolation {
  sheetIndex: number;
  message: string;
}

/**
 * Verifica se o conjunto de peças pode ser cortado apenas com cortes de ponta
 * a ponta (guilhotina): existe uma linha vertical ou horizontal que não cruza
 * nenhuma peça e separa o conjunto em dois subconjuntos também guilhotináveis.
 */
export function isGuillotineCuttable(placements: Placement[]): boolean {
  if (placements.length <= 1) return true;

  for (const axis of ["x", "y"] as const) {
    const start = (p: Placement) => (axis === "x" ? p.x : p.y);
    const end = (p: Placement) => (axis === "x" ? p.x + p.w : p.y + p.h);
    const candidates = [...new Set(placements.map(end))];
    for (const c of candidates) {
      const before = placements.filter((p) => end(p) <= c + EPS);
      const after = placements.filter((p) => start(p) >= c - EPS);
      if (
        before.length > 0 &&
        after.length > 0 &&
        before.length + after.length === placements.length
      ) {
        return isGuillotineCuttable(before) && isGuillotineCuttable(after);
      }
    }
  }
  return false;
}

export function validateMaterialResult(r: MaterialCutResult, pieces: Piece[]): LayoutViolation[] {
  const v: LayoutViolation[] = [];
  const m = r.material;
  const pieceById = new Map(pieces.map((p) => [p.id, p]));
  const placedCount = new Map<string, number>();

  for (const sheet of r.sheets) {
    const ps = sheet.placements;

    // limites da área útil
    for (const p of ps) {
      if (p.x < m.marginMm - EPS || p.y < m.marginMm - EPS) {
        v.push({ sheetIndex: sheet.index, message: `"${p.description}" invade a margem de segurança.` });
      }
      if (p.x + p.w > m.lengthMm - m.marginMm + EPS || p.y + p.h > m.widthMm - m.marginMm + EPS) {
        v.push({ sheetIndex: sheet.index, message: `"${p.description}" ultrapassa a área útil da chapa.` });
      }
      placedCount.set(p.pieceId, (placedCount.get(p.pieceId) ?? 0) + 1);

      // dimensões e rotação coerentes com a peça original
      const src = pieceById.get(p.pieceId);
      if (!src) {
        v.push({ sheetIndex: sheet.index, message: `Peça ${p.pieceId} desconhecida.` });
        continue;
      }
      const expW = p.rotated ? src.widthMm : src.lengthMm;
      const expH = p.rotated ? src.lengthMm : src.widthMm;
      if (Math.abs(expW - p.w) > EPS || Math.abs(expH - p.h) > EPS) {
        v.push({ sheetIndex: sheet.index, message: `"${p.description}" teve as medidas alteradas.` });
      }
      if (p.rotated && (!src.allowRotation || m.grainRequired)) {
        v.push({ sheetIndex: sheet.index, message: `"${p.description}" foi girada, mas a rotação não é permitida.` });
      }
    }

    // sobreposição e distância mínima (serra) entre pares
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i];
        const b = ps[j];
        const separated =
          a.x + a.w + m.kerfMm <= b.x + EPS ||
          b.x + b.w + m.kerfMm <= a.x + EPS ||
          a.y + a.h + m.kerfMm <= b.y + EPS ||
          b.y + b.h + m.kerfMm <= a.y + EPS;
        if (!separated) {
          v.push({
            sheetIndex: sheet.index,
            message: `"${a.description}" e "${b.description}" se sobrepõem ou estão mais próximas que a espessura da serra.`,
          });
        }
      }
    }

    if (!isGuillotineCuttable(ps)) {
      v.push({ sheetIndex: sheet.index, message: "O padrão de corte da chapa não é guilhotinável." });
    }
  }

  // contagem: posicionadas + não posicionadas = quantidade pedida
  for (const p of pieces) {
    const placed = placedCount.get(p.id) ?? 0;
    const missing = r.unplaceable.find((u) => u.pieceId === p.id)?.quantity ?? 0;
    if (placed + missing !== p.quantity) {
      v.push({
        sheetIndex: 0,
        message: `"${p.description}": ${placed} posicionadas + ${missing} que não cabem ≠ ${p.quantity} pedidas.`,
      });
    }
  }

  // balanço de áreas
  const mt = r.metrics;
  const sum =
    mt.piecesAreaMm2 + mt.reusableRemnantAreaMm2 + mt.nonReusableAreaMm2 + mt.kerfAreaMm2 + mt.marginAreaMm2;
  if (Math.abs(sum - mt.sheetsAreaMm2) > 1) {
    v.push({ sheetIndex: 0, message: "O balanço de áreas (peças + sobras + serra + refilo) não fecha com a área das chapas." });
  }

  return v;
}
