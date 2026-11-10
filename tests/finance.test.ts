import { describe, expect, it } from "vitest";
import { computeEdgeBanding, edgeLengthMm, pieceTapeMm } from "@/engine/finance/edge-banding";
import {
  computeFinance,
  costItemSubtotal,
  laborCost,
  marginFromPrice,
  markupFromPrice,
  priceFromMarkup,
} from "@/engine/finance/pricing";
import { newCostItem } from "@/domain/defaults";
import { calculateProject } from "@/engine/project-calc";
import { formatBRL, formatMoneyPlain, mulCents, parseDecimal, parseMoneyToCents } from "@/lib/money";
import { mat, piece, project, tape } from "./helpers";

const zeroLabor = {
  fabrication: { mode: "fixed" as const, fixedCents: 0, hours: 0, hourlyCents: 0 },
  installation: { mode: "fixed" as const, fixedCents: 0, hours: 0, hourlyCents: 0 },
};
const noDed = { taxPercent: 0, commissionPercent: 0, overheadPercent: 0 };

function fin(overrides: Partial<Parameters<typeof computeFinance>[0]> = {}) {
  return computeFinance({
    sheetsCostCents: 0,
    tapeCostCents: 0,
    costItems: [],
    labor: zeroLabor,
    markupPercent: 0,
    manualPriceCents: null,
    deductions: noDed,
    ...overrides,
  });
}

describe("markup e margem — exemplo do enunciado", () => {
  it("custo R$ 1.000,00 com markup de 50% → venda R$ 1.500,00, lucro R$ 500,00, margem 33,33%", () => {
    const f = fin({ sheetsCostCents: 100000, markupPercent: 50 });
    expect(f.totalCostCents).toBe(100000);
    expect(f.suggestedPriceCents).toBe(150000);
    expect(f.finalPriceCents).toBe(150000);
    expect(f.grossProfitCents).toBe(50000);
    expect(f.grossMarginPercent).toBeCloseTo(33.3333, 3);
    expect(f.effectiveMarkupPercent).toBe(50);
  });

  it("markup não é margem: 100% de markup = 50% de margem", () => {
    expect(marginFromPrice(1000, priceFromMarkup(1000, 100))).toBeCloseTo(50, 8);
  });

  it("markup zero: preço = custo, lucro zero", () => {
    const f = fin({ sheetsCostCents: 123456, markupPercent: 0 });
    expect(f.suggestedPriceCents).toBe(123456);
    expect(f.grossProfitCents).toBe(0);
    expect(f.grossMarginPercent).toBe(0);
  });

  it("markup muito alto (acima de 200%) funciona: 500% → 6× o custo", () => {
    const f = fin({ sheetsCostCents: 20000, markupPercent: 500 });
    expect(f.suggestedPriceCents).toBe(120000);
    expect(f.grossMarginPercent).toBeCloseTo(83.3333, 3);
  });

  it("markup com casas decimais e arredondamento ao centavo", () => {
    // R$ 33,33 × 1,333 = 44,42889 → 44,43
    expect(priceFromMarkup(3333, 33.3)).toBe(4443);
    // R$ 0,01 × 1,5 = 0,015 → arredonda para 0,02
    expect(priceFromMarkup(1, 50)).toBe(2);
  });

  it("custo zero: sem divisão por zero", () => {
    const f = fin({ markupPercent: 50 });
    expect(f.totalCostCents).toBe(0);
    expect(f.suggestedPriceCents).toBe(0);
    expect(f.grossMarginPercent).toBe(0);
    expect(markupFromPrice(0, 1000)).toBe(0);
  });
});

describe("preço manual", () => {
  it("recalcula margem e markup efetivos", () => {
    const f = fin({ sheetsCostCents: 100000, markupPercent: 50, manualPriceCents: 130000 });
    expect(f.usingManualPrice).toBe(true);
    expect(f.finalPriceCents).toBe(130000);
    expect(f.suggestedPriceCents).toBe(150000); // sugerido permanece visível
    expect(f.grossProfitCents).toBe(30000);
    expect(f.effectiveMarkupPercent).toBeCloseTo(30, 8);
    expect(f.grossMarginPercent).toBeCloseTo(23.0769, 3);
  });
  it("preço manual abaixo do custo gera lucro negativo (sem esconder o prejuízo)", () => {
    const f = fin({ sheetsCostCents: 100000, manualPriceCents: 90000 });
    expect(f.grossProfitCents).toBe(-10000);
    expect(f.grossMarginPercent).toBeLessThan(0);
  });
});

describe("custos extras e mão de obra", () => {
  it("exemplo da tabela do enunciado", () => {
    const items = [
      newCostItem({ category: "dobradicas", description: "Dobradiças", quantity: 8, unitCents: 800 }),
      newCostItem({ category: "corredicas", description: "Corrediças", quantity: 2, unit: "par", unitCents: 3500 }),
      newCostItem({ category: "parafusos", description: "Parafusos", quantity: 1, unit: "pct", unitCents: 2000 }),
      newCostItem({ category: "cola", description: "Cola", quantity: 1, unitCents: 2500 }),
      newCostItem({ category: "frete", description: "Frete", quantity: 1, unit: "serviço", unitCents: 8000 }),
    ];
    expect(items.map(costItemSubtotal)).toEqual([6400, 7000, 2000, 2500, 8000]);
    const f = fin({ costItems: items });
    expect(f.hardwareCostCents).toBe(6400 + 7000 + 2000 + 2500);
    expect(f.freightCostCents).toBe(8000);
    expect(f.totalCostCents).toBe(6400 + 7000 + 2000 + 2500 + 8000);
  });

  it("quantidade fracionária e valor fixo", () => {
    expect(costItemSubtotal(newCostItem({ quantity: 2.5, unit: "m", unitCents: 1999 }))).toBe(4998); // 49,975 → 49,98
    expect(costItemSubtotal(newCostItem({ mode: "fixed", quantity: 99, unitCents: 12345 }))).toBe(12345);
  });

  it("mão de obra por hora = horas × valor/hora; fabricação e instalação separadas", () => {
    const l = laborCost({
      fabrication: { mode: "hourly", fixedCents: 99999, hours: 10, hourlyCents: 4550 },
      installation: { mode: "fixed", fixedCents: 30000, hours: 8, hourlyCents: 5000 },
    });
    expect(l.fabrication).toBe(45500);
    expect(l.installation).toBe(30000);
    expect(l.total).toBe(75500);
  });

  it("mão de obra entra no custo ANTES do markup", () => {
    const f = fin({
      sheetsCostCents: 50000,
      labor: { ...zeroLabor, fabrication: { mode: "fixed", fixedCents: 50000, hours: 0, hourlyCents: 0 } },
      markupPercent: 50,
    });
    expect(f.totalCostCents).toBe(100000);
    expect(f.suggestedPriceCents).toBe(150000);
  });

  it("valores com centavos não acumulam erro de ponto flutuante", () => {
    // 3 × R$ 0,10 não pode virar 0,30000000000000004
    expect(costItemSubtotal(newCostItem({ quantity: 3, unitCents: 10 }))).toBe(30);
    expect(mulCents(1005, 1.1)).toBe(1106); // 1105,5 → arredonda para cima
  });
});

describe("impostos, comissões e despesas indiretas", () => {
  it("avisa o que ainda não foi cadastrado", () => {
    const f = fin({ sheetsCostCents: 100000, markupPercent: 50 });
    expect(f.missingDeductions).toEqual(["imposto", "comissão", "despesas indiretas"]);
    expect(f.deductionsCents).toBe(0);
  });
  it("com deduções cadastradas, mostra lucro após deduções sem chamá-lo de líquido", () => {
    const f = fin({
      sheetsCostCents: 100000,
      markupPercent: 50,
      deductions: { taxPercent: 6, commissionPercent: 5, overheadPercent: 4 },
    });
    expect(f.missingDeductions).toEqual([]);
    expect(f.deductionsCents).toBe(22500); // 15% de 1.500,00
    expect(f.profitAfterDeductionsCents).toBe(50000 - 22500);
    expect(f.grossProfitCents).toBe(50000); // lucro bruto não é alterado
  });
});

describe("fita de borda", () => {
  it("convenção: superior/inferior medem o comprimento; esquerda/direita medem a largura", () => {
    const p = piece("m", 1800, 600);
    expect(edgeLengthMm(p, "top")).toBe(1800);
    expect(edgeLengthMm(p, "bottom")).toBe(1800);
    expect(edgeLengthMm(p, "left")).toBe(600);
    expect(edgeLengthMm(p, "right")).toBe(600);
  });

  it("exemplo do enunciado: 600 × 1800 com fita só na borda de 1800 mm", () => {
    const t = tape();
    const p = piece("m", 1800, 600, { edges: { top: t.id, bottom: null, left: null, right: null } });
    expect(pieceTapeMm(p)).toBe(1800);
    const r = computeEdgeBanding([p], [t]);
    expect(r.usages[0].netMm).toBe(1800);
  });

  it("não usa 'número de lados × perímetro': lados diferentes têm comprimentos diferentes", () => {
    const t = tape();
    const p = piece("m", 1800, 600, { edges: { top: t.id, bottom: null, left: t.id, right: null } });
    expect(pieceTapeMm(p)).toBe(1800 + 600);
  });

  it("quantidade multiplica; sem bordas marcadas = zero fita", () => {
    const t = tape();
    const a = piece("m", 1000, 500, { quantity: 4, edges: { top: t.id, bottom: t.id, left: null, right: null } });
    const b = piece("m", 1000, 500, { quantity: 10 });
    const r = computeEdgeBanding([a, b], [t]);
    expect(r.usages).toHaveLength(1);
    expect(r.usages[0].netMm).toBe(4 * 2 * 1000);
  });

  it("exemplo: fita branca 12,5 m × R$ 2,50 = R$ 31,25 e amadeirada 8,2 m × R$ 4,00 = R$ 32,80", () => {
    const branca = tape({ name: "Branca", pricePerMeterCents: 250, wastePercent: 0 });
    const amad = tape({ name: "Amadeirada", pricePerMeterCents: 400, wastePercent: 0 });
    const pcs = [
      piece("m", 2500, 100, { quantity: 5, edges: { top: branca.id, bottom: null, left: null, right: null } }), // 12,5 m
      piece("m", 1640, 100, { quantity: 5, edges: { top: amad.id, bottom: null, left: null, right: null } }), // 8,2 m
    ];
    const r = computeEdgeBanding(pcs, [branca, amad]);
    const b = r.usages.find((u) => u.tapeId === branca.id)!;
    const a = r.usages.find((u) => u.tapeId === amad.id)!;
    expect(b.meters).toBeCloseTo(12.5, 8);
    expect(b.costCents).toBe(3125);
    expect(a.meters).toBeCloseTo(8.2, 8);
    expect(a.costCents).toBe(3280);
    expect(r.totalCostCents).toBe(3125 + 3280);
  });

  it("percentual de perda individual por fita", () => {
    const t = tape({ wastePercent: 10, pricePerMeterCents: 250 });
    const p = piece("m", 2000, 100, { quantity: 5, edges: { top: t.id, bottom: null, left: null, right: null } }); // 10 m
    const u = computeEdgeBanding([p], [t]).usages[0];
    expect(u.netMm).toBe(10000);
    expect(u.meters).toBeCloseTo(11, 8);
    expect(u.costCents).toBe(2750);
  });

  it("bordas com fita removida do orçamento são sinalizadas", () => {
    const p = piece("m", 1000, 500, { edges: { top: "sumiu", bottom: null, left: null, right: null } });
    const r = computeEdgeBanding([p], []);
    expect(r.missingTapeIds).toEqual(["sumiu"]);
  });
});

describe("cálculo integrado do projeto", () => {
  it("MDF e fita vêm dos motores, sem duplicidade nos custos extras", () => {
    const m = mat({ priceCents: 32000 });
    const t = tape({ wastePercent: 0, pricePerMeterCents: 250 });
    const pcs = [
      piece(m.id, 1800, 600, { edges: { top: t.id, bottom: null, left: null, right: null } }),
      piece(m.id, 800, 450, { quantity: 4 }),
    ];
    const prj = project({
      materials: [m],
      tapes: [t],
      pieces: pcs,
      markupPercent: 50,
      costItems: [newCostItem({ category: "dobradicas", description: "Dobradiças", quantity: 8, unitCents: 800 })],
    });
    const c = calculateProject(prj);
    expect(c.cut.materials[0].sheetsToBuy).toBe(1);
    expect(c.sheetsCostCents).toBe(32000);
    expect(c.tape.totalCostCents).toBe(Math.round(1.8 * 250));
    expect(c.finance.totalCostCents).toBe(32000 + 450 + 6400);
    expect(c.reliable).toBe(true);
    expect(c.finance.suggestedPriceCents).toBe(Math.round((32000 + 450 + 6400) * 1.5));
  });

  it("editar peças atualiza chapas, custo e preço automaticamente", () => {
    const m = mat({ priceCents: 32000 });
    const small = project({ materials: [m], pieces: [piece(m.id, 800, 450, { quantity: 4 })], markupPercent: 100 });
    const big = { ...small, pieces: [piece(m.id, 800, 450, { quantity: 60 })] };
    const a = calculateProject(small);
    const b = calculateProject(big);
    expect(b.cut.totalSheetsToBuy).toBeGreaterThan(a.cut.totalSheetsToBuy);
    expect(b.finance.totalCostCents).toBeGreaterThan(a.finance.totalCostCents);
    expect(b.finance.finalPriceCents).toBe(b.finance.totalCostCents * 2);
  });

  it("se há peça que não cabe, o orçamento é marcado como não confiável", () => {
    const m = mat();
    const prj = project({ materials: [m], pieces: [piece(m.id, 5000, 500)] });
    const c = calculateProject(prj);
    expect(c.reliable).toBe(false);
    expect(c.issues.some((i) => i.level === "error")).toBe(true);
    expect(c.cut.totalSheetsToBuy).toBe(0);
  });

  it("reserva extra altera o custo das chapas", () => {
    const m = mat({ priceCents: 30000 });
    const base = project({ materials: [m], pieces: [piece(m.id, 800, 450, { quantity: 4 })] });
    const withReserve = { ...base, reserve: { mode: "sheets" as const, value: 1 } };
    expect(calculateProject(withReserve).sheetsCostCents).toBe(calculateProject(base).sheetsCostCents + 30000);
  });
});

describe("formatação e leitura de números (pt-BR)", () => {
  it("formata em reais", () => {
    expect(formatBRL(150000).replace(/\s/g, " ")).toBe("R$ 1.500,00");
    expect(formatBRL(5).replace(/\s/g, " ")).toBe("R$ 0,05");
    expect(formatMoneyPlain(123456)).toBe("1.234,56");
  });
  it("interpreta entradas comuns", () => {
    expect(parseDecimal("1.234,56")).toBe(1234.56);
    expect(parseDecimal("1234,5")).toBe(1234.5);
    expect(parseDecimal("12.5")).toBe(12.5);
    expect(parseDecimal("1.500")).toBe(1500);
    expect(parseDecimal("0,99")).toBe(0.99);
    expect(parseDecimal("R$ 320,00")).toBe(320);
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("1,2,3")).toBeNull();
  });
  it("converte reais para centavos sem erro de arredondamento", () => {
    expect(parseMoneyToCents("19,99")).toBe(1999);
    expect(parseMoneyToCents("1,005")).toBe(101); // 1,005 → 100,5 → arredonda
    expect(parseMoneyToCents("320")).toBe(32000);
    expect(parseMoneyToCents("0,29")).toBe(29); // 0.29*100 = 28.999999999999996
  });
});
