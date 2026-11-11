/**
 * Modelo de EXPORTAÇÃO do plano de corte para a madeireira.
 *
 * Princípios:
 *  - usa os posicionamentos REAIS devolvidos pelo motor de corte (planProjectCutting): nada é redesenhado;
 *  - só entram dados técnicos, montados campo a campo (lista branca). Preços, custos, markup, lucro, preço de venda,
 *    cliente, telefone, CPF, descrição comercial e observações do orçamento NUNCA são lidos aqui;
 *  - o plano é revalidado antes de exportar (motor + conferência independente sobre o próprio modelo exportado).
 */
import type { EdgeSide, Piece, Project } from "@/domain/schema";
import { EDGE_SIDES } from "@/domain/schema";
import { calculateProject } from "@/engine/project-calc";
import { pieceTapeMm } from "@/engine/finance/edge-banding";
import { validateMaterialResult } from "@/engine/cutting/validate";

const EPS = 1e-6;

export type EdgeNames = Record<EdgeSide, string | null>;

export interface ExportPiece {
  id: string;
  /** Código único exibido no desenho, na lista e no CSV */
  code: string;
  description: string;
  materialId: string;
  materialName: string;
  finish: string;
  thicknessMm: number;
  /** Comprimento (∥ veio quando o material tem veio) */
  lengthMm: number;
  widthMm: number;
  quantity: number;
  /** Pode girar 90° no corte (peça permite E material sem veio) */
  rotationAllowed: boolean;
  grainRequired: boolean;
  notes: string;
  /** Nome da fita em cada borda (superior/inferior = comprimento; esquerda/direita = largura) */
  edges: EdgeNames;
  /** Fita por unidade, em mm (soma das bordas marcadas) */
  tapeMmPerUnit: number;
}

export interface ExportPlacement {
  pieceId: string;
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
}

export interface ExportRegion {
  /** "S1", "S2"… só para sobras reaproveitáveis; null para sobras pequenas */
  code: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  reusable: boolean;
  areaMm2: number;
}

export interface ExportSheet {
  index: number;
  placements: ExportPlacement[];
  regions: ExportRegion[];
}

export interface ExportMaterial {
  id: string;
  name: string;
  finish: string;
  thicknessMm: number;
  sheetLengthMm: number;
  sheetWidthMm: number;
  marginMm: number;
  kerfMm: number;
  grainRequired: boolean;
  usableLengthMm: number;
  usableWidthMm: number;
  /** Chapas do plano (as que têm peças desenhadas) */
  sheetsInPlan: number;
  /** Reserva extra configurada no projeto (chapas além do plano) */
  reserveSheets: number;
  pieceCount: number;
  utilizationPercent: number;
  lowerBoundSheets: number;
  provenOptimal: boolean;
  strategy: string;
  sheets: ExportSheet[];
}

export interface ExportTape {
  id: string;
  name: string;
  color: string;
  widthMm: number;
  thicknessMm: number;
  wastePercent: number;
  netMm: number;
  grossMm: number;
}

export interface ExportProblem {
  id: string;
  message: string;
  materialName?: string;
}

export interface ExportOptions {
  /** Nome do projeto como aparecerá no documento (editável pelo usuário) */
  projectName: string;
  /** Referência do projeto (ex.: P-0003) */
  reference: string;
  /** Nome da marcenaria (opcional) */
  companyName?: string;
  /** Contato da marcenaria — só entra se includeContact for verdadeiro */
  contact?: { phone?: string; email?: string };
  includeContact?: boolean;
  now?: Date;
}

export interface ExportModel {
  meta: {
    projectName: string;
    reference: string;
    companyName: string;
    contact: { phone: string; email: string } | null;
    generatedAt: string;
  };
  materials: ExportMaterial[];
  pieces: ExportPiece[];
  tapes: ExportTape[];
  problems: ExportProblem[];
  /** true = plano completo e validado, pode ser exportado como plano executável */
  valid: boolean;
}

/** Lançado ao tentar gerar o plano como "executável" com problemas. Carrega os problemas para a interface. */
export class ExportBlockedError extends Error {
  constructor(public problems: ExportProblem[]) {
    super(`Exportação bloqueada: ${problems.length} problema(s) no plano de corte.`);
    this.name = "ExportBlockedError";
  }
}

/** Referência padrão: "P-0003" (número do projeto) ou os 6 primeiros caracteres do id. */
export function defaultReference(project: Pick<Project, "id" | "number">): string {
  return project.number ? `P-${String(project.number).padStart(4, "0")}` : project.id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

/**
 * Códigos curtos e ÚNICOS: usa a referência da peça quando existe; senão P1, P2… (posição na lista).
 * Duplicatas ganham sufixo (-2, -3…). É a mesma regra usada na tela de corte.
 */
export function pieceCodes(pieces: Pick<Piece, "id" | "ref">[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  pieces.forEach((p, i) => {
    const base = (p.ref.trim() || `P${i + 1}`).slice(0, 14);
    let code = base;
    let n = 1;
    while (used.has(code)) code = `${base}-${++n}`;
    used.add(code);
    out.set(p.id, code);
  });
  return out;
}

/**
 * Conferência INDEPENDENTE do que será desenhado: usa só o modelo exportado (não o resultado do motor).
 * Garante que cada desenho corresponde às peças cadastradas e respeita margens, serra, rotação e veio.
 */
export function crossCheckModel(model: Pick<ExportModel, "materials" | "pieces">): ExportProblem[] {
  const problems: ExportProblem[] = [];
  const add = (id: string, message: string, materialName?: string) => problems.push({ id, message, materialName });
  const pieceById = new Map(model.pieces.map((p) => [p.id, p]));

  for (const m of model.materials) {
    const placedByPiece = new Map<string, number>();
    for (const sheet of m.sheets) {
      for (const p of sheet.placements) {
        const src = pieceById.get(p.pieceId);
        if (!src || src.materialId !== m.id) {
          add(`xc-unknown-${m.id}-${sheet.index}-${p.code}`, `Chapa ${sheet.index}: o desenho contém "${p.code}", que não corresponde a uma peça deste material.`, m.name);
          continue;
        }
        placedByPiece.set(p.pieceId, (placedByPiece.get(p.pieceId) ?? 0) + 1);

        const ew = p.rotated ? src.widthMm : src.lengthMm;
        const eh = p.rotated ? src.lengthMm : src.widthMm;
        if (Math.abs(ew - p.w) > EPS || Math.abs(eh - p.h) > EPS)
          add(`xc-dims-${m.id}-${sheet.index}-${p.code}`, `Chapa ${sheet.index}: "${p.code}" foi desenhada com medidas diferentes das cadastradas.`, m.name);
        if (p.rotated && !src.rotationAllowed)
          add(`xc-rot-${m.id}-${sheet.index}-${p.code}`, `Chapa ${sheet.index}: "${p.code}" aparece girada, mas a rotação não é permitida${m.grainRequired ? " (material com veio)" : ""}.`, m.name);
        if (
          p.x < m.marginMm - EPS ||
          p.y < m.marginMm - EPS ||
          p.x + p.w > m.sheetLengthMm - m.marginMm + EPS ||
          p.y + p.h > m.sheetWidthMm - m.marginMm + EPS
        )
          add(`xc-bounds-${m.id}-${sheet.index}-${p.code}`, `Chapa ${sheet.index}: "${p.code}" ultrapassa a área útil (margens de ${m.marginMm} mm).`, m.name);
      }
      const ps = sheet.placements;
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i];
          const b = ps[j];
          const apart =
            a.x + a.w + m.kerfMm <= b.x + EPS ||
            b.x + b.w + m.kerfMm <= a.x + EPS ||
            a.y + a.h + m.kerfMm <= b.y + EPS ||
            b.y + b.h + m.kerfMm <= a.y + EPS;
          if (!apart) add(`xc-overlap-${m.id}-${sheet.index}-${i}-${j}`, `Chapa ${sheet.index}: "${a.code}" e "${b.code}" se sobrepõem ou estão mais próximas que a serra (${m.kerfMm} mm).`, m.name);
        }
      }
    }
    // quantidades: tudo que está cadastrado para este material precisa estar desenhado
    for (const p of model.pieces.filter((x) => x.materialId === m.id)) {
      const placed = placedByPiece.get(p.id) ?? 0;
      if (placed !== p.quantity)
        add(`xc-qty-${p.id}`, `"${p.code}": ${placed} desenhada(s) para ${p.quantity} cadastrada(s).`, m.name);
    }
  }
  // peças cadastradas cujo material não tem plano
  const planned = new Set(model.materials.map((m) => m.id));
  for (const p of model.pieces) if (!planned.has(p.materialId)) add(`xc-nomaterial-${p.id}`, `"${p.code}": material sem plano de corte.`);
  return problems;
}

/** Monta o modelo a partir do projeto atual (recalcula o plano e o valida). Nunca lança: problemas vão em `problems`. */
export function buildExportModel(project: Project, options: ExportOptions): ExportModel {
  const calc = calculateProject(project);
  const codes = pieceCodes(project.pieces);
  const matById = new Map(project.materials.map((m) => [m.id, m]));
  const tapeById = new Map(project.tapes.map((t) => [t.id, t]));
  const tapeName = (id: string | null) => (id ? (tapeById.get(id)?.name ?? "(fita removida)") : null);

  const pieces: ExportPiece[] = project.pieces.map((p) => {
    const m = matById.get(p.materialId);
    const edges = Object.fromEntries(EDGE_SIDES.map((s) => [s, tapeName(p.edges[s])])) as EdgeNames;
    return {
      id: p.id,
      code: codes.get(p.id) as string,
      description: p.description.trim(),
      materialId: p.materialId,
      materialName: m?.name ?? "(material não encontrado)",
      finish: m?.finish ?? "",
      thicknessMm: m?.thicknessMm ?? 0,
      lengthMm: p.lengthMm,
      widthMm: p.widthMm,
      quantity: Math.floor(p.quantity),
      rotationAllowed: p.allowRotation && !(m?.grainRequired ?? false),
      grainRequired: m?.grainRequired ?? false,
      notes: p.notes.trim(),
      edges,
      tapeMmPerUnit: pieceTapeMm(p),
    };
  });

  const materials: ExportMaterial[] = calc.cut.materials.map((r) => {
    const m = r.material;
    return {
      id: m.id,
      name: m.name,
      finish: m.finish,
      thicknessMm: m.thicknessMm,
      sheetLengthMm: m.lengthMm,
      sheetWidthMm: m.widthMm,
      marginMm: m.marginMm,
      kerfMm: m.kerfMm,
      grainRequired: m.grainRequired,
      usableLengthMm: m.lengthMm - 2 * m.marginMm,
      usableWidthMm: m.widthMm - 2 * m.marginMm,
      sheetsInPlan: r.sheetsUsed,
      reserveSheets: r.reserveSheets,
      pieceCount: r.totalPieces,
      utilizationPercent: r.metrics.utilizationPercent,
      lowerBoundSheets: r.lowerBoundSheets,
      provenOptimal: r.provenOptimal,
      strategy: r.strategy,
      sheets: r.sheets.map((s) => {
        const reusable = s.freeRegions.filter((f) => f.reusable).sort((a, b) => b.w * b.h - a.w * a.h);
        const codeOf = new Map(reusable.map((f, i) => [f, `S${i + 1}`]));
        return {
          index: s.index,
          placements: s.placements.map((pl) => ({
            pieceId: pl.pieceId,
            code: codes.get(pl.pieceId) ?? "?",
            x: pl.x,
            y: pl.y,
            w: pl.w,
            h: pl.h,
            rotated: pl.rotated,
          })),
          regions: s.freeRegions
            .map((f) => ({ code: codeOf.get(f) ?? null, x: f.x, y: f.y, w: f.w, h: f.h, reusable: f.reusable, areaMm2: f.w * f.h }))
            .sort((a, b) => (b.reusable ? 1 : 0) - (a.reusable ? 1 : 0) || b.areaMm2 - a.areaMm2),
        };
      }),
    };
  });

  const tapes: ExportTape[] = calc.tape.usages.map((u) => ({
    id: u.tapeId,
    name: u.tape.name,
    color: u.tape.color,
    widthMm: u.tape.widthMm,
    thicknessMm: u.tape.thicknessMm,
    wastePercent: u.tape.wastePercent,
    netMm: u.netMm,
    grossMm: u.grossMm,
  }));

  /* ---------------- validação ---------------- */
  const problems: ExportProblem[] = [];
  const add = (id: string, message: string, materialName?: string) => problems.push({ id, message, materialName });

  if (project.pieces.length === 0) add("no-pieces", "O projeto não tem peças cadastradas.");
  for (const p of pieces) {
    if (!(p.lengthMm > 0 && p.widthMm > 0)) add(`piece-dims-${p.id}`, `"${p.code}" (${p.description || "sem descrição"}): medidas inválidas.`);
    if (!(p.quantity >= 1)) add(`piece-qty-${p.id}`, `"${p.code}": quantidade inválida.`);
  }
  for (const o of calc.cut.orphanPieces) add(`orphan-${o.pieceId}`, `"${o.description}": ${o.reason}`);
  for (const r of calc.cut.materials) {
    for (const u of r.unplaceable) add(`unplaceable-${r.materialId}-${u.pieceId}`, `${u.quantity}× "${u.description}" (${u.lengthMm} × ${u.widthMm} mm): ${u.reason}`, r.material.name);
  }
  // revalida o plano do motor com o validador geométrico do próprio motor...
  for (const r of calc.cut.materials) {
    const ps = project.pieces.filter((p) => p.materialId === r.materialId);
    for (const v of validateMaterialResult(r, ps)) add(`engine-${r.materialId}-${v.sheetIndex}-${v.message}`, `Chapa ${v.sheetIndex || "—"}: ${v.message}`, r.material.name);
  }
  if (calc.tape.missingTapeIds.length > 0) add("missing-tape", "Há bordas com fita que não existe mais neste orçamento. Reabra as peças e escolha a fita novamente.");

  const partial = { materials, pieces };
  // ... e confere o que será de fato desenhado (conferência independente, sobre o modelo exportado)
  if (problems.length === 0) problems.push(...crossCheckModel(partial));

  const includeContact = !!options.includeContact;
  return {
    meta: {
      projectName: options.projectName.trim() || project.name,
      reference: options.reference.trim() || defaultReference(project),
      companyName: (options.companyName ?? "").trim(),
      contact: includeContact ? { phone: (options.contact?.phone ?? "").trim(), email: (options.contact?.email ?? "").trim() } : null,
      generatedAt: (options.now ?? new Date()).toISOString(),
    },
    materials,
    pieces,
    tapes,
    problems,
    valid: problems.length === 0,
  };
}
