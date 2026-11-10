/**
 * Utilitários de dinheiro e números no padrão brasileiro.
 * Todo valor monetário do sistema é armazenado em CENTAVOS INTEIROS; só
 * convertemos para reais na hora de exibir.
 */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatBRL(cents: number): string {
  if (!Number.isFinite(cents)) return "R$ —";
  // Intl usa U+00A0 entre "R$" e o número; mantemos (evita quebra de linha)
  return brl.format(cents / 100);
}

/** "1.234,56" (sem o símbolo) */
export function formatMoneyPlain(cents: number): string {
  return num2.format(cents / 100);
}

export function formatNumber(value: number, maxDecimals = 2, minDecimals = 0): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

export function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `${formatNumber(value, decimals)}%`;
}

export function formatMm(value: number): string {
  return `${formatNumber(value, 1)} mm`;
}

/** mm² → m² formatado, ex.: "3,25 m²" */
export function formatM2(mm2: number): string {
  return `${formatNumber(mm2 / 1_000_000, 2, 2)} m²`;
}

export function formatMeters(mm: number): string {
  return `${formatNumber(mm / 1000, 2, 2)} m`;
}

/**
 * Converte texto digitado em número, aceitando padrão brasileiro e internacional.
 *  "1.234,56" → 1234.56 · "1234,5" → 1234.5 · "12.5" → 12.5 · "1.500" → 1500
 * Retorna null se o texto não for um número.
 */
export function parseDecimal(input: string): number | null {
  let s = input.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (s === "") return null;
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;

  if (s.includes(",")) {
    // vírgula é o separador decimal; pontos são milhar
    const parts = s.split(",");
    if (parts.length > 2) return null;
    const intPart = parts[0].replace(/\./g, "");
    const frac = parts[1] ?? "";
    if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac)) return null;
    const v = Number(`${intPart || "0"}.${frac || "0"}`);
    return negative ? -v : v;
  }
  if (s.includes(".")) {
    // só pontos: "1.500" / "1.234.567" → milhar; "12.5" / "0.75" → decimal
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      const v = Number(s.replace(/\./g, ""));
      return negative ? -v : v;
    }
    const parts = s.split(".");
    if (parts.length > 2) return null;
    const v = Number(s);
    return Number.isFinite(v) ? (negative ? -v : v) : null;
  }
  const v = Number(s);
  return Number.isFinite(v) ? (negative ? -v : v) : null;
}

/** Texto em reais → centavos inteiros (arredondado). */
export function parseMoneyToCents(input: string): number | null {
  const v = parseDecimal(input);
  if (v === null) return null;
  return mulCents(100, v);
}

/** Centavos × fator, arredondando corretamente (evita erros de ponto flutuante). */
export function mulCents(cents: number, factor: number): number {
  // 1e-9 de folga compensa representações como 1.005 * 100 = 100.49999999999999
  return Math.round(cents * factor + (cents * factor >= 0 ? 1e-9 : -1e-9));
}
