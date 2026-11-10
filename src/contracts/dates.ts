/**
 * Datas como texto "AAAA-MM-DD" (sem fuso horário). Toda aritmética é feita em UTC
 * para que o resultado seja o mesmo em qualquer fuso ou horário de verão.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidISODate(s: string | null | undefined): s is string {
  if (!s) return false;
  const m = ISO.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function toDate(iso: string): Date {
  const m = ISO.exec(iso);
  if (!m) throw new RangeError(`Data inválida: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function toISO(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function todayISO(now = new Date()): string {
  // data local do usuário
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, n: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function isWeekend(iso: string): boolean {
  const wd = toDate(iso).getUTCDay();
  return wd === 0 || wd === 6;
}

export function isBusinessDay(iso: string, holidays: ReadonlySet<string>): boolean {
  return !isWeekend(iso) && !holidays.has(iso);
}

/**
 * Soma `n` dias úteis: o dia de partida NÃO conta; o primeiro dia contado é o dia útil seguinte.
 * Sábados, domingos e feriados informados são ignorados.
 */
export function addBusinessDays(iso: string, n: number, holidays: ReadonlySet<string> = new Set()): string {
  let cur = iso;
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    cur = addDays(cur, 1);
    if (isBusinessDay(cur, holidays)) left--;
  }
  return cur;
}

export function addLeadTime(
  startIso: string,
  amount: number,
  unit: "corridos" | "uteis",
  holidays: ReadonlySet<string> = new Set(),
): string {
  return unit === "uteis" ? addBusinessDays(startIso, amount, holidays) : addDays(startIso, amount);
}

/** Próximo dia útil a partir de `iso` (o próprio dia, se já for útil). */
export function nextBusinessDay(iso: string, holidays: ReadonlySet<string> = new Set()): string {
  let cur = iso;
  while (!isBusinessDay(cur, holidays)) cur = addDays(cur, 1);
  return cur;
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!isValidISODate(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function formatDateLongBR(iso: string | null | undefined): string {
  if (!isValidISODate(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)} de ${MONTHS[Number(m) - 1]} de ${y}`;
}

/** ISO completo (com hora) → "AAAA-MM-DD" na data local do usuário. */
export function isoToLocalDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : todayISO(d);
}
