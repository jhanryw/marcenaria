"use client";
import * as React from "react";
import { z } from "zod";
import type { EdgeTape, SheetMaterial } from "@/domain/schema";
import { edgeTapeSchema, sheetMaterialSchema } from "@/domain/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MoneyInput, NumberInput } from "@/components/ui/number-input";
import { CmInput } from "@/components/ui/length-input";
import { Switch } from "@/components/ui/switch";

function errorsOf(schema: z.ZodType, value: unknown): Record<string, string> {
  const r = schema.safeParse(value);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) {
    const k = String(i.path[0] ?? "");
    if (k && !out[k]) out[k] = i.message;
  }
  return out;
}

const REQUIRED = "Informe um valor maior que zero";

export function SheetMaterialDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  title = "Material (chapa)",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: SheetMaterial;
  onSave: (m: SheetMaterial) => void | Promise<void>;
  title?: string;
}) {
  const [m, setM] = React.useState(initial);
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setM(initial);
      setTouched(false);
    }
  }, [open, initial]);

  const errors = errorsOf(sheetMaterialSchema, m);
  const set = <K extends keyof SheetMaterial>(k: K, v: SheetMaterial[K]) => setM((cur) => ({ ...cur, [k]: v }));
  const err = (k: string) => (touched ? errors[k] && (k === "name" ? errors[k] : REQUIRED) : undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title}>
        <DialogBody className="space-y-4">
          <Field label="Nome / descrição" error={err("name")} htmlFor="mat-name">
            <Input id="mat-name" value={m.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: MDF Branco 15 mm" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fabricante (opcional)">
              <Input value={m.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} placeholder="Ex.: Duratex" />
            </Field>
            <Field label="Cor / acabamento">
              <Input value={m.finish} onChange={(e) => set("finish", e.target.value)} placeholder="Ex.: Branco TX" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Espessura do MDF (mm)" error={err("thicknessMm")}>
              <NumberInput value={m.thicknessMm} onChange={(v) => set("thicknessMm", v ?? 0)} suffix="mm" />
            </Field>
            <Field label="Comprimento da chapa (cm)" error={err("lengthMm")}>
              <CmInput mm={m.lengthMm} onChangeMm={(v) => set("lengthMm", v ?? 0)} placeholder="275" />
            </Field>
            <Field label="Largura da chapa (cm)" error={err("widthMm")}>
              <CmInput mm={m.widthMm} onChangeMm={(v) => set("widthMm", v ?? 0)} placeholder="185" />
            </Field>
          </div>
          <Field label="Preço por chapa" error={err("priceCents")}>
            <MoneyInput cents={m.priceCents} onChange={(v) => set("priceCents", v ?? 0)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Margem nas extremidades (mm)" hint="Refilo de cada borda da chapa" error={err("marginMm")}>
              <NumberInput value={m.marginMm} onChange={(v) => set("marginMm", v ?? 0)} suffix="mm" />
            </Field>
            <Field label="Espessura do corte da serra (mm)" hint="Perda em cada corte" error={err("kerfMm")}>
              <NumberInput value={m.kerfMm} onChange={(v) => set("kerfMm", v ?? 0)} suffix="mm" />
            </Field>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Veio obrigatório</div>
              <p className="text-xs text-muted-foreground">
                Peças não giram: o comprimento da peça fica paralelo ao comprimento da chapa.
              </p>
            </div>
            <Switch checked={m.grainRequired} onCheckedChange={(v) => set("grainRequired", v)} aria-label="Veio obrigatório" />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={async () => {
              setTouched(true);
              if (Object.keys(errors).length > 0) return;
              await onSave(m);
              onOpenChange(false);
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EdgeTapeDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: EdgeTape;
  onSave: (t: EdgeTape) => void | Promise<void>;
}) {
  const [t, setT] = React.useState(initial);
  const [touched, setTouched] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setT(initial);
      setTouched(false);
    }
  }, [open, initial]);
  const errors = errorsOf(edgeTapeSchema, t);
  const set = <K extends keyof EdgeTape>(k: K, v: EdgeTape[K]) => setT((cur) => ({ ...cur, [k]: v }));
  const err = (k: string) => (touched ? errors[k] && (k === "name" ? errors[k] : REQUIRED) : undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Fita de borda">
        <DialogBody className="space-y-4">
          <Field label="Nome" error={err("name")}>
            <Input value={t.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Fita branca 22 mm" />
          </Field>
          <Field label="Cor">
            <Input value={t.color} onChange={(e) => set("color", e.target.value)} placeholder="Ex.: Branco" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Largura da fita (mm)" error={err("widthMm")}>
              <NumberInput value={t.widthMm} onChange={(v) => set("widthMm", v ?? 0)} suffix="mm" />
            </Field>
            <Field label="Espessura da fita (mm)" error={err("thicknessMm")}>
              <NumberInput value={t.thicknessMm} onChange={(v) => set("thicknessMm", v ?? 0)} suffix="mm" />
            </Field>
          </div>
          <Field label="Preço por metro" error={err("pricePerMeterCents")}>
            <MoneyInput cents={t.pricePerMeterCents} onChange={(v) => set("pricePerMeterCents", v ?? 0)} />
          </Field>
          <Field label="Perda adicional" hint="Emendas, refiles e sobras. Somada ao comprimento calculado." error={err("wastePercent")}>
            <NumberInput value={t.wastePercent} onChange={(v) => set("wastePercent", v ?? 0)} suffix="%" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={async () => {
              setTouched(true);
              if (Object.keys(errors).length > 0) return;
              await onSave(t);
              onOpenChange(false);
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
