import { beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { generateContractPdf, layoutContract, renderInputFromContract, type RenderInput } from "@/contracts/pdf/generate";
import { CONTENT_BOTTOM, CONTENT_W, FOOTER_Y, MARGIN_X, PAGE_H, PAGE_W, wrapText, type Op } from "@/contracts/pdf/layout";
import type { FontBytes } from "@/contracts/pdf/fonts";
import { newContractItem } from "@/contracts/build-contract";
import { recomputePayment } from "@/contracts/payment";
import type { ContractContent } from "@/domain/schema";
import { fontBytesFromDisk, sampleContent, sampleContract } from "./contract-helpers";
import { LOGO_DATA_URL } from "./fixtures/logo-data-url";

let fonts: FontBytes;
beforeAll(() => {
  fonts = fontBytesFromDisk();
});

const input = (content: ContractContent, over: Partial<RenderInput> = {}): RenderInput => ({
  content,
  numberLabel: "0001",
  issuedDate: null,
  draft: true,
  metaDate: new Date("2026-11-10T12:00:00Z"),
  ...over,
});

async function extractText(bytes: Uint8Array): Promise<string[]> {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  await task.destroy();
  return pages;
}

const squash = (s: string) => s.replace(/\s+/g, " ");

function bigContent(n: number): ContractContent {
  const c = sampleContent();
  c.items = Array.from({ length: n }, (_, i) =>
    newContractItem({
      name: `Móvel ${i + 1} — armário planejado`,
      environment: "Cozinha",
      description:
        "Armário em MDF com portas de abrir, gavetas com corrediça telescópica e prateleiras reguláveis, incluindo acabamento nas bordas e fixação na parede. " +
        "Descrição propositalmente longa para forçar a quebra de linhas e de páginas durante a geração do contrato em PDF.",
      dimensions: "2,40 m (L) × 0,60 m (P) × 2,70 m (A)",
      material: "MDF Branco TX 15 mm; fundo em MDF 6 mm",
      hardware: "Dobradiças com amortecedor; puxadores perfil",
    }),
  );
  c.payment = recomputePayment({ ...c.payment, totalCents: 1234567 });
  return c;
}

describe("PDF do contrato", () => {
  it("gera um PDF A4 válido, com metadados e idioma", async () => {
    const { bytes, layout } = await generateContractPdf(input(sampleContent()), fonts);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(layout.pages.length);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
    expect(doc.getTitle()).toContain("Contrato de Fornecimento e Instalação de Móveis Planejados");
    expect(doc.getAuthor()).toContain("Silva Móveis Planejados");
    expect(doc.getCreationDate()?.toISOString()).toBe("2026-11-10T12:00:00.000Z");
  });

  it("o texto extraído do PDF contém acentuação, partes, valor e valor por extenso", async () => {
    const c = sampleContent();
    c.payment = recomputePayment({ ...c.payment, totalCents: 500000 });
    const { bytes } = await generateContractPdf(input(c), fonts);
    const text = squash((await extractText(bytes)).join(" "));
    for (const s of [
      "Contrato nº 0001",
      "Maria Conceição Açaí",
      "Silva Móveis Planejados Ltda.",
      "CNPJ 11.222.333/0001-81",
      "CPF 529.982.247-25",
      "R$ 5.000,00",
      "cinco mil reais",
      "Entrada",
      "R$ 2.000,00",
      "Parcela 1/2",
      "R$ 1.500,00",
      "Garantia legal",
      "Código de Defesa do Consumidor",
      "TRATAMENTO DE DADOS PESSOAIS",
      "ASSINATURAS",
      "CONTRATANTE",
      "Página 1 de",
    ]) {
      expect(text, s).toContain(s);
    }
  });

  it("acentos e caracteres especiais não quebram e viram '?' só quando a fonte não tem o glifo", async () => {
    const c = sampleContent();
    c.items[0].description = "Ação “aspas” ‘simples’ — travessão – º ª § € ½ © ñ ü ç ã ê Õ 😀 ✓ 日本";
    c.notes = "Observação: pé-direito de 2,70 m; ‘vão’ de 1,20 m.";
    const { bytes } = await generateContractPdf(input(c), fonts);
    const text = squash((await extractText(bytes)).join(" "));
    expect(text).toContain("Ação “aspas” ‘simples’ — travessão – º ª § € ½ © ñ ü ç ã ê Õ");
    expect(text).toContain("pé-direito de 2,70 m");
    expect(text).not.toContain("😀");
  });

  it("vários móveis geram várias páginas, com numeração 'Página i de N' coerente", async () => {
    const { bytes, layout } = await generateContractPdf(input(bigContent(14)), fonts);
    expect(layout.pages.length).toBeGreaterThanOrEqual(4);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(layout.pages.length);
    const pages = await extractText(bytes);
    pages.forEach((t, i) => expect(squash(t)).toContain(`Página ${i + 1} de ${pages.length}`));
    const all = squash(pages.join(" "));
    for (let i = 1; i <= 14; i++) expect(all).toContain(`Item ${i} — Móvel ${i}`);
  });

  it("geometria: nada fora das margens, nada sobreposto, nada na área do rodapé", async () => {
    for (const n of [1, 3, 9, 20]) {
      const layout = await layoutContract(input(bigContent(n)), fonts);
      for (const [pi, page] of layout.pages.entries()) {
        const boxes: Array<{ x1: number; x2: number; y1: number; y2: number; text: string }> = [];
        for (const op of page.ops) {
          if (op.t === "text") {
            expect(op.x, `x pág ${pi}`).toBeGreaterThanOrEqual(MARGIN_X - 0.01);
            expect(op.x + op.width, `largura pág ${pi}: ${op.text}`).toBeLessThanOrEqual(MARGIN_X + CONTENT_W + 0.01);
            const isFooter = Math.abs(op.y - FOOTER_Y) < 0.01;
            if (!isFooter) expect(op.y + op.size * 0.25, `corpo invade rodapé pág ${pi}: ${op.text}`).toBeLessThanOrEqual(CONTENT_BOTTOM + 0.5);
            boxes.push({ x1: op.x, x2: op.x + op.width, y1: op.y - op.size * 0.78, y2: op.y + op.size * 0.22, text: op.text });
          }
          if (op.t === "rect" || op.t === "image") {
            expect(op.x).toBeGreaterThanOrEqual(MARGIN_X - 0.01);
            expect(op.x + op.w).toBeLessThanOrEqual(MARGIN_X + CONTENT_W + 0.01);
            expect(op.y + op.h).toBeLessThanOrEqual(CONTENT_BOTTOM + 0.5);
          }
          if (op.t === "line") {
            expect(op.y1).toBeLessThanOrEqual(PAGE_H);
            expect(op.x2).toBeLessThanOrEqual(PAGE_W - 20);
          }
        }
        // sem sobreposição de linhas de texto (caixas verticais) quando se cruzam horizontalmente
        for (let a = 0; a < boxes.length; a++) {
          for (let b = a + 1; b < boxes.length; b++) {
            const A = boxes[a];
            const B = boxes[b];
            const hOverlap = A.x1 < B.x2 - 0.5 && B.x1 < A.x2 - 0.5;
            const vOverlap = A.y1 < B.y2 - 0.3 && B.y1 < A.y2 - 0.3;
            // rótulo e valor de uma mesma linha (colunas) têm x disjuntos; o resto não pode se sobrepor
            expect(hOverlap && vOverlap, `sobreposição pág ${pi}: "${A.text}" × "${B.text}"`).toBe(false);
          }
        }
      }
    }
  });

  it("o fecho nunca fica isolado: a última página tem texto do contrato junto das assinaturas", async () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const layout = await layoutContract(input(bigContent(n)), fonts);
      const last = layout.pages[layout.pages.length - 1];
      const texts = last.ops.filter((o): o is Extract<Op, { t: "text" }> => o.t === "text").map((o) => o.text);
      const joined = texts.join(" ");
      expect(joined, `n=${n}`).toContain("E, por estarem de acordo");
      expect(joined).toContain("CONTRATANTE");
      expect(joined).toContain("ASSINATURAS");
      // e há mais do que só a assinatura (rodapé + cabeçalho + fecho)
      expect(texts.length).toBeGreaterThan(8);
    }
  });

  it("testemunhas opcionais entram no mesmo grupo de assinaturas", async () => {
    const c = sampleContent();
    c.witnesses = true;
    const { bytes } = await generateContractPdf(input(c), fonts);
    const text = squash((await extractText(bytes)).join(" "));
    expect(text).toContain("Testemunhas:");
    expect(text).toContain("Testemunha 2");
  });

  it("minuta tem marca d'água e rodapé 'MINUTA'; versão emitida, não", async () => {
    const draft = await layoutContract(input(sampleContent()), fonts);
    expect(draft.pages.every((p) => p.ops.some((o) => o.t === "watermark"))).toBe(true);
    const issued = await layoutContract(input(sampleContent(), { draft: false, issuedDate: "2026-11-10" }), fonts);
    expect(issued.pages.some((p) => p.ops.some((o) => o.t === "watermark"))).toBe(false);
    const { bytes } = await generateContractPdf(input(sampleContent(), { draft: false, issuedDate: "2026-11-10" }), fonts);
    const text = squash((await extractText(bytes)).join(" "));
    expect(text).toContain("Emitido em 10/11/2026");
    expect(text).toContain("10 de novembro de 2026");
    expect(text).not.toContain("MINUTA");
  });

  it("logotipo é embutido no PDF", async () => {
    const png = LOGO_DATA_URL;
    const c = sampleContent();
    c.company = { ...c.company, logoDataUrl: png };
    const { bytes, layout } = await generateContractPdf(input(c), fonts);
    expect(layout.pages[0].ops.some((o) => o.t === "image")).toBe(true);
    const doc = await PDFDocument.load(bytes);
    expect(doc.context.enumerateIndirectObjects().some(([, o]) => String(o).includes("Image"))).toBe(true);
    // logo inválido não impede o PDF
    c.company.logoDataUrl = "data:image/png;base64,AAAA";
    await expect(generateContractPdf(input(c), fonts)).resolves.toBeTruthy();
  });

  it("palavra gigante sem espaços é quebrada e nunca ultrapassa a coluna", () => {
    const lines = wrapText("A".repeat(300), 100, (s) => s.length * 6);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.length * 6 <= 100)).toBe(true);
  });

  it("mesma entrada → mesmo layout e mesmos bytes (versão emitida é reproduzível)", async () => {
    const i = input(sampleContent(), { draft: false, issuedDate: "2026-11-10" });
    const a = await generateContractPdf(i, fonts);
    const b = await generateContractPdf(i, fonts);
    expect(JSON.stringify(a.layout)).toBe(JSON.stringify(b.layout));
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
  });

  it("renderInputFromContract usa a versão IMUTÁVEL quando emitido", () => {
    const content = sampleContent();
    const frozen = structuredClone(content);
    frozen.client.name = "Nome Congelado";
    const c = sampleContract(content, {
      status: "emitido",
      issuedAt: "2026-11-10T15:00:00.000Z",
      issued: { content: frozen, clauses: [{ title: "Única", paragraphs: ["Texto congelado."] }], date: "2026-11-10" },
    });
    const r = renderInputFromContract(c);
    expect(r.content.client.name).toBe("Nome Congelado");
    expect(r.clauses?.[0].paragraphs[0]).toBe("Texto congelado.");
    expect(r.draft).toBe(false);
    expect(renderInputFromContract(sampleContract(content)).draft).toBe(true);
  });
});

describe("sem vazamento de custos internos", () => {
  it("nem o conteúdo, nem o texto do PDF contêm custos, markup, lucro ou aproveitamento", async () => {
    const c = sampleContent();
    const json = JSON.stringify(c);
    for (const secret of ["Dobradiça secreta XYZ", "markupPercent", "pricePerMeter", "priceCents", "wastePercent", "utilization", "costItems", "labor"]) {
      expect(json, `conteúdo: ${secret}`).not.toContain(secret);
    }
    const { bytes } = await generateContractPdf(input(c), fonts);
    const text = squash((await extractText(bytes)).join(" "));
    for (const secret of ["1.234,57", "91,37", "1.357,91", "77,31", "618,48", "Dobradiça secreta", "markup", "Markup", "lucro", "Lucro", "aproveitamento", "Aproveitamento", "chapas"]) {
      expect(text, `PDF: ${secret}`).not.toContain(secret);
    }
    // mas o preço FINAL comercial aparece
    expect(text).toContain(c.payment.totalCents > 0 ? "R$" : "");
  });
});
