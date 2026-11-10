/**
 * Cálculo de entrada e parcelas em CENTAVOS INTEIROS. Nunca sobra nem falta um centavo:
 * o saldo é dividido de forma que as parcelas difiram no máximo 1 centavo e somem exatamente o saldo.
 */
import { newId } from "@/lib/utils";
import { mulCents } from "@/lib/money";
import type { ContractPayment, Installment } from "@/domain/schema";
import { PAYMENT_TRIGGER_LABELS } from "@/domain/schema";
import { addDays, formatDateBR, isValidISODate } from "./dates";

/** Divide `total` em `n` partes; os centavos que sobram vão uma a uma para as primeiras parcelas. */
export function splitCents(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Entrada em centavos, a partir do percentual ou do valor digitado (limitada ao total). */
export function downPaymentCents(p: Pick<ContractPayment, "totalCents" | "downMode" | "downPercent" | "downCents">): number {
  const raw = p.downMode === "percent" ? mulCents(p.totalCents, p.downPercent / 100) : p.downCents;
  return Math.max(0, Math.min(p.totalCents, Math.round(raw)));
}

export function downPercentOf(p: Pick<ContractPayment, "totalCents" | "downCents">): number {
  return p.totalCents > 0 ? (p.downCents / p.totalCents) * 100 : 0;
}

export interface PaymentSummary {
  totalCents: number;
  downCents: number;
  balanceCents: number;
  installmentsCents: number;
  /** entrada + parcelas */
  sumCents: number;
  /** total − (entrada + parcelas). Zero = fechado. Positivo = falta; negativo = excede. */
  diffCents: number;
  balanced: boolean;
}

export function paymentSummary(p: ContractPayment): PaymentSummary {
  const installmentsCents = p.installments.reduce((a, i) => a + i.amountCents, 0);
  const sum = p.downCents + installmentsCents;
  return {
    totalCents: p.totalCents,
    downCents: p.downCents,
    balanceCents: p.totalCents - p.downCents,
    installmentsCents,
    sumCents: sum,
    diffCents: p.totalCents - sum,
    balanced: sum === p.totalCents,
  };
}

/**
 * Recalcula entrada e divide o saldo igualmente pelo número de parcelas, preservando
 * (por posição) datas e gatilhos já escolhidos. Datas novas são sugeridas de `intervalDays` em `intervalDays`
 * a partir de `baseDate`, quando informada.
 */
export function recomputePayment(p: ContractPayment, baseDate?: string | null): ContractPayment {
  const down = downPaymentCents(p);
  const balance = Math.max(0, p.totalCents - down);
  const count = p.installmentCount;
  const amounts = splitCents(balance, count);
  const base = isValidISODate(p.downDueDate) ? p.downDueDate : isValidISODate(baseDate) ? baseDate : null;

  const installments: Installment[] = amounts.map((amountCents, i) => {
    const old = p.installments[i];
    return {
      id: old?.id ?? newId(),
      amountCents,
      trigger: old?.trigger ?? "data",
      // data já escolhida é preservada; sem data (ou parcela nova), sugere uma a partir da base
      dueDate: old?.dueDate ?? (base && (!old || old.trigger === "data") ? addDays(base, p.intervalDays * (i + 1)) : null),
    };
  });
  return {
    ...p,
    downCents: down,
    downPercent: p.downMode === "percent" ? p.downPercent : downPercentOf({ totalCents: p.totalCents, downCents: down }),
    installments,
  };
}

/** Joga a diferença (positiva ou negativa) na última parcela. */
export function adjustLastInstallment(p: ContractPayment): ContractPayment {
  if (p.installments.length === 0) return p;
  const diff = paymentSummary(p).diffCents;
  const last = p.installments[p.installments.length - 1];
  const amount = last.amountCents + diff;
  if (amount < 0) return p;
  return { ...p, installments: [...p.installments.slice(0, -1), { ...last, amountCents: amount }] };
}

/** Descrição legível do vencimento: "Em 10/12/2026", "No início da fabricação (previsto: 05/01/2027)". */
export function describeDue(trigger: Installment["trigger"], dueDate: string | null): string {
  const date = isValidISODate(dueDate) ? formatDateBR(dueDate) : "";
  if (trigger === "data") return date ? `Em ${date}` : "Data a definir";
  const label = PAYMENT_TRIGGER_LABELS[trigger];
  return date ? `${label} (previsto: ${date})` : label;
}

/** O vencimento está definido de forma clara? (gatilho por evento sempre está; por data exige data válida) */
export function isDueDefined(trigger: Installment["trigger"], dueDate: string | null): boolean {
  return trigger !== "data" || isValidISODate(dueDate);
}
