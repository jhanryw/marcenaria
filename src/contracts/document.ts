/**
 * Converte o conteúdo do contrato em BLOCOS de documento (dados puros, sem fontes nem coordenadas).
 * O motor de layout (pdf/layout.ts) transforma os blocos em páginas A4.
 * Aqui só entram dados comerciais — nada de custos internos.
 */
import type { ContractContent, ResolvedClause } from "@/domain/schema";
import { formatBRL } from "@/lib/money";
import { describeDue, downPaymentCents, paymentSummary } from "./payment";
import { formatDateBR, formatDateLongBR, isValidISODate } from "./dates";
import { companyDisplayName, startMilestoneText } from "./template";
import { formatDocument, documentKind } from "./validators";
import { moneyToWordsPt } from "./words";

export interface KV {
  label: string;
  value: string;
}

export type DocBlock =
  | { t: "letterhead"; name: string; subtitle: string; lines: string[]; logoDataUrl: string | null }
  | { t: "title"; title: string; lines: string[] }
  | { t: "section"; number: number; title: string }
  | { t: "heading"; text: string }
  | { t: "kv"; rows: KV[] }
  | { t: "item"; title: string; rows: KV[] }
  | { t: "table"; columns: Array<{ label: string; width: number; align: "left" | "right" }>; rows: string[][]; footer?: string[] }
  | { t: "para"; text: string; number?: string; bullet?: boolean }
  | {
      t: "signatures";
      city: string;
      dateText: string;
      contractor: { name: string; detail: string; role: string };
      contracting: { name: string; detail: string; role: string };
      witnesses: boolean;
    };

export interface DocumentInfo {
  numberLabel: string;
  /** Data de emissão ("AAAA-MM-DD"); null = minuta */
  issuedDate: string | null;
  /** Data de hoje (usada em minutas) */
  todayDate: string;
  draft: boolean;
}

function rows(list: Array<[string, string | undefined | null]>): KV[] {
  return list.filter(([, v]) => v && v.trim()).map(([label, value]) => ({ label, value: (value as string).trim() }));
}

function docLine(raw: string): string {
  const kind = documentKind(raw);
  const f = formatDocument(raw);
  return f ? (kind ? `${kind} ${f}` : f) : "";
}

export function buildDocumentBlocks(c: ContractContent, info: DocumentInfo, clauses: ResolvedClause[]): DocBlock[] {
  const blocks: DocBlock[] = [];
  const co = c.company;
  const name = companyDisplayName(co) || "Empresa contratada";

  const coLines = [
    docLine(co.document),
    [co.address.trim(), [co.city.trim(), co.state.trim()].filter(Boolean).join("/")].filter(Boolean).join(" — "),
    [co.phone.trim(), co.email.trim()].filter(Boolean).join("  ·  "),
  ].filter(Boolean);
  blocks.push({
    t: "letterhead",
    name,
    subtitle: co.tradeName.trim() && co.legalName.trim() && co.tradeName.trim() !== co.legalName.trim() ? co.tradeName.trim() : "",
    lines: coLines,
    logoDataUrl: co.logoDataUrl,
  });

  blocks.push({
    t: "title",
    title: c.title.trim() || "Contrato",
    lines: [
      `Contrato nº ${info.numberLabel}`,
      info.draft ? "MINUTA — documento ainda não emitido" : `Emitido em ${formatDateBR(info.issuedDate)}`,
    ],
  });

  clauses.forEach((clause, idx) => {
    const n = idx + 1;
    const id = c.clauses[idx]?.id ?? "";
    blocks.push({ t: "section", number: n, title: clause.title });

    /* ---- blocos estruturados, antes do texto da cláusula ---- */
    if (id === "c1") {
      blocks.push({ t: "heading", text: "CONTRATADA" });
      blocks.push({
        t: "kv",
        rows: rows([
          ["Nome / razão social", [co.legalName.trim(), co.tradeName.trim() && co.tradeName.trim() !== co.legalName.trim() ? `(${co.tradeName.trim()})` : ""].filter(Boolean).join(" ") || name],
          ["CPF/CNPJ", docLine(co.document)],
          ["Endereço", [co.address.trim(), [co.city.trim(), co.state.trim()].filter(Boolean).join("/")].filter(Boolean).join(" — ")],
          ["Telefone", co.phone],
          ["E-mail", co.email],
          ["Responsável", co.responsible],
        ]),
      });
      const cl = c.client;
      blocks.push({ t: "heading", text: "CONTRATANTE" });
      blocks.push({
        t: "kv",
        rows: rows([
          ["Nome / razão social", cl.name],
          ["CPF/CNPJ", docLine(cl.document)],
          ["Endereço", cl.address],
          ["Endereço de entrega / instalação", cl.deliveryAddress],
          ["Telefone", cl.phone],
          ["E-mail", cl.email],
          ["Observações", cl.notes],
        ]),
      });
    }

    if (id === "c3") {
      if (c.summary.trim()) blocks.push({ t: "para", text: `Descrição geral: ${c.summary.trim()}` });
      c.items.forEach((it, i) => {
        blocks.push({
          t: "item",
          title: `Item ${i + 1} — ${it.name.trim() || "Móvel"}${it.quantity > 1 ? ` (${it.quantity} unidades)` : ""}`,
          rows: rows([
            ["Ambiente", it.environment],
            ["Descrição", it.description],
            ["Dimensões", it.dimensions],
            ["Material e acabamento", it.material],
            ["Cor", it.color],
            ["Portas", it.doors],
            ["Ferragens", it.hardware],
            ["Observações", it.notes],
          ]),
        });
      });
      if (c.notes.trim()) blocks.push({ t: "para", text: `Observações: ${c.notes.trim()}` });
    }

    if (id === "c4") {
      const pay = c.payment;
      const sum = paymentSummary(pay);
      const down = downPaymentCents(pay);
      blocks.push({
        t: "kv",
        rows: rows([
          ["Valor total", formatBRL(pay.totalCents)],
          ["Por extenso", pay.totalCents > 0 ? moneyToWordsPt(pay.totalCents) : ""],
        ]),
      });
      const tableRows: string[][] = [];
      if (down > 0) tableRows.push(["Entrada", describeDue(pay.downTrigger, pay.downDueDate), formatBRL(down)]);
      pay.installments.forEach((inst, i) => tableRows.push([`Parcela ${i + 1}/${pay.installments.length}`, describeDue(inst.trigger, inst.dueDate), formatBRL(inst.amountCents)]));
      if (tableRows.length)
        blocks.push({
          t: "table",
          columns: [
            { label: "Pagamento", width: 0.24, align: "left" },
            { label: "Vencimento", width: 0.52, align: "left" },
            { label: "Valor", width: 0.24, align: "right" },
          ],
          rows: tableRows,
          footer: ["Total", sum.balanced ? "" : "ATENÇÃO: soma diferente do total", formatBRL(sum.sumCents)],
        });
    }

    if (id === "c5") {
      const s = c.schedule;
      blocks.push({
        t: "kv",
        rows: rows([
          ["Marco inicial da contagem", s.leadTime > 0 || s.startMilestone ? startMilestoneText(c) : ""],
          ["Prazo de fabricação", s.leadTime > 0 ? `${s.leadTime} dia${s.leadTime === 1 ? "" : "s"} ${s.leadUnit === "uteis" ? "úteis" : "corridos"}` : ""],
          ["Início previsto", isValidISODate(s.startDate) ? formatDateBR(s.startDate) : ""],
          ["Entrega prevista", isValidISODate(s.deliveryDate) ? formatDateBR(s.deliveryDate) : ""],
          ["Instalação prevista", isValidISODate(s.installationDate) ? formatDateBR(s.installationDate) : ""],
          ["Local da instalação", s.installationLocation || c.client.deliveryAddress || c.client.address],
        ]),
      });
    }

    /* ---- texto da cláusula (parágrafos numerados n.m; marcadores "•" sem número) ---- */
    let k = 0;
    const isSignatures = id === "c15" || idx === clauses.length - 1;
    for (const p of clause.paragraphs) {
      if (p.startsWith("• ")) {
        blocks.push({ t: "para", text: p.slice(2), bullet: true });
      } else if (isSignatures) {
        blocks.push({ t: "para", text: p });
      } else {
        k++;
        blocks.push({ t: "para", text: p, number: `${n}.${k}` });
      }
    }

    if (isSignatures) {
      const cl = c.client;
      const dateIso = info.issuedDate ?? info.todayDate;
      blocks.push({
        t: "signatures",
        city: c.signingCity.trim(),
        dateText: formatDateLongBR(dateIso),
        contractor: {
          name: name,
          detail: [docLine(co.document), co.responsible.trim() && `Resp.: ${co.responsible.trim()}`].filter(Boolean).join(" · "),
          role: "CONTRATADA",
        },
        contracting: { name: cl.name.trim() || "Contratante", detail: docLine(cl.document), role: "CONTRATANTE" },
        witnesses: c.witnesses,
      });
    }
  });

  return blocks;
}

