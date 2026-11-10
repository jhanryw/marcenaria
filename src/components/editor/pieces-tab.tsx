"use client";
import * as React from "react";
import Link from "next/link";
import { Copy, Pencil, Plus, RefreshCw, Scissors, Trash2 } from "lucide-react";
import type { EdgeTape, Piece, Project, SheetMaterial } from "@/domain/schema";
import { newPiece } from "@/domain/defaults";
import { pieceRowSummary } from "@/engine/project-calc";
import type { ProjectCalculation } from "@/engine/project-calc";
import { withMaterialSnapshot, withTapeSnapshot, refreshMaterialSnapshot } from "@/db/repository";
import { formatBRL, formatM2, formatMeters, formatNumber } from "@/lib/money";
import { newId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState, SectionTitle } from "@/components/page-header";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { PieceDialog } from "./piece-dialog";

interface Props {
  project: Project;
  calc: ProjectCalculation;
  catalogMaterials: SheetMaterial[];
  catalogTapes: EdgeTape[];
  update: (fn: (p: Project) => Project) => void;
}

export function PiecesTab({ project, calc, catalogMaterials, catalogTapes, update }: Props) {
  const confirm = useConfirm();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Piece>(() => newPiece(""));
  const [isNew, setIsNew] = React.useState(true);
  const [addMatOpen, setAddMatOpen] = React.useState(false);

  const materialOptions = React.useMemo(() => {
    const inProj = project.materials.map((material) => ({ material, inProject: true }));
    const extra = catalogMaterials
      .filter((c) => !project.materials.some((m) => m.id === c.id))
      .map((material) => ({ material, inProject: false }));
    return [...inProj, ...extra];
  }, [project.materials, catalogMaterials]);

  const tapeOptions = React.useMemo(() => {
    const inProj = project.tapes.map((tape) => ({ tape, inProject: true }));
    const extra = catalogTapes
      .filter((c) => !project.tapes.some((t) => t.id === c.id))
      .map((tape) => ({ tape, inProject: false }));
    return [...inProj, ...extra];
  }, [project.tapes, catalogTapes]);

  const matName = (id: string) => project.materials.find((m) => m.id === id)?.name ?? "—";

  function openNew() {
    const last = project.pieces[project.pieces.length - 1];
    const defaultMat = last?.materialId ?? project.materials[0]?.id ?? catalogMaterials[0]?.id ?? "";
    setDraft(newPiece(defaultMat, last ? { edges: { top: null, bottom: null, left: null, right: null } } : {}));
    setIsNew(true);
    setDialogOpen(true);
  }

  function openEdit(p: Piece) {
    setDraft(structuredClone(p));
    setIsNew(false);
    setDialogOpen(true);
  }

  function commitPiece(piece: Piece, { addAnother }: { addAnother: boolean }) {
    update((proj) => {
      let next = proj;
      // traz para o orçamento (snapshot) o material/fitas escolhidos do catálogo
      const cm = catalogMaterials.find((m) => m.id === piece.materialId);
      if (cm) next = withMaterialSnapshot(next, cm);
      for (const side of ["top", "bottom", "left", "right"] as const) {
        const tid = piece.edges[side];
        if (!tid) continue;
        const ct = catalogTapes.find((t) => t.id === tid);
        if (ct) next = withTapeSnapshot(next, ct);
      }
      const exists = next.pieces.some((p) => p.id === piece.id);
      return {
        ...next,
        pieces: exists ? next.pieces.map((p) => (p.id === piece.id ? piece : p)) : [...next.pieces, piece],
      };
    });
    if (addAnother) {
      setDraft(newPiece(piece.materialId, { edges: { ...piece.edges } }));
      setIsNew(true);
      toast("Peça adicionada");
    } else {
      setDialogOpen(false);
    }
  }

  function duplicate(p: Piece) {
    update((proj) => {
      const idx = proj.pieces.findIndex((x) => x.id === p.id);
      const copy: Piece = { ...structuredClone(p), id: newId() };
      const pieces = [...proj.pieces];
      pieces.splice(idx + 1, 0, copy);
      return { ...proj, pieces };
    });
    toast("Peça duplicada");
  }

  async function remove(p: Piece) {
    const ok = await confirm({
      title: "Excluir peça?",
      message: `"${p.description}" (${p.quantity}×) será removida deste orçamento.`,
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (ok) update((proj) => ({ ...proj, pieces: proj.pieces.filter((x) => x.id !== p.id) }));
  }

  /* --------- materiais do orçamento --------- */
  function addMaterial(id: string) {
    const cm = catalogMaterials.find((m) => m.id === id);
    if (!cm) return;
    update((proj) => withMaterialSnapshot(proj, cm));
    setAddMatOpen(false);
    toast("Material adicionado ao orçamento");
  }

  async function removeMaterial(m: SheetMaterial) {
    const used = project.pieces.filter((p) => p.materialId === m.id).length;
    if (used > 0) {
      toast(`Há ${used} peça(s) usando este material. Altere-as antes de remover.`, "error");
      return;
    }
    update((proj) => ({ ...proj, materials: proj.materials.filter((x) => x.id !== m.id) }));
  }

  const totals = project.pieces.reduce(
    (a, p) => {
      const s = pieceRowSummary(p);
      return { qty: a.qty + p.quantity, area: a.area + s.areaMm2, tape: a.tape + s.tapeMm };
    },
    { qty: 0, area: 0, tape: 0 },
  );

  const outdated = (m: SheetMaterial) => {
    const c = catalogMaterials.find((x) => x.id === m.id);
    return c && c.updatedAt > m.updatedAt && (c.priceCents !== m.priceCents || c.lengthMm !== m.lengthMm || c.widthMm !== m.widthMm || c.kerfMm !== m.kerfMm || c.marginMm !== m.marginMm)
      ? c
      : null;
  };

  return (
    <div className="space-y-2">
      {/* Materiais do orçamento */}
      <SectionTitle
        action={
          <Button size="sm" variant="secondary" onClick={() => setAddMatOpen(true)}>
            <Plus /> Material
          </Button>
        }
      >
        Materiais deste orçamento
      </SectionTitle>
      {project.materials.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          Nenhum material ainda. Ao cadastrar uma peça você escolhe o MDF do catálogo e ele é copiado para cá (com o preço de hoje).
        </Card>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {project.materials.map((m) => {
            const upd = outdated(m);
            const usedBy = project.pieces.filter((p) => p.materialId === m.id).length;
            return (
              <Card key={m.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{m.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(m.thicknessMm)} mm · {formatNumber(m.lengthMm, 0)}×{formatNumber(m.widthMm, 0)} mm · serra {formatNumber(m.kerfMm)} mm · margem{" "}
                      {formatNumber(m.marginMm)} mm
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-bold text-primary tabular">{formatBRL(m.priceCents)}</div>
                    <div className="text-[11px] text-muted-foreground">por chapa</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge>{usedBy} peça{usedBy === 1 ? "" : "s"}</Badge>
                  {m.grainRequired && <Badge tone="amber">veio obrigatório</Badge>}
                  {upd && (
                    <button
                      type="button"
                      onClick={() => {
                        update((proj) => refreshMaterialSnapshot(proj, upd));
                        toast("Valores do catálogo aplicados");
                      }}
                      className="inline-flex min-h-9 items-center gap-1 rounded-full bg-warning-soft px-3 text-xs font-semibold text-warning"
                    >
                      <RefreshCw className="size-3.5" /> Catálogo mudou ({formatBRL(upd.priceCents)}) — atualizar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeMaterial(m)}
                    className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold text-muted-foreground hover:bg-muted"
                  >
                    <Trash2 className="size-3.5" /> Remover
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Peças */}
      <SectionTitle
        action={
          <Button size="sm" onClick={openNew}>
            <Plus /> Peça
          </Button>
        }
      >
        Peças ({totals.qty})
      </SectionTitle>

      {project.pieces.length === 0 ? (
        <EmptyState
          icon={<Scissors />}
          title="Adicione as peças do móvel"
          description="Informe medidas, quantidade, material e bordas. O plano de corte, as chapas e o preço são calculados na hora."
          action={
            <Button onClick={openNew} size="lg">
              <Plus /> Adicionar primeira peça
            </Button>
          }
        />
      ) : (
        <>
          {/* Cartões (celular) */}
          <div className="space-y-2 md:hidden">
            {project.pieces.map((p) => {
              const s = pieceRowSummary(p);
              return (
                <Card key={p.id} className="p-3">
                  <button type="button" onClick={() => openEdit(p)} className="block w-full text-left" aria-label={`Editar ${p.description}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">
                          {p.ref && <span className="mr-1.5 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-bold text-primary">{p.ref}</span>}
                          {p.description}
                        </div>
                        <div className="text-sm text-muted-foreground tabular">
                          {formatNumber(p.lengthMm, 1)} × {formatNumber(p.widthMm, 1)} mm
                        </div>
                      </div>
                      <div className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-sm font-bold text-primary-foreground tabular">{p.quantity}×</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="truncate">{matName(p.materialId)}</span>
                      <span>Área {formatM2(s.areaMm2)}</span>
                      <span>Fita {formatMeters(s.tapeMm)}</span>
                      {!p.allowRotation && <span>sem girar</span>}
                    </div>
                  </button>
                  <div className="mt-2 flex gap-1 border-t border-border pt-2">
                    <Button variant="ghost" size="sm" className="flex-1" onClick={() => openEdit(p)}>
                      <Pencil /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" className="flex-1" onClick={() => duplicate(p)}>
                      <Copy /> Duplicar
                    </Button>
                    <Button variant="ghost" size="sm" className="flex-1 text-destructive" onClick={() => remove(p)}>
                      <Trash2 /> Excluir
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Tabela (tablet/desktop) — sem rolagem horizontal */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-[26%] px-3 py-2">Peça</th>
                  <th className="w-[16%] px-3 py-2">Medidas (C × L)</th>
                  <th className="w-[7%] px-3 py-2 text-right">Qtd</th>
                  <th className="w-[20%] px-3 py-2">Material</th>
                  <th className="w-[11%] px-3 py-2 text-right">Área</th>
                  <th className="w-[10%] px-3 py-2 text-right">Fita</th>
                  <th className="w-[10%] px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {project.pieces.map((p) => {
                  const s = pieceRowSummary(p);
                  return (
                    <tr key={p.id} className="hover:bg-muted/50">
                      <td className="px-3 py-2">
                        <button type="button" className="block w-full text-left font-semibold" onClick={() => openEdit(p)}>
                          {p.ref && <span className="mr-1.5 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-bold text-primary">{p.ref}</span>}
                          <span className="break-words">{p.description}</span>
                        </button>
                      </td>
                      <td className="px-3 py-2 tabular">
                        {formatNumber(p.lengthMm, 1)} × {formatNumber(p.widthMm, 1)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular">{p.quantity}</td>
                      <td className="break-words px-3 py-2">{matName(p.materialId)}</td>
                      <td className="px-3 py-2 text-right tabular">{formatM2(s.areaMm2)}</td>
                      <td className="px-3 py-2 text-right tabular">{formatMeters(s.tapeMm)}</td>
                      <td className="px-1 py-1">
                        <div className="flex justify-end">
                          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${p.description}`} onClick={() => openEdit(p)}>
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label={`Duplicar ${p.description}`} onClick={() => duplicate(p)}>
                            <Copy />
                          </Button>
                          <Button variant="ghost" size="icon-sm" className="text-destructive" aria-label={`Excluir ${p.description}`} onClick={() => remove(p)}>
                            <Trash2 />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 bg-secondary/60 px-4 py-3 text-sm">
            <span>
              <strong className="tabular">{totals.qty}</strong> peças
            </span>
            <span>
              Área total <strong className="tabular">{formatM2(totals.area)}</strong>
            </span>
            <span>
              Fita (líquida) <strong className="tabular">{formatMeters(totals.tape)}</strong>
            </span>
          </Card>

          <Button variant="outline" className="w-full" size="lg" onClick={openNew}>
            <Plus /> Adicionar peça
          </Button>
        </>
      )}

      {calc.issues.some((i) => i.level === "error") && project.pieces.length > 0 && (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-center text-sm font-medium text-warning">
          Há avisos no plano de corte. Veja a aba Corte.
        </p>
      )}

      <PieceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={draft}
        isNew={isNew}
        materials={materialOptions}
        tapes={tapeOptions}
        onSave={commitPiece}
      />

      <Dialog open={addMatOpen} onOpenChange={setAddMatOpen}>
        <DialogContent title="Adicionar material" description="Copia o material do catálogo (com o preço de hoje) para este orçamento.">
          <DialogBody className="space-y-3">
            {catalogMaterials.filter((c) => !project.materials.some((m) => m.id === c.id)).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todos os materiais do catálogo já estão neste orçamento. Cadastre novos em{" "}
                <Link href="/materiais/" className="font-semibold text-primary underline">
                  Materiais
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {catalogMaterials
                  .filter((c) => !project.materials.some((m) => m.id === c.id))
                  .map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => addMaterial(m.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-3 text-left active:bg-muted"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{m.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {formatNumber(m.thicknessMm)} mm · {formatNumber(m.lengthMm, 0)}×{formatNumber(m.widthMm, 0)} mm
                          </span>
                        </span>
                        <span className="shrink-0 font-bold text-primary tabular">{formatBRL(m.priceCents)}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMatOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

