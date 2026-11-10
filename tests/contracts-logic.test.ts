import { describe, expect, it } from "vitest";
import { documentStatus, formatDocument, isValidCnpj, isValidCpf } from "@/contracts/validators";
import { intToWordsPt, moneyToWordsPt } from "@/contracts/words";
import { addBusinessDays, addDays, addLeadTime, formatDateBR, formatDateLongBR, isBusinessDay, isValidISODate, nextBusinessDay } from "@/contracts/dates";
import {
  adjustLastInstallment,
  describeDue,
  downPaymentCents,
  isDueDefined,
  paymentSummary,
  recomputePayment,
  splitCents,
} from "@/contracts/payment";
import { contractContentSchema, contractPaymentSchema } from "@/domain/schema";

describe("CPF / CNPJ", () => {
  it("valida dígitos verificadores", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
  });
  it("não bloqueia cadastros incompletos: vazio e parcial são estados válidos de preenchimento", () => {
    expect(documentStatus("")).toBe("empty");
    expect(documentStatus("529.98")).toBe("incomplete");
    expect(documentStatus("529.982.247-25")).toBe("valid");
    expect(documentStatus("529.982.247-26")).toBe("invalid");
    expect(documentStatus("11222333000181")).toBe("valid");
  });
  it("formata com máscara quando completo", () => {
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatDocument("529")).toBe("529");
  });
});

describe("valor por extenso", () => {
  it("exemplos do enunciado e casos limite", () => {
    expect(moneyToWordsPt(500000)).toBe("cinco mil reais");
    expect(moneyToWordsPt(200000)).toBe("dois mil reais");
    expect(moneyToWordsPt(150000)).toBe("mil e quinhentos reais");
    expect(moneyToWordsPt(125050)).toBe("mil, duzentos e cinquenta reais e cinquenta centavos");
    expect(moneyToWordsPt(100)).toBe("um real");
    expect(moneyToWordsPt(1)).toBe("um centavo");
    expect(moneyToWordsPt(50)).toBe("cinquenta centavos");
    expect(moneyToWordsPt(0)).toBe("zero real");
    expect(moneyToWordsPt(10000)).toBe("cem reais");
    expect(moneyToWordsPt(10100)).toBe("cento e um reais");
    expect(moneyToWordsPt(100000000)).toBe("um milhão de reais");
    expect(moneyToWordsPt(250000000)).toBe("dois milhões e quinhentos mil reais");
    expect(moneyToWordsPt(199)).toBe("um real e noventa e nove centavos");
  });
  it("números: 1001, 21, 2000000, 1234567", () => {
    expect(intToWordsPt(1001)).toBe("mil e um");
    expect(intToWordsPt(21)).toBe("vinte e um");
    expect(intToWordsPt(2000000)).toBe("dois milhões");
    expect(intToWordsPt(1234567)).toBe("um milhão, duzentos e trinta e quatro mil, quinhentos e sessenta e sete");
    expect(() => intToWordsPt(-1)).toThrow();
  });
});

describe("datas e dias úteis", () => {
  it("valida e formata", () => {
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("2026-12-01")).toBe(true);
    expect(formatDateBR("2026-12-01")).toBe("01/12/2026");
    expect(formatDateLongBR("2026-11-10")).toBe("10 de novembro de 2026");
  });
  it("dias corridos atravessam meses e anos", () => {
    expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
    expect(addLeadTime("2026-12-01", 30, "corridos")).toBe("2026-12-31");
  });
  it("dias úteis pulam fins de semana", () => {
    // 2026-12-04 é sexta-feira
    expect(isBusinessDay("2026-12-04", new Set())).toBe(true);
    expect(addBusinessDays("2026-12-04", 1)).toBe("2026-12-07"); // segunda
    expect(addBusinessDays("2026-12-01", 5)).toBe("2026-12-08"); // terça → terça seguinte
    expect(addBusinessDays("2026-12-01", 0)).toBe("2026-12-01");
  });
  it("feriados configuráveis são ignorados na contagem", () => {
    const h = new Set(["2026-12-08"]);
    expect(addBusinessDays("2026-12-01", 5, h)).toBe("2026-12-09");
    expect(nextBusinessDay("2026-12-05", h)).toBe("2026-12-07");
    expect(nextBusinessDay("2026-12-08", h)).toBe("2026-12-09");
    expect(addLeadTime("2026-12-01", 30, "uteis", h)).toBe(addBusinessDays("2026-12-01", 30, h));
  });
});

describe("entrada e parcelas", () => {
  const base = (over = {}) => contractPaymentSchema.parse({ totalCents: 500000, downMode: "percent", downPercent: 40, installmentCount: 2, ...over });

  it("exemplo do enunciado: R$ 5.000, entrada 40% = R$ 2.000, 2 × R$ 1.500", () => {
    const p = recomputePayment(base());
    expect(p.downCents).toBe(200000);
    expect(p.installments.map((i) => i.amountCents)).toEqual([150000, 150000]);
    expect(paymentSummary(p)).toMatchObject({ balanceCents: 300000, sumCents: 500000, diffCents: 0, balanced: true });
  });

  it("entrada em reais: percentual derivado", () => {
    const p = recomputePayment(base({ downMode: "amount", downCents: 125000 }));
    expect(p.downCents).toBe(125000);
    expect(p.downPercent).toBeCloseTo(25, 8);
  });

  it("arredondamento de centavos: nunca sobra nem falta um centavo", () => {
    for (const total of [100000, 100001, 99999, 1, 333333, 1234567, 10000]) {
      for (const n of [1, 2, 3, 4, 7, 12]) {
        for (const pct of [0, 10, 33.33, 40, 100]) {
          const p = recomputePayment(contractPaymentSchema.parse({ totalCents: total, downPercent: pct, installmentCount: n }));
          const s = paymentSummary(p);
          expect(s.diffCents, `${total}/${n}/${pct}`).toBe(0);
          const amounts = p.installments.map((i) => i.amountCents);
          expect(Math.max(...amounts) - Math.min(...amounts)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("R$ 1.000,00 em 3 parcelas: 333,34 + 333,33 + 333,33", () => {
    expect(splitCents(100000, 3)).toEqual([33334, 33333, 33333]);
    expect(splitCents(0, 3)).toEqual([0, 0, 0]);
    expect(splitCents(100, 0)).toEqual([]);
  });

  it("entrada nunca passa do total", () => {
    expect(downPaymentCents(base({ downMode: "amount", downCents: 900000 }))).toBe(500000);
    const p = recomputePayment(base({ downMode: "amount", downCents: 900000 }));
    expect(p.installments.every((i) => i.amountCents === 0)).toBe(true);
  });

  it("alterar o total recalcula; editar parcela gera diferença detectável e corrigível", () => {
    let p = recomputePayment(base());
    p = { ...p, installments: [{ ...p.installments[0], amountCents: 100000 }, p.installments[1]] };
    expect(paymentSummary(p).diffCents).toBe(50000);
    expect(paymentSummary(p).balanced).toBe(false);
    p = adjustLastInstallment(p);
    expect(paymentSummary(p).balanced).toBe(true);
    expect(p.installments[1].amountCents).toBe(200000);
    // muda o valor negociado → recalcula tudo
    const p2 = recomputePayment({ ...p, totalCents: 800000 });
    expect(paymentSummary(p2).balanced).toBe(true);
    expect(p2.downCents).toBe(320000);
  });

  it("preserva datas e gatilhos já escolhidos e sugere datas novas", () => {
    let p = recomputePayment(base(), "2026-12-01");
    expect(p.installments.map((i) => i.dueDate)).toEqual(["2096-12-31".replace("2096", "2026"), "2027-01-30"]);
    p = { ...p, installments: [{ ...p.installments[0], trigger: "entrega", dueDate: null }, p.installments[1]] };
    const q = recomputePayment({ ...p, installmentCount: 3 });
    expect(q.installments[0].trigger).toBe("entrega");
    expect(q.installments).toHaveLength(3);
  });

  it("vencimento claro: por data exige data; por evento sempre é claro", () => {
    expect(isDueDefined("data", null)).toBe(false);
    expect(isDueDefined("data", "2026-12-31")).toBe(true);
    expect(isDueDefined("entrega", null)).toBe(true);
    expect(describeDue("data", "2026-12-31")).toBe("Em 31/12/2026");
    expect(describeDue("conclusao_instalacao", null)).toBe("Na conclusão da instalação");
    expect(describeDue("inicio_fabricacao", "2027-01-05")).toBe("No início da fabricação (previsto: 05/01/2027)");
  });

  it("o esquema aceita contrato vazio (defaults) sem lançar", () => {
    expect(() => contractContentSchema.parse({})).not.toThrow();
  });
});
