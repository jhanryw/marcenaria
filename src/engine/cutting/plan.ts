import type { Piece, Reserve, SheetMaterial } from "@/domain/schema";
import {
  FIT_KEYS,
  SORT_KEYS,
  SPLIT_KEYS,
  describeStrategy,
  packGuillotine,
  type PackItem,
  type PackedSheet,
  type Strategy,
} from "./guillotine";
import type {
  CutMetrics,
  FreeRegion,
  MaterialCutResult,
  Placement,
  ProjectCutResult,
  SheetLayout,
  UnplaceablePiece,
} from "./types";

export interface RemnantRules {
  /** Menor lado mínimo (mm) para uma sobra ser reaproveitável */
  minShortMm: number;
  /** Maior lado mínimo (mm) */
  minLongMm: number;
}

const EPS = 1e-6;

export function applyReserve(sheetsUsed: number, reserve: Reserve): number {
  if (sheetsUsed <= 0) return 0;
  switch (reserve.mode) {
    case "percent": {
      // arredonda para cima; o -1e-9 evita 3 × 1,10 = 3,3000000000000003 → 4
      const raw = (sheetsUsed * (100 + reserve.value)) / 100;
      return Math.ceil(Math.round(raw * 1e6) / 1e6 - 1e-9);
    }
    case "sheets":
      return sheetsUsed + Math.ceil(reserve.value - 1e-9);
    default:
      return sheetsUsed;
  }
}

function isReusable(w: number, h: number, rules: RemnantRules): boolean {
  return Math.min(w, h) + EPS >= rules.minShortMm && Math.max(w, h) + EPS >= rules.minLongMm;
}

function emptyMetrics(): CutMetrics {
  return {
    piecesAreaMm2: 0,
    sheetsAreaMm2: 0,
    unusedAreaMm2: 0,
    utilizationPercent: 0,
    marginAreaMm2: 0,
    reusableRemnantAreaMm2: 0,
    nonReusableAreaMm2: 0,
    kerfAreaMm2: 0,
    lossPercent: 0,
    reusablePercent: 0,
  };
}

interface Scored {
  sheets: PackedSheet[];
  strategy: Strategy;
  lastSheetPieceArea: number;
  fragments: number;
}

function better(a: Scored, b: Scored): boolean {
  // 1) menos chapas
  if (a.sheets.length !== b.sheets.length) return a.sheets.length < b.sheets.length;
  // 2) última chapa o mais vazia possível (gera sobra maior e mais útil)
  if (Math.abs(a.lastSheetPieceArea - b.lastSheetPieceArea) > 1) {
    return a.lastSheetPieceArea < b.lastSheetPieceArea;
  }
  // 3) menos fragmentos
  return a.fragments < b.fragments;
}

function sheetPieceArea(s: PackedSheet): number {
  return s.placements.reduce((acc, p) => acc + p.w * p.h, 0);
}

/** Calcula o plano de corte de UM material. */
export function planMaterial(
  material: SheetMaterial,
  pieces: Piece[],
  reserve: Reserve,
  rules: RemnantRules,
): MaterialCutResult {
  const margin = material.marginMm;
  const kerf = material.kerfMm;
  const usableW = material.lengthMm - 2 * margin;
  const usableH = material.widthMm - 2 * margin;
  const sheetArea = material.lengthMm * material.widthMm;

  const items: PackItem[] = [];
  const unplaceableMap = new Map<string, UnplaceablePiece>();
  let totalPieces = 0;

  const markUnplaceable = (p: Piece, reason: string) => {
    const cur = unplaceableMap.get(p.id);
    if (cur) cur.quantity += 1;
    else {
      unplaceableMap.set(p.id, {
        pieceId: p.id,
        ref: p.ref,
        description: p.description,
        widthMm: p.widthMm,
        lengthMm: p.lengthMm,
        quantity: 1,
        reason,
      });
    }
  };

  for (const p of pieces) {
    const qty = Number.isFinite(p.quantity) ? Math.floor(p.quantity) : 0;
    for (let i = 0; i < qty; i++) {
      totalPieces++;
      const valid = p.widthMm > 0 && p.lengthMm > 0 && Number.isFinite(p.widthMm) && Number.isFinite(p.lengthMm);
      if (!valid) {
        markUnplaceable(p, "Medidas inválidas (precisam ser maiores que zero).");
        continue;
      }
      const canRotate = p.allowRotation && !material.grainRequired;
      const fitsNormal = p.lengthMm <= usableW + EPS && p.widthMm <= usableH + EPS;
      const fitsRotated = canRotate && p.widthMm <= usableW + EPS && p.lengthMm <= usableH + EPS;
      if (usableW <= 0 || usableH <= 0 || (!fitsNormal && !fitsRotated)) {
        const why =
          usableW <= 0 || usableH <= 0
            ? "A margem de segurança consome toda a chapa."
            : `${p.lengthMm} × ${p.widthMm} mm não cabe na área útil de ${usableW} × ${usableH} mm` +
              (material.grainRequired
                ? " (material com veio: a peça não pode girar)."
                : p.allowRotation
                  ? " (mesmo girando 90°)."
                  : " (rotação desativada nesta peça).");
        markUnplaceable(p, why);
        continue;
      }
      items.push({
        pieceId: p.id,
        instance: i,
        ref: p.ref,
        description: p.description,
        w: p.lengthMm,
        h: p.widthMm,
        canRotate,
      });
    }
  }

  const unplaceable = [...unplaceableMap.values()];

  if (items.length === 0) {
    return {
      materialId: material.id,
      material,
      status: unplaceable.length > 0 ? "incomplete" : "empty",
      sheetsUsed: 0,
      reserveSheets: 0,
      sheetsToBuy: 0,
      sheets: [],
      unplaceable,
      metrics: emptyMetrics(),
      lowerBoundSheets: 0,
      provenOptimal: true,
      strategy: "—",
      strategiesTried: 0,
      totalPieces,
    };
  }

  // Testa todas as combinações de heurísticas e guarda a melhor.
  let best: Scored | null = null;
  let tried = 0;
  for (const sort of SORT_KEYS) {
    for (const fit of FIT_KEYS) {
      for (const split of SPLIT_KEYS) {
        const strategy: Strategy = { sort, fit, split };
        const sheets = packGuillotine(items, usableW, usableH, kerf, strategy);
        tried++;
        const cand: Scored = {
          sheets,
          strategy,
          lastSheetPieceArea: sheetPieceArea(sheets[sheets.length - 1]),
          fragments: sheets.reduce((a, s) => a + s.free.length, 0),
        };
        if (!best || better(cand, best)) best = cand;
      }
    }
  }
  const chosen = best!;

  // Converte para coordenadas da chapa (somando a margem) e classifica sobras.
  const layouts: SheetLayout[] = chosen.sheets.map((s, idx) => {
    const placements: Placement[] = s.placements.map((p) => ({
      pieceId: p.item.pieceId,
      instance: p.item.instance,
      ref: p.item.ref,
      description: p.item.description,
      x: p.x + margin,
      y: p.y + margin,
      w: p.w,
      h: p.h,
      rotated: p.rotated,
    }));
    const freeRegions: FreeRegion[] = s.free.map((r) => ({
      x: r.x + margin,
      y: r.y + margin,
      w: r.w,
      h: r.h,
      reusable: isReusable(r.w, r.h, rules),
    }));
    return {
      index: idx + 1,
      placements,
      freeRegions,
      pieceAreaMm2: placements.reduce((a, p) => a + p.w * p.h, 0),
    };
  });

  const sheetsUsed = layouts.length;
  const piecesArea = layouts.reduce((a, l) => a + l.pieceAreaMm2, 0);
  const sheetsArea = sheetsUsed * sheetArea;
  const usableArea = usableW * usableH;
  const marginArea = sheetsUsed * (sheetArea - usableArea);
  let reusable = 0;
  let nonReusable = 0;
  for (const l of layouts) {
    for (const f of l.freeRegions) {
      if (f.reusable) reusable += f.w * f.h;
      else nonReusable += f.w * f.h;
    }
  }
  // Tudo que não é peça, sobra retangular ou refilo foi consumido pela serra.
  const kerfArea = Math.max(0, sheetsArea - marginArea - piecesArea - reusable - nonReusable);

  const metrics: CutMetrics = {
    piecesAreaMm2: piecesArea,
    sheetsAreaMm2: sheetsArea,
    unusedAreaMm2: sheetsArea - piecesArea,
    utilizationPercent: sheetsArea > 0 ? (piecesArea / sheetsArea) * 100 : 0,
    marginAreaMm2: marginArea,
    reusableRemnantAreaMm2: reusable,
    nonReusableAreaMm2: nonReusable,
    kerfAreaMm2: kerfArea,
    lossPercent: sheetsArea > 0 ? ((marginArea + kerfArea + nonReusable) / sheetsArea) * 100 : 0,
    reusablePercent: sheetsArea > 0 ? (reusable / sheetsArea) * 100 : 0,
  };

  const lowerBound = Math.max(1, Math.ceil(piecesArea / usableArea - 1e-9));
  const sheetsToBuy = applyReserve(sheetsUsed, reserve);

  return {
    materialId: material.id,
    material,
    status: unplaceable.length > 0 ? "incomplete" : "ok",
    sheetsUsed,
    reserveSheets: sheetsToBuy - sheetsUsed,
    sheetsToBuy,
    sheets: layouts,
    unplaceable,
    metrics,
    lowerBoundSheets: lowerBound,
    provenOptimal: sheetsUsed === lowerBound,
    strategy: describeStrategy(chosen.strategy),
    strategiesTried: tried,
    totalPieces,
  };
}

/** Calcula o plano de corte de todos os materiais do projeto. */
export function planProjectCutting(
  materials: SheetMaterial[],
  pieces: Piece[],
  reserve: Reserve,
  rules: RemnantRules,
): ProjectCutResult {
  const byMaterial = new Map<string, Piece[]>();
  const orphanPieces: UnplaceablePiece[] = [];
  const materialIds = new Set(materials.map((m) => m.id));

  for (const p of pieces) {
    if (!materialIds.has(p.materialId)) {
      orphanPieces.push({
        pieceId: p.id,
        ref: p.ref,
        description: p.description,
        widthMm: p.widthMm,
        lengthMm: p.lengthMm,
        quantity: p.quantity,
        reason: "Material não encontrado neste orçamento.",
      });
      continue;
    }
    const arr = byMaterial.get(p.materialId) ?? [];
    arr.push(p);
    byMaterial.set(p.materialId, arr);
  }

  const results: MaterialCutResult[] = [];
  for (const m of materials) {
    const ps = byMaterial.get(m.id);
    if (!ps || ps.length === 0) continue;
    results.push(planMaterial(m, ps, reserve, rules));
  }

  const errors: string[] = [];
  for (const r of results) {
    for (const u of r.unplaceable) {
      errors.push(`${r.material.name}: "${u.description}" (${u.quantity}×) — ${u.reason}`);
    }
  }
  for (const o of orphanPieces) errors.push(`"${o.description}": ${o.reason}`);

  return {
    materials: results,
    orphanPieces,
    totalSheetsToBuy: results.reduce((a, r) => a + r.sheetsToBuy, 0),
    totalSheetsUsed: results.reduce((a, r) => a + r.sheetsUsed, 0),
    piecesAreaMm2: results.reduce((a, r) => a + r.metrics.piecesAreaMm2, 0),
    sheetsAreaMm2: results.reduce((a, r) => a + r.metrics.sheetsAreaMm2, 0),
    complete: errors.length === 0,
    errors,
  };
}
