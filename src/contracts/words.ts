/** Números e valores monetários por extenso, em português do Brasil. */

const UNITS = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze",
  "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** 1..999 */
function below1000(n: number): string {
  if (n === 100) return "cem";
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h > 0) parts.push(HUNDREDS[h]);
  if (rest > 0) {
    if (rest < 20) parts.push(UNITS[rest]);
    else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u ? `${TENS[t]} e ${UNITS[u]}` : TENS[t]);
    }
  }
  return parts.join(" e ");
}

const SCALES: Array<{ value: number; singular: string; plural: string }> = [
  { value: 1_000_000_000, singular: "bilhão", plural: "bilhões" },
  { value: 1_000_000, singular: "milhão", plural: "milhões" },
  { value: 1_000, singular: "mil", plural: "mil" },
];

/** Inteiro de 0 a 999.999.999.999 por extenso. */
export function intToWordsPt(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999_999_999) throw new RangeError("Número fora do intervalo suportado");
  if (n === 0) return "zero";

  const chunks: string[] = [];
  const raws: number[] = []; // valor restante depois de cada pedaço, para decidir "e"
  let rest = n;
  for (const sc of SCALES) {
    const q = Math.floor(rest / sc.value);
    rest %= sc.value;
    if (q === 0) continue;
    let text: string;
    if (sc.value === 1_000) text = q === 1 ? "mil" : `${below1000(q)} mil`;
    else text = `${q === 1 ? "um" : below1000(q)} ${q === 1 ? sc.singular : sc.plural}`;
    chunks.push(text);
    raws.push(rest);
  }
  if (rest > 0) {
    chunks.push(below1000(rest));
    raws.push(0);
  }

  // Une os pedaços: "e" antes do último quando ele é < 100 ou centena redonda; vírgula nos demais casos.
  let out = chunks[0];
  for (let i = 1; i < chunks.length; i++) {
    const remainingAfterPrev = raws[i - 1];
    const isLast = i === chunks.length - 1;
    const useE = isLast && (remainingAfterPrev < 100 || remainingAfterPrev % 100 === 0);
    out += useE ? ` e ${chunks[i]}` : `, ${chunks[i]}`;
  }
  return out;
}

/** 500000 → "cinco mil reais"; 125050 → "mil, duzentos e cinquenta reais e cinquenta centavos". */
export function moneyToWordsPt(totalCents: number): string {
  const cents = Math.round(totalCents);
  if (!Number.isFinite(cents) || cents < 0) throw new RangeError("Valor inválido");
  const reais = Math.floor(cents / 100);
  const c = cents % 100;
  if (reais === 0 && c === 0) return "zero real";

  const parts: string[] = [];
  if (reais > 0) {
    const unit = reais === 1 ? "real" : reais % 1_000_000 === 0 ? "de reais" : "reais";
    parts.push(`${intToWordsPt(reais)} ${unit}`);
  }
  if (c > 0) parts.push(`${intToWordsPt(c)} ${c === 1 ? "centavo" : "centavos"}`);
  return parts.join(" e ");
}
