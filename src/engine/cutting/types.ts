import type { SheetMaterial } from "@/domain/schema";

/**
 * Sistema de coordenadas dos planos de corte (milímetros):
 *  - origem (0,0) no canto superior esquerdo da CHAPA (não da área útil);
 *  - eixo x ao longo do COMPRIMENTO da chapa (ex.: 2750);
 *  - eixo y ao longo da LARGURA da chapa (ex.: 1850);
 *  - a área útil começa em (marginMm, marginMm).
 */

export interface Placement {
  pieceId: string;
  /** Índice da cópia (0..quantidade-1) */
  instance: number;
  ref: string;
  description: string;
  x: number;
  y: number;
  /** Extensão em x (já considerando a rotação) */
  w: number;
  /** Extensão em y (já considerando a rotação) */
  h: number;
  rotated: boolean;
}

export interface FreeRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Atende às dimensões mínimas configuradas para sobra reaproveitável */
  reusable: boolean;
}

export interface SheetLayout {
  /** Começa em 1 */
  index: number;
  placements: Placement[];
  freeRegions: FreeRegion[];
  pieceAreaMm2: number;
}

export interface UnplaceablePiece {
  pieceId: string;
  ref: string;
  description: string;
  widthMm: number;
  lengthMm: number;
  quantity: number;
  reason: string;
}

export interface CutMetrics {
  /** Σ área das peças posicionadas (mm²) */
  piecesAreaMm2: number;
  /** Área das chapas utilizadas, sem reserva (mm²) */
  sheetsAreaMm2: number;
  /** Área não ocupada por peças = chapas − peças (mm²) */
  unusedAreaMm2: number;
  /** Peças ÷ chapas (%) */
  utilizationPercent: number;
  /** Faixa de refilo nas bordas das chapas (mm²) */
  marginAreaMm2: number;
  /** Sobras retangulares que atendem às dimensões mínimas (mm²) */
  reusableRemnantAreaMm2: number;
  /** Sobras retangulares pequenas demais para reaproveitar (mm²) */
  nonReusableAreaMm2: number;
  /** Faixas consumidas pela serra + aparas mínimas entre cortes (mm²) */
  kerfAreaMm2: number;
  /** (refilo + serra + sobras não reaproveitáveis) ÷ chapas (%) */
  lossPercent: number;
  /** Sobra reaproveitável ÷ chapas (%) */
  reusablePercent: number;
}

export type CutStatus = "ok" | "incomplete" | "empty";

export interface MaterialCutResult {
  materialId: string;
  material: SheetMaterial;
  status: CutStatus;
  /** Chapas efetivamente necessárias para as peças que couberam */
  sheetsUsed: number;
  /** Chapas extras de reserva */
  reserveSheets: number;
  /** sheetsUsed + reserva (arredondado para cima) */
  sheetsToBuy: number;
  sheets: SheetLayout[];
  unplaceable: UnplaceablePiece[];
  metrics: CutMetrics;
  /** Limite inferior por área: nenhuma solução usa menos chapas que isso */
  lowerBoundSheets: number;
  /** true somente quando sheetsUsed == lowerBoundSheets (ótimo comprovado) */
  provenOptimal: boolean;
  strategy: string;
  strategiesTried: number;
  totalPieces: number;
}

export interface ProjectCutResult {
  materials: MaterialCutResult[];
  /** Peças que apontam para um material inexistente no projeto */
  orphanPieces: UnplaceablePiece[];
  totalSheetsToBuy: number;
  totalSheetsUsed: number;
  piecesAreaMm2: number;
  sheetsAreaMm2: number;
  /** true se TODAS as peças foram posicionadas */
  complete: boolean;
  errors: string[];
}
