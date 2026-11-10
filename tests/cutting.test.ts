import { describe, expect, it } from "vitest";
import { applyReserve, planMaterial, planProjectCutting } from "@/engine/cutting/plan";
import { isGuillotineCuttable, validateMaterialResult } from "@/engine/cutting/validate";
import type { Placement } from "@/engine/cutting/types";
import type { Reserve } from "@/domain/schema";
import { mat, piece, rng } from "./helpers";

const rules = { minShortMm: 300, minLongMm: 600 };
const noReserve: Reserve = { mode: "none", value: 0 };

function plan(m = mat(), pieces = [piece(m.id, 600, 400)], reserve = noReserve) {
  const r = planMaterial(m, pieces, reserve, rules);
  return { r, violations: validateMaterialResult(r, pieces) };
}

describe("plano de corte — casos básicos", () => {
  it("uma peça pequena usa exatamente 1 chapa e o plano é válido", () => {
    const m = mat();
    const { r, violations } = plan(m, [piece(m.id, 600, 400)]);
    expect(r.status).toBe("ok");
    expect(r.sheetsUsed).toBe(1);
    expect(r.sheetsToBuy).toBe(1);
    expect(r.provenOptimal).toBe(true);
    expect(violations).toEqual([]);
  });

  it("sem peças não inventa chapas", () => {
    const m = mat();
    const r = planMaterial(m, [], noReserve, rules);
    expect(r.status).toBe("empty");
    expect(r.sheetsUsed).toBe(0);
    expect(r.sheetsToBuy).toBe(0);
  });

  it("peças com medidas diferentes: tudo posicionado, sem sobreposição", () => {
    const m = mat();
    const pieces = [
      piece(m.id, 1800, 600, { quantity: 2 }),
      piece(m.id, 800, 450, { quantity: 6 }),
      piece(m.id, 500, 300, { quantity: 4 }),
      piece(m.id, 2000, 400),
    ];
    const { r, violations } = plan(m, pieces);
    expect(violations).toEqual([]);
    expect(r.unplaceable).toEqual([]);
    const placed = r.sheets.flatMap((s) => s.placements).length;
    expect(placed).toBe(2 + 6 + 4 + 1);
  });

  it("peças iguais e repetidas: nunca usa menos chapas que o limite por área", () => {
    const m = mat();
    const pieces = [piece(m.id, 700, 500, { quantity: 40 })];
    const { r, violations } = plan(m, pieces);
    expect(violations).toEqual([]);
    expect(r.sheetsUsed).toBeGreaterThanOrEqual(r.lowerBoundSheets);
    // 40 × 0,35 m² = 14 m² → pelo menos 3 chapas (área útil ≈ 4,99 m²)
    expect(r.lowerBoundSheets).toBe(3);
    expect(r.sheetsUsed).toBeLessThanOrEqual(4);
  });

  it("empacota bem um caso perfeito: 8 peças iguais em 1 chapa", () => {
    const m = mat({ kerfMm: 0, marginMm: 0, lengthMm: 2400, widthMm: 1200 });
    const pieces = [piece(m.id, 600, 600, { quantity: 8 })];
    const { r, violations } = plan(m, pieces);
    expect(violations).toEqual([]);
    expect(r.sheetsUsed).toBe(1);
    expect(r.metrics.utilizationPercent).toBeCloseTo(100, 5);
  });
});

describe("espessura da serra e margens", () => {
  const two = (m: ReturnType<typeof mat>) => [
    piece(m.id, 1360, 1820, { allowRotation: false }),
    piece(m.id, 1360, 1820, { allowRotation: false }),
  ];

  it("kerf pequeno permite 2 peças lado a lado (1360+3+1360 ≤ 2730)", () => {
    const m = mat({ kerfMm: 3 });
    const { r, violations } = plan(m, two(m));
    expect(violations).toEqual([]);
    expect(r.sheetsUsed).toBe(1);
  });

  it("kerf maior empurra a segunda peça para outra chapa (1360+11+1360 > 2730)", () => {
    const m = mat({ kerfMm: 11 });
    const { r, violations } = plan(m, two(m));
    expect(violations).toEqual([]);
    expect(r.sheetsUsed).toBe(2);
  });

  it("margem maior reduz a área útil e pode gerar peça que não cabe", () => {
    const m = mat({ marginMm: 40 }); // útil: 2670 × 1770
    const p = piece(m.id, 2700, 500);
    const r = planMaterial(m, [p], noReserve, rules);
    expect(r.status).toBe("incomplete");
    expect(r.sheetsUsed).toBe(0);
    expect(r.unplaceable[0].reason).toMatch(/não cabe/);
  });

  it("toda peça respeita a margem de segurança", () => {
    const m = mat({ marginMm: 25 });
    const { r } = plan(m, [piece(m.id, 500, 500, { quantity: 20 })]);
    for (const s of r.sheets) {
      for (const p of s.placements) {
        expect(p.x).toBeGreaterThanOrEqual(25);
        expect(p.y).toBeGreaterThanOrEqual(25);
        expect(p.x + p.w).toBeLessThanOrEqual(m.lengthMm - 25);
        expect(p.y + p.h).toBeLessThanOrEqual(m.widthMm - 25);
      }
    }
  });
});

describe("peças que não cabem, rotação e veios", () => {
  it("peça maior que a chapa: aparece em 'não cabem' e não conta chapa fictícia", () => {
    const m = mat();
    const big = piece(m.id, 3000, 2000);
    const { r } = plan(m, [big]);
    expect(r.status).toBe("incomplete");
    expect(r.sheetsUsed).toBe(0);
    expect(r.sheetsToBuy).toBe(0);
    expect(r.unplaceable).toHaveLength(1);
    expect(r.unplaceable[0].quantity).toBe(1);
  });

  it("peça grande + peças pequenas: pequenas são posicionadas, grande é listada", () => {
    const m = mat();
    const pieces = [piece(m.id, 3000, 500, { quantity: 2 }), piece(m.id, 500, 500, { quantity: 3 })];
    const { r, violations } = plan(m, pieces);
    expect(violations).toEqual([]);
    expect(r.status).toBe("incomplete");
    expect(r.unplaceable[0].quantity).toBe(2);
    expect(r.sheets.flatMap((s) => s.placements)).toHaveLength(3);
  });

  it("rotação: peça 1000×2500 só cabe girada", () => {
    const m = mat();
    const ok = piece(m.id, 1000, 2500, { allowRotation: true });
    const r1 = planMaterial(m, [ok], noReserve, rules);
    expect(r1.status).toBe("ok");
    expect(r1.sheets[0].placements[0].rotated).toBe(true);

    const noRot = piece(m.id, 1000, 2500, { allowRotation: false });
    const r2 = planMaterial(m, [noRot], noReserve, rules);
    expect(r2.status).toBe("incomplete");
  });

  it("rotação proibida na peça: nenhuma posição vem girada", () => {
    const m = mat();
    const pieces = [piece(m.id, 900, 400, { quantity: 15, allowRotation: false })];
    const { r, violations } = plan(m, pieces);
    expect(violations).toEqual([]);
    expect(r.sheets.flatMap((s) => s.placements).every((p) => !p.rotated)).toBe(true);
  });

  it("material com veio obrigatório: nunca gira, mesmo se a peça permitir", () => {
    const m = mat({ grainRequired: true });
    const pieces = [piece(m.id, 900, 400, { quantity: 15, allowRotation: true })];
    const { r, violations } = plan(m, pieces);
    expect(violations).toEqual([]);
    expect(r.sheets.flatMap((s) => s.placements).every((p) => !p.rotated)).toBe(true);
  });

  it("material com veio: peça que só caberia girada vira 'não cabe'", () => {
    const m = mat({ grainRequired: true });
    const r = planMaterial(m, [piece(m.id, 1000, 2500, { allowRotation: true })], noReserve, rules);
    expect(r.status).toBe("incomplete");
    expect(r.unplaceable[0].reason).toMatch(/veio/);
  });

  it("medidas inválidas nunca entram no plano", () => {
    const m = mat();
    const r = planMaterial(m, [piece(m.id, 0, 500), piece(m.id, 500, -3)], noReserve, rules);
    expect(r.sheetsUsed).toBe(0);
    expect(r.unplaceable).toHaveLength(2);
  });
});

describe("reserva extra", () => {
  it("percentual arredonda para cima", () => {
    expect(applyReserve(3, { mode: "percent", value: 10 })).toBe(4); // 3,3 → 4
    expect(applyReserve(5, { mode: "percent", value: 20 })).toBe(6); // 6,0 → 6
    expect(applyReserve(1, { mode: "percent", value: 5 })).toBe(2);
  });
  it("não se perde em erro de ponto flutuante (10 × 1,10 = 11, não 12)", () => {
    expect(applyReserve(10, { mode: "percent", value: 10 })).toBe(11);
    expect(applyReserve(3, { mode: "percent", value: 0 })).toBe(3);
  });
  it("quantidade fixa de chapas, também arredondada para cima", () => {
    expect(applyReserve(3, { mode: "sheets", value: 1 })).toBe(4);
    expect(applyReserve(3, { mode: "sheets", value: 0.2 })).toBe(4);
  });
  it("sem chapas usadas, não compra reserva", () => {
    expect(applyReserve(0, { mode: "sheets", value: 2 })).toBe(0);
  });
  it("planMaterial aplica a reserva em sheetsToBuy e informa as extras", () => {
    const m = mat();
    const { r } = plan(m, [piece(m.id, 700, 500, { quantity: 40 })], { mode: "percent", value: 10 });
    expect(r.sheetsToBuy).toBe(applyReserve(r.sheetsUsed, { mode: "percent", value: 10 }));
    expect(r.reserveSheets).toBe(r.sheetsToBuy - r.sheetsUsed);
  });
});

describe("vários materiais", () => {
  it("cada material tem seu próprio plano e custo de chapas", () => {
    const m15 = mat({ name: "Branco 15", thicknessMm: 15, priceCents: 32000 });
    const m18 = mat({ name: "Amadeirado 18", thicknessMm: 18, priceCents: 41000 });
    const m6 = mat({ name: "Fundo 6", thicknessMm: 6, priceCents: 15000 });
    const pieces = [
      piece(m15.id, 1000, 500, { quantity: 30 }),
      piece(m18.id, 2000, 600, { quantity: 4 }),
      piece(m6.id, 1000, 900, { quantity: 2 }),
    ];
    const res = planProjectCutting([m15, m18, m6], pieces, noReserve, rules);
    expect(res.materials).toHaveLength(3);
    expect(res.complete).toBe(true);
    const by = (id: string) => res.materials.find((x) => x.materialId === id)!;
    expect(by(m6.id).sheetsUsed).toBe(1);
    expect(by(m15.id).sheetsUsed).toBeGreaterThan(by(m18.id).sheetsUsed - 1);
    expect(res.totalSheetsToBuy).toBe(res.materials.reduce((a, r) => a + r.sheetsToBuy, 0));
    // cada peça só aparece no plano do seu material
    for (const r of res.materials) {
      const ids = new Set(pieces.filter((p) => p.materialId === r.materialId).map((p) => p.id));
      for (const s of r.sheets) for (const pl of s.placements) expect(ids.has(pl.pieceId)).toBe(true);
    }
  });

  it("peça apontando para material inexistente gera erro, não chapas fictícias", () => {
    const m = mat();
    const res = planProjectCutting([m], [piece("nao-existe", 500, 500)], noReserve, rules);
    expect(res.complete).toBe(false);
    expect(res.orphanPieces).toHaveLength(1);
    expect(res.totalSheetsToBuy).toBe(0);
  });
});

describe("métricas de aproveitamento e sobras", () => {
  it("o balanço de áreas fecha: peças + sobras + serra + refilo = chapas", () => {
    const m = mat();
    const { r } = plan(m, [piece(m.id, 800, 450, { quantity: 13 }), piece(m.id, 1200, 300, { quantity: 5 })]);
    const mt = r.metrics;
    const sum =
      mt.piecesAreaMm2 + mt.reusableRemnantAreaMm2 + mt.nonReusableAreaMm2 + mt.kerfAreaMm2 + mt.marginAreaMm2;
    expect(sum).toBeCloseTo(mt.sheetsAreaMm2, 3);
    expect(mt.utilizationPercent).toBeGreaterThan(0);
    expect(mt.utilizationPercent).toBeLessThanOrEqual(100);
    expect(mt.unusedAreaMm2).toBeCloseTo(mt.sheetsAreaMm2 - mt.piecesAreaMm2, 3);
  });

  it("a área das peças é a soma de largura × comprimento × quantidade", () => {
    const m = mat();
    const { r } = plan(m, [piece(m.id, 800, 450, { quantity: 3 })]);
    expect(r.metrics.piecesAreaMm2).toBe(800 * 450 * 3);
  });

  it("uma peça pequena deixa sobra grande classificada como reaproveitável", () => {
    const m = mat();
    const { r } = plan(m, [piece(m.id, 600, 400)]);
    expect(r.metrics.reusableRemnantAreaMm2).toBeGreaterThan(3_000_000);
    expect(r.sheets[0].freeRegions.some((f) => f.reusable)).toBe(true);
  });

  it("dimensões mínimas configuráveis mudam a classificação das sobras", () => {
    const m = mat();
    const pieces = [piece(m.id, 600, 400)];
    const strict = planMaterial(m, pieces, noReserve, { minShortMm: 5000, minLongMm: 5000 });
    expect(strict.metrics.reusableRemnantAreaMm2).toBe(0);
    expect(strict.metrics.nonReusableAreaMm2).toBeGreaterThan(0);
  });
});

describe("validação geométrica independente", () => {
  const base: Placement = { pieceId: "a", instance: 0, ref: "", description: "A", x: 10, y: 10, w: 500, h: 500, rotated: false };

  it("detecta sobreposição", () => {
    const m = mat();
    const pcs = [piece(m.id, 500, 500, { id: "a", quantity: 2 })];
    const r = planMaterial(m, pcs, noReserve, rules);
    r.sheets[0].placements = [base, { ...base, instance: 1, x: 300, y: 300 }];
    const v = validateMaterialResult(r, pcs);
    expect(v.some((x) => /sobrep/.test(x.message))).toBe(true);
  });

  it("detecta peça fora da área útil e dentro da margem", () => {
    const m = mat();
    const pcs = [piece(m.id, 500, 500, { id: "a" })];
    const r = planMaterial(m, pcs, noReserve, rules);
    r.sheets[0].placements = [{ ...base, x: 5 }];
    expect(validateMaterialResult(r, pcs).some((x) => /margem/.test(x.message))).toBe(true);
    r.sheets[0].placements = [{ ...base, x: 2500 }];
    expect(validateMaterialResult(r, pcs).some((x) => /ultrapassa/.test(x.message))).toBe(true);
  });

  it("detecta peças coladas sem folga para a serra", () => {
    const m = mat({ kerfMm: 3 });
    const pcs = [piece(m.id, 500, 500, { id: "a", quantity: 2 })];
    const r = planMaterial(m, pcs, noReserve, rules);
    r.sheets[0].placements = [base, { ...base, instance: 1, x: 510 }]; // encostadas, folga 0
    expect(validateMaterialResult(r, pcs).some((x) => /serra/.test(x.message))).toBe(true);
  });

  it("padrão em catavento (pinwheel) não é guilhotinável", () => {
    const pinwheel: Placement[] = [
      { ...base, pieceId: "1", x: 0, y: 0, w: 200, h: 100 },
      { ...base, pieceId: "2", x: 200, y: 0, w: 100, h: 200 },
      { ...base, pieceId: "3", x: 100, y: 200, w: 200, h: 100 },
      { ...base, pieceId: "4", x: 0, y: 100, w: 100, h: 200 },
      { ...base, pieceId: "5", x: 100, y: 100, w: 100, h: 100 },
    ];
    expect(isGuillotineCuttable(pinwheel)).toBe(false);
  });

  it("grade 2×2 é guilhotinável", () => {
    const grid: Placement[] = [
      { ...base, pieceId: "1", x: 0, y: 0, w: 100, h: 100 },
      { ...base, pieceId: "2", x: 100, y: 0, w: 100, h: 100 },
      { ...base, pieceId: "3", x: 0, y: 100, w: 100, h: 100 },
      { ...base, pieceId: "4", x: 100, y: 100, w: 100, h: 100 },
    ];
    expect(isGuillotineCuttable(grid)).toBe(true);
  });
});

describe("fuzz: 300 projetos aleatórios sempre geram planos válidos", () => {
  it("nenhuma violação geométrica, contagem consistente e limite por área respeitado", () => {
    const rand = rng(20260101);
    for (let n = 0; n < 300; n++) {
      const m = mat({
        lengthMm: 2000 + Math.floor(rand() * 1000),
        widthMm: 1200 + Math.floor(rand() * 800),
        marginMm: Math.floor(rand() * 20),
        kerfMm: Math.floor(rand() * 6),
        grainRequired: rand() < 0.3,
      });
      const count = 1 + Math.floor(rand() * 12);
      const pieces = Array.from({ length: count }, () =>
        piece(m.id, 80 + Math.floor(rand() * 1800), 60 + Math.floor(rand() * 900), {
          quantity: 1 + Math.floor(rand() * 8),
          allowRotation: rand() < 0.7,
        }),
      );
      const r = planMaterial(m, pieces, noReserve, rules);
      const v = validateMaterialResult(r, pieces);
      expect(v, `cenário ${n}: ${JSON.stringify(v)}`).toEqual([]);
      if (r.sheetsUsed > 0) expect(r.sheetsUsed).toBeGreaterThanOrEqual(r.lowerBoundSheets);
    }
  });
});

describe("determinismo", () => {
  it("mesma entrada → mesmo plano", () => {
    const m = mat();
    const pieces = [piece(m.id, 800, 450, { quantity: 9 }), piece(m.id, 1500, 350, { quantity: 4 })];
    const a = planMaterial(m, pieces, noReserve, rules);
    const b = planMaterial(m, pieces, noReserve, rules);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
