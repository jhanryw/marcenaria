"use client";
import * as React from "react";
import { Copy, Hammer, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { COST_CATEGORIES, COST_CATEGORY_LABELS, type CostCategory, type CostItem, type LaborPart, type Project } from "@/domain/schema";
import { newCostItem } from "@/domain/defaults";
import { costItemSubtotal, laborPartCost } from "@/engine/finance/pricing";
import type { ProjectCalculation } from "@/engine/project-calc";
import { formatBRL, formatNumber } from "@/lib/money";
import { newId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { MoneyInput, NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { SectionTitle } from "@/components/page-header";
import { useConfirm } from "@/components/ui/confirm";

const QUICK: Array<{ category: CostCategory; description: string; unit: string }> = [
  { category: "dobradicas", description: "Dobradiças", unit: "un." },
  { category: "corredicas", description: "Corrediças", unit: "par" },
  { category: "puxadores", description: "Puxadores", unit: "un." },
  { category: "parafusos", description: "Parafusos", unit: "pacote" },
  { category: "cola", description: "Cola", unit: "un." },
  { category: "frete", description: "Frete", unit: "serviço" },
];

function LaborCard({
  title,
  part,
  onChange,
}: {
  title: string;
  part: LaborPart;
  onChange: (p: LaborPart) => void;
}) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-base font-bold text-primary tabular">{formatBRL(laborPartCost(part))}</span>
      </div>
      <Segmented
        ariaLabel={`Método de cálculo — ${title}`}
        value={part.mode}
        onChange={(mode) => onChange({ ...part, mode })}
        options={[
          { value: "fixed", label: "Valor fixo" },
          { value: "hourly", label: "Por hora" },
        ]}
      />
      {part.mode === "fixed" ? (
        <Field label="Valor">
          <MoneyInput aria-label={`Valor fixo de ${title}`} cents={part.fixedCents} onChange={(v) => onChange({ ...part, fixedCents: v ?? 0 })} />
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Horas estimadas">
            <NumberInput aria-label={`Horas de ${title}`} value={part.hours} onChange={(v) => onChange({ ...part, hours: Math.max(0, v ?? 0) })} suffix="h" />
          </Field>
          <Field label="Custo por hora">
            <MoneyInput aria-label={`Custo por hora de ${title}`} cents={part.hourlyCents} onChange={(v) => onChange({ ...part, hourlyCents: v ?? 0 })} />
          </Field>
          <p className="col-span-2 text-xs text-muted-foreground">
            {formatNumber(part.hours)} h × {formatBRL(part.hourlyCents)} = <strong>{formatBRL(laborPartCost(part))}</strong>
          </p>
        </div>
      )}
    </Card>
  );
}

export function CostsTab({
  project,
  calc,
  update,
}: {
  project: Project;
  calc: ProjectCalculation;
  update: (fn: (p: Project) => Project) => void;
}) {
  const confirm = useConfirm();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<CostItem>(() => newCostItem());
  const [isNew, setIsNew] = React.useState(true);
  const [touched, setTouched] = React.useState(false);

  function openNew(preset?: Partial<CostItem>) {
    setDraft(newCostItem(preset));
    setIsNew(true);
    setTouched(false);
    setOpen(true);
  }
  function openEdit(c: CostItem) {
    setDraft({ ...c });
    setIsNew(false);
    setTouched(false);
    setOpen(true);
  }
  function save() {
    setTouched(true);
    if (!draft.description.trim() || draft.unitCents < 0) return;
    const item = { ...draft, description: draft.description.trim() };
    update((p) => ({
      ...p,
      costItems: p.costItems.some((c) => c.id === item.id) ? p.costItems.map((c) => (c.id === item.id ? item : c)) : [...p.costItems, item],
    }));
    setOpen(false);
  }
  async function remove(c: CostItem) {
    const ok = await confirm({ title: "Excluir custo?", message: `"${c.description}" será removido.`, confirmLabel: "Excluir", destructive: true });
    if (ok) update((p) => ({ ...p, costItems: p.costItems.filter((x) => x.id !== c.id) }));
  }

  const sub = costItemSubtotal(draft);
  const itemsTotal = project.costItems.reduce((a, c) => a + costItemSubtotal(c), 0);

  return (
    <div className="space-y-2">
      <Card className="flex items-start gap-3 bg-secondary/70 p-4 text-sm">
        <Info className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="font-semibold">Incluídos automaticamente (não lance de novo):</p>
          <p className="mt-0.5 flex flex-wrap gap-x-5 gap-y-0.5 text-muted-foreground">
            <span>
              Chapas de MDF: <strong className="text-foreground tabular">{formatBRL(calc.finance.sheetsCostCents)}</strong>
            </span>
            <span>
              Fita de borda: <strong className="text-foreground tabular">{formatBRL(calc.finance.tapeCostCents)}</strong>
            </span>
          </p>
        </div>
      </Card>

      <SectionTitle
        action={
          <Button size="sm" onClick={() => openNew()}>
            <Plus /> Custo
          </Button>
        }
      >
        Ferragens, insumos e outros
      </SectionTitle>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" aria-label="Adicionar rapidamente">
        {QUICK.map((q) => (
          <button
            key={q.description}
            type="button"
            onClick={() => openNew({ category: q.category, description: q.description, unit: q.unit })}
            className="h-10 shrink-0 rounded-full border border-input bg-card px-3.5 text-sm font-semibold text-foreground active:bg-muted"
          >
            + {q.description}
          </button>
        ))}
      </div>

      {project.costItems.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          Nenhum custo adicional. Use os atalhos acima para lançar dobradiças, corrediças, frete etc.
        </Card>
      ) : (
        <div className="space-y-2">
          {project.costItems.map((c) => (
            <Card key={c.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEdit(c)} aria-label={`Editar ${c.description}`}>
                  <div className="truncate font-semibold">{c.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {COST_CATEGORY_LABELS[c.category]} ·{" "}
                    {c.mode === "fixed"
                      ? "valor fixo"
                      : `${formatNumber(c.quantity)} ${c.unit} × ${formatBRL(c.unitCents)}`}
                  </div>
                </button>
                <div className="shrink-0 text-right font-bold tabular">{formatBRL(costItemSubtotal(c))}</div>
              </div>
              <div className="mt-2 flex gap-1 border-t border-border pt-2">
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => openEdit(c)}>
                  <Pencil /> Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={() => update((p) => ({ ...p, costItems: [...p.costItems, { ...c, id: newId() }] }))}
                >
                  <Copy /> Duplicar
                </Button>
                <Button variant="ghost" size="sm" className="flex-1 text-destructive" onClick={() => remove(c)}>
                  <Trash2 /> Excluir
                </Button>
              </div>
            </Card>
          ))}
          <div className="flex items-center justify-between rounded-xl bg-secondary/60 px-4 py-3 text-sm">
            <span>Subtotal de ferragens e outros</span>
            <strong className="tabular">{formatBRL(itemsTotal)}</strong>
          </div>
        </div>
      )}

      <SectionTitle>
        <span className="flex items-center gap-1.5">
          <Hammer className="size-4" /> Mão de obra
        </span>
      </SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        <LaborCard title="Fabricação" part={project.labor.fabrication} onChange={(fabrication) => update((p) => ({ ...p, labor: { ...p.labor, fabrication } }))} />
        <LaborCard title="Instalação" part={project.labor.installation} onChange={(installation) => update((p) => ({ ...p, labor: { ...p.labor, installation } }))} />
      </div>
      <p className="text-xs text-muted-foreground">A mão de obra entra no custo total antes de aplicar o markup.</p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={isNew ? "Novo custo" : "Editar custo"}>
          <DialogBody className="space-y-4">
            <Field label="Descrição" error={touched && !draft.description.trim() ? "Informe a descrição" : undefined}>
              <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Ex.: Dobradiças com amortecedor" autoFocus={isNew} />
            </Field>
            <Field label="Categoria">
              <Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as CostCategory })}>
                {COST_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {COST_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Segmented
              ariaLabel="Tipo de lançamento"
              value={draft.mode}
              onChange={(mode) => setDraft({ ...draft, mode })}
              options={[
                { value: "unit", label: "Quantidade × unitário" },
                { value: "fixed", label: "Valor fixo" },
              ]}
            />
            {draft.mode === "unit" ? (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Quantidade">
                  <NumberInput value={draft.quantity} onChange={(v) => setDraft({ ...draft, quantity: Math.max(0, v ?? 0) })} />
                </Field>
                <Field label="Unidade">
                  <Input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="un." />
                </Field>
                <Field label="Valor unitário">
                  <MoneyInput cents={draft.unitCents} onChange={(v) => setDraft({ ...draft, unitCents: v ?? 0 })} />
                </Field>
              </div>
            ) : (
              <Field label="Valor">
                <MoneyInput cents={draft.unitCents} onChange={(v) => setDraft({ ...draft, unitCents: v ?? 0 })} />
              </Field>
            )}
            <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
              <span className="text-sm font-medium">Subtotal</span>
              <strong className="text-lg tabular text-primary">{formatBRL(sub)}</strong>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
