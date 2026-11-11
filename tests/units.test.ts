import { describe, expect, it } from "vitest";
import { MM_PER_CM, cmToMm, formatCm, formatCmPair, formatCmUnit, mmToCm, parseCmToMm } from "@/lib/units";

describe("conversão cm ↔ mm (módulo central)", () => {
  it("1 cm = 10 mm", () => {
    expect(MM_PER_CM).toBe(10);
    expect(cmToMm(1)).toBe(10);
    expect(mmToCm(10)).toBe(1);
  });

  it("exemplos do enunciado: 60 cm → 600 mm; 60,5 cm → 605 mm; 1,5 cm → 15 mm; 180 → 1800; 275 → 2750; 185 → 1850", () => {
    expect(cmToMm(60)).toBe(600);
    expect(cmToMm(60.5)).toBe(605);
    expect(cmToMm(1.5)).toBe(15);
    expect(cmToMm(180)).toBe(1800);
    expect(cmToMm(275)).toBe(2750);
    expect(cmToMm(185)).toBe(1850);
  });

  it("sentido inverso: dados antigos em mm aparecem em cm", () => {
    expect(mmToCm(600)).toBe(60);
    expect(mmToCm(1800)).toBe(180);
    expect(mmToCm(2750)).toBe(275);
    expect(mmToCm(1850)).toBe(185);
    expect(mmToCm(15)).toBe(1.5);
    expect(mmToCm(605)).toBe(60.5);
  });

  it("sem ruído de ponto flutuante (1,1 cm = 11 mm exatos)", () => {
    expect(cmToMm(1.1)).toBe(11);
    expect(cmToMm(33.3)).toBe(333);
    expect(cmToMm(0.7)).toBe(7);
    expect(cmToMm(2.3)).toBe(23);
    expect(mmToCm(11)).toBe(1.1);
    expect(cmToMm(0.05)).toBe(0.5);
  });

  it("ida e volta é exata para todo milímetro inteiro e meio milímetro de 0 a 5.000 mm (nada é arredondado)", () => {
    for (let mm = 0; mm <= 5000; mm += 0.5) {
      expect(cmToMm(mmToCm(mm)), `${mm} mm`).toBe(mm);
    }
  });

  it("ida e volta também para décimos de mm e centésimos de cm digitados", () => {
    for (let mm = 0.1; mm < 3000; mm += 7.3) {
      const m = Math.round(mm * 10) / 10;
      expect(cmToMm(mmToCm(m))).toBe(m);
    }
    for (let i = 1; i <= 3000; i += 7) {
      const cm = i / 100; // 0,01 … 30,00 cm
      expect(mmToCm(cmToMm(cm))).toBe(cm);
    }
  });

  it("aceita vírgula e ponto como separador decimal", () => {
    expect(parseCmToMm("60")).toBe(600);
    expect(parseCmToMm("60,5")).toBe(605);
    expect(parseCmToMm("60.5")).toBe(605);
    expect(parseCmToMm("180")).toBe(1800);
    expect(parseCmToMm("275")).toBe(2750);
    expect(parseCmToMm("1,5")).toBe(15);
    expect(parseCmToMm("0,5")).toBe(5);
    expect(parseCmToMm("")).toBeNull();
    expect(parseCmToMm("abc")).toBeNull();
  });

  it("formatação em cm no padrão brasileiro", () => {
    expect(formatCm(600)).toBe("60");
    expect(formatCm(605)).toBe("60,5");
    expect(formatCm(2750)).toBe("275");
    expect(formatCm(1850)).toBe("185");
    expect(formatCm(15)).toBe("1,5");
    expect(formatCm(2733)).toBe("273,3");
    expect(formatCmUnit(1800)).toBe("180 cm");
    expect(formatCmPair(1800, 600)).toBe("180 × 60");
  });
});
