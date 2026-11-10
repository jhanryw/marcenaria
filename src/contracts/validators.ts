/** Validação de CPF/CNPJ e e-mail. Só confere formato e dígitos verificadores; não consulta nenhuma base. */

export const onlyDigits = (s: string): string => s.replace(/\D/g, "");

export function isValidCpf(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCnpj(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export type DocumentStatus = "empty" | "incomplete" | "valid" | "invalid";

/**
 * - empty: nada digitado (permitido);
 * - incomplete: ainda digitando (menos de 11 dígitos, ou entre 12 e 13);
 * - valid / invalid: 11 dígitos (CPF) ou 14 (CNPJ) conferidos.
 */
export function documentStatus(raw: string): DocumentStatus {
  const d = onlyDigits(raw);
  if (d.length === 0) return "empty";
  if (d.length === 11) return isValidCpf(d) ? "valid" : "invalid";
  if (d.length === 14) return isValidCnpj(d) ? "valid" : "invalid";
  if (d.length > 14) return "invalid";
  return "incomplete";
}

export function documentKind(raw: string): "CPF" | "CNPJ" | null {
  const n = onlyDigits(raw).length;
  return n === 11 ? "CPF" : n === 14 ? "CNPJ" : null;
}

/** Aplica a máscara quando o número de dígitos é completo; caso contrário devolve o texto como está. */
export function formatDocument(raw: string): string {
  const d = onlyDigits(raw);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return raw.trim();
}

export function isLikelyEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}
