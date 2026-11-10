"use client";
import * as React from "react";
import { AlertTriangle } from "lucide-react";
import type { EdgeSide, EdgeTape, Piece, SheetMaterial } from "@/domain/schema";
import { EDGE_SIDES } from "@/domain/schema";
import { edgeLengthMm } from "@/engine/finance/edge-banding";
import { formatNumber } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import { newId } from "@/lib/utils";

const SIDE_LABEL: Record<EdgeSide, string> = {
  top: "Superior",
  bottom: "Inferior",
  left: "Esquerda",
  right: "Direita",
};

export interface PieceDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: Piece;
  isNew: boolean;
  /** materiais disponíveis: do orçamento + do catálogo */
  materials: Array<{ material: SheetMaterial; inProject: boolean }>;
  tapes: Array<{ tape: EdgeTape; inProject: boolean }>;
  onSave: (p: Piece, opts: { addAnother: boolean }) => void;
}

/** Miniatura da peça com as bordas coloridas quando há fita. */
function EdgePreview({ piece }: { piece: Piece }) {
  const w = 132;
  const h = 84;
  const col = (side: EdgeSide) => (piece.edges[side] ? "#1f7a4f" : "#cfd1c8");
  const sw = (side: EdgeSide) => (piece.edges[side] ? 6 : 2);
  const x0 = 14,
    y0 = 14,
    x1 = w - 14,
    y1 = h - 14;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-auto shrink-0" aria-hidden="true">
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="#f3ede0" />
      <line x1={x0} y1={y0} x2={x1} y2={y0} stroke={col("top")} strokeWidth={sw("top")} strokeLinecap="round" />
      <line x1={x0} y1={y1} x2={x1} y2={y1} stroke={col("bottom")} strokeWidth={sw("bottom")} strokeLinecap="round" />
      <line x1={x0} y1={y0} x2={x0} y2={y1} stroke={col("left")} strokeWidth={sw("left")} strokeLinecap="round" />
      <line x1={x1} y1={y0} x2={x1} y2={y1} stroke={col("right")} strokeWidth={sw("right")} strokeLinecap="round" />
      <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize="11" fill="#626962">
        peça
      </text>
    </svg>
  );
}

export function PieceDialog({ open, onOpenChange, initial, isNew, materials, tapes, onSave }: PieceDialogProps) {
  const [p, setP] = React.useState<Piece>(initial);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setP(initial);
      setTouched(false);
    }
  }, [open, initial]);

  const set = <K extends keyof Piece>(k: K, v: Piece[K]) => setP((cur) => ({ ...cur, [k]: v }));
  const mat = materials.find((m) => m.material.id === p.materialId)?.material;

  const errors: Record<string, string> = {};
  if (!p.description.trim()) errors.description = "Informe a descrição";
  if (!mat) errors.materialId = "Escolha o material";
  if (!(p.lengthMm > 0)) errors.lengthMm = "Maior que zero";
  if (!(p.widthMm > 0)) errors.widthMm = "Maior que zero";
  if (!Number.isInteger(p.quantity) || p.quantity < 1) errors.quantity = "Mínimo 1";
  if (p.quantity > 10000) errors.quantity = "Máximo 10.000";

  // aviso de encaixe (não bloqueia salvar: a peça aparecerá em "não cabem")
  let fitWarning: string | null = null;
  if (mat && p.lengthMm > 0 && p.widthMm > 0) {
    const uw = mat.lengthMm - 2 * mat.marginMm;
    const uh = mat.widthMm - 2 * mat.marginMm;
    const canRotate = p.allowRotation && !mat.grainRequired;
    const fits = (p.lengthMm <= uw && p.widthMm <= uh) || (canRotate && p.widthMm <= uw && p.lengthMm <= uh);
    if (!fits) {
      fitWarning = `Esta peça não cabe na área útil da chapa (${formatNumber(uw, 0)} × ${formatNumber(uh, 0)} mm)${
        mat.grainRequired ? " — material com veio não permite girar" : !p.allowRotation ? " — a rotação está desativada" : ""
      }.`;
    }
  }

  const tapeOptions = (
    <>
      <option value="">Sem fita</option>
      {tapes.map(({ tape, inProject }) => (
        <option key={tape.id} value={tape.id}>
          {tape.name}
          {inProject ? "" : " (do catálogo)"}
        </option>
      ))}
    </>
  );

  const submit = (addAnother: boolean) => {
    setTouched(true);
    if (Object.keys(errors).length > 0) return;
    onSave({ ...p, description: p.description.trim(), ref: p.ref.trim() }, { addAnother });
  };

  const tapeMm = EDGE_SIDES.reduce((a, s) => a + (p.edges[s] ? edgeLengthMm(p, s) : 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={isNew ? "Nova peça" : "Editar peça"}>
        <DialogBody className="space-y-4">
          <Field label="Descrição" error={touched ? errors.description : undefined} htmlFor="pc-desc">
            <Input
              id="pc-desc"
              value={p.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Ex.: Lateral esquerda"
              autoFocus={isNew}
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Referência" className="col-span-1" htmlFor="pc-ref">
              <Input id="pc-ref" value={p.ref} onChange={(e) => set("ref", e.target.value)} placeholder="L1" maxLength={12} />
            </Field>
            <Field label="Quantidade" className="col-span-1" error={touched ? errors.quantity : undefined} htmlFor="pc-qty">
              <NumberInput id="pc-qty" value={p.quantity} maxDecimals={0} onChange={(v) => set("quantity", v === null ? 0 : Math.floor(v))} />
            </Field>
            <div className="col-span-1" />
          </div>

          <Field label="Material (chapa)" error={touched ? errors.materialId : undefined} htmlFor="pc-mat">
            <Select id="pc-mat" value={p.materialId} onChange={(e) => set("materialId", e.target.value)}>
              <option value="">Selecione…</option>
              {materials.map(({ material: m, inProject }) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {inProject ? "" : " (do catálogo)"}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Comprimento"
              hint={mat?.grainRequired ? "Segue o veio" : undefined}
              error={touched ? errors.lengthMm : undefined}
              htmlFor="pc-len"
            >
              <NumberInput id="pc-len" value={p.lengthMm || null} onChange={(v) => set("lengthMm", v ?? 0)} suffix="mm" placeholder="1800" />
            </Field>
            <Field label="Largura" error={touched ? errors.widthMm : undefined} htmlFor="pc-wid">
              <NumberInput id="pc-wid" value={p.widthMm || null} onChange={(v) => set("widthMm", v ?? 0)} suffix="mm" placeholder="600" />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Permitir girar 90° no corte</div>
              <p className="text-xs text-muted-foreground">
                {mat?.grainRequired
                  ? "Desativado: este material tem veio obrigatório."
                  : "Ajuda a aproveitar melhor a chapa."}
              </p>
            </div>
            <Switch
              checked={p.allowRotation && !mat?.grainRequired}
              disabled={mat?.grainRequired}
              onCheckedChange={(v) => set("allowRotation", v)}
              aria-label="Permitir girar 90 graus"
            />
          </div>

          {fitWarning && (
            <div role="alert" className="flex items-start gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {fitWarning}
            </div>
          )}

          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-semibold">Fita de borda</legend>
            <div className="flex items-center gap-4">
              <EdgePreview piece={p} />
              <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                Superior/inferior medem o <strong>comprimento</strong>; esquerda/direita medem a <strong>largura</strong>. O total de fita é a
                soma só das bordas marcadas.
                <div className="mt-1 font-semibold text-foreground">
                  Fita por peça: {formatNumber(tapeMm / 1000, 2, 2)} m
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {EDGE_SIDES.map((side) => (
                <Field
                  key={side}
                  label={`${SIDE_LABEL[side]} · ${p.lengthMm > 0 && p.widthMm > 0 ? formatNumber(edgeLengthMm(p, side), 0) : "—"} mm`}
                >
                  <Select
                    aria-label={`Fita da borda ${SIDE_LABEL[side].toLowerCase()}`}
                    value={p.edges[side] ?? ""}
                    onChange={(e) => set("edges", { ...p.edges, [side]: e.target.value || null })}
                  >
                    {tapeOptions}
                  </Select>
                </Field>
              ))}
            </div>
            <Field label="Aplicar a mesma fita em todas as bordas">
              <Select
                aria-label="Aplicar fita em todas as bordas"
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__none") set("edges", { top: null, bottom: null, left: null, right: null });
                  else if (v) set("edges", { top: v, bottom: v, left: v, right: v });
                }}
              >
                <option value="">Escolher…</option>
                <option value="__none">Remover todas as fitas</option>
                {tapes.map(({ tape }) => (
                  <option key={tape.id} value={tape.id}>
                    {tape.name}
                  </option>
                ))}
              </Select>
            </Field>
          </fieldset>

          <Field label="Observações (opcional)">
            <Input value={p.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Ex.: furação para dobradiça" />
          </Field>
        </DialogBody>
        <DialogFooter>
          {isNew && (
            <Button variant="outline" onClick={() => submit(true)}>
              Salvar e adicionar outra
            </Button>
          )}
          <Button onClick={() => submit(false)}>Salvar peça</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function clonePieceFresh(p: Piece): Piece {
  return { ...structuredClone(p), id: newId(), ref: p.ref ? `${p.ref}` : "" };
}
