/**
 * Conversão de unidades de comprimento — ÚNICO lugar com a regra 1 cm = 10 mm.
 *
 * Regra do app: tudo que é ARMAZENADO e CALCULADO (peças, chapas, margens, serra, posições do plano de corte,
 * validação geométrica, exportações) fica em MILÍMETROS. Centímetros existem só na interface: na digitação e na
 * exibição de medidas lineares de peças e chapas. Dados antigos não são migrados nem multiplicados: 600 mm
 * armazenados aparecem como 60 cm e voltam a ser gravados como 600 mm.
 *
 * Precisão: a conversão desloca a vírgula uma casa (×10 ou ÷10) e limpa o ruído de ponto flutuante na 6ª casa
 * (1,1 cm → 11 mm, não 11,000000000000002). Isso é 1000× mais fino que qualquer dimensão real (0,001 mm) e NÃO
 * arredonda medidas de marcenaria: 60,5 cm → 605 mm; 33,3 cm → 333 mm; 0,05 cm → 0,5 mm.
 */
import { formatNumber, parseDecimal } from "./money";

export const MM_PER_CM = 10;
const CLEAN = 1e6;

const clean = (n: number) => Math.round(n * CLEAN) / CLEAN;

/** cm → mm (ex.: 60,5 → 605). */
export function cmToMm(cm: number): number {
  return clean(cm * MM_PER_CM);
}

/** mm → cm (ex.: 605 → 60,5). */
export function mmToCm(mm: number): number {
  return clean(mm / MM_PER_CM);
}

/** Texto digitado em cm ("60", "60,5", "60.5") → mm; null se não for número. */
export function parseCmToMm(text: string): number | null {
  const v = parseDecimal(text);
  return v === null ? null : cmToMm(v);
}

/** mm armazenados → texto em cm no padrão brasileiro, sem zeros à toa: 600 → "60"; 605 → "60,5"; 2750 → "275". */
export function formatCm(mm: number, maxDecimals = 3): string {
  return formatNumber(mmToCm(mm), maxDecimals);
}

/** "60 cm" */
export function formatCmUnit(mm: number): string {
  return `${formatCm(mm)} cm`;
}

/** Medidas de uma peça/chapa em cm: "180 × 60" (comprimento × largura). */
export function formatCmPair(lengthMm: number, widthMm: number): string {
  return `${formatCm(lengthMm)} × ${formatCm(widthMm)}`;
}
