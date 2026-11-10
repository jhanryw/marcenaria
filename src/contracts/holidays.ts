
/** Feriados nacionais de data FIXA. Feriados móveis (Carnaval, Sexta-feira Santa, Corpus Christi) e locais devem ser adicionados à mão. */
export function fixedNationalHolidays(year: number): string[] {
  const d = (m: number, day: number) => `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return [d(1, 1), d(4, 21), d(5, 1), d(9, 7), d(10, 12), d(11, 2), d(11, 15), d(11, 20), d(12, 25)];
}

export function mergeHolidays(current: string[], add: string[]): string[] {
  return [...new Set([...current, ...add])].sort();
}

