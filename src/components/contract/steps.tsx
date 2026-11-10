"use client";
import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_TRIGGERS,
  PAYMENT_TRIGGER_LABELS,
  START_MILESTONES,
  START_MILESTONE_LABELS,
  type ContractContent,
  type PaymentMethod,
  type Settings,
} from "@/domain/schema";
import { newContractItem } from "@/contracts/build-contract";
import { addLeadTime, isValidISODate, nextBusinessDay, addDays, todayISO } from "@/contracts/dates";
import { adjustLastInstallment, downPercentOf, paymentSummary, recomputePayment } from "@/contracts/payment";
import { SPECIAL_CONDITION_DEFS } from "@/contracts/template";
import { formatBRL, formatNumber } from "@/lib/money";
import { newId } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";
import { MoneyInput, NumberInput } from "@/components/ui/number-input";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { SectionTitle } from "@/components/page-header";
import type { Review, ReviewItem } from "@/contracts/review";
import { DateField, DocumentField } from "./fields";

type Update = (fn: (c: ContractContent) => ContractContent) => void;

/* ===================== 1. Cliente ===================== */

export function ClientStep({
  content,
  update,
  settingsCompany,
}: {
  content: ContractContent;
  update: Update;
  settingsCompany: Settings["company"] | undefined;
}) {
  const cl = content.client;
  const set = (patch: Partial<ContractContent["client"]>) => update((c) => ({ ...c, client: { ...c.client, ...patch } }));
  const co = content.company;
  const coName = co.legalName.trim() || co.tradeName.trim();
  const differs = settingsCompany && JSON.stringify(settingsCompany) !== JSON.stringify(co);

  return (
    <div className="space-y-2">
      <Card className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Contratada (sua empresa)</div>
            <div className="truncate text-base font-semibold">{coName || "Empresa não cadastrada"}</div>
            <div className="text-sm text-muted-foreground">{[co.document, [co.city, co.state].filter(Boolean).join("/")].filter(Boolean).join(" · ") || "—"}</div>
          </div>
          {co.logoDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={co.logoDataUrl} alt="Logotipo" className="h-10 max-w-24 shrink-0 object-contain" />
          )}
        </div>
        {!coName && (
          <p role="alert" className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive">
            Cadastre os dados da empresa para poder emitir o contrato.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/configuracoes/">Editar dados da empresa</Link>
          </Button>
          {differs && (
            <Button size="sm" variant="secondary" onClick={() => update((c) => ({ ...c, company: structuredClone(settingsCompany!) }))}>
              <RefreshCw /> Usar dados atuais das configurações
            </Button>
          )}
        </div>
      </Card>

      <SectionTitle>Contratante (cliente)</SectionTitle>
      <Card className="space-y-4 p-4">
        <Field label="Nome completo ou razão social" htmlFor="cl-name" error={cl.name.trim() ? undefined : "Obrigatório para emitir"}>
          <Input id="cl-name" value={cl.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" />
        </Field>
        <DocumentField id="cl-doc" label="CPF ou CNPJ" value={cl.document} onChange={(v) => set({ document: v })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefone" htmlFor="cl-phone">
            <Input id="cl-phone" type="tel" inputMode="tel" value={cl.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="E-mail" htmlFor="cl-email">
            <Input id="cl-email" type="email" inputMode="email" value={cl.email} onChange={(e) => set({ email: e.target.value })} autoComplete="off" />
          </Field>
        </div>
        <Field label="Endereço completo" htmlFor="cl-address">
          <Textarea id="cl-address" value={cl.address} onChange={(e) => set({ address: e.target.value })} className="min-h-20" placeholder="Rua, número, complemento, bairro, cidade/UF, CEP" />
        </Field>
        <Field label="Endereço de entrega ou instalação (se diferente)" htmlFor="cl-delivery">
          <Textarea id="cl-delivery" value={cl.deliveryAddress} onChange={(e) => set({ deliveryAddress: e.target.value })} className="min-h-20" />
        </Field>
        <Field label="Observações (opcional)" htmlFor="cl-notes">
          <Input id="cl-notes" value={cl.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </Card>
      <p className="px-1 text-xs text-muted-foreground">
        Peça só o necessário: nome é o único dado obrigatório do cliente. CPF/CNPJ e endereço são recomendados, não obrigatórios.
      </p>
    </div>
  );
}

/* ===================== 2. Projeto e móveis ===================== */

export function ItemsStep({ content, update }: { content: ContractContent; update: Update }) {
  const [openId, setOpenId] = React.useState<string | null>(content.items[0]?.id ?? null);

  const setItem = (id: string, patch: Partial<ContractContent["items"][number]>) =>
    update((c) => ({ ...c, items: c.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));

  return (
    <div className="space-y-2">
      <Card className="space-y-4 p-4">
        <Field label="Título do documento" htmlFor="ct-title-step" hint="Pode ser editado.">
          <Input id="ct-title-step" value={content.title} onChange={(e) => update((c) => ({ ...c, title: e.target.value }))} />
        </Field>
        <Field label="Descrição geral do projeto (opcional)" htmlFor="ct-summary" hint="Texto comercial. Não use a lista de cortes: descreva os móveis.">
          <Textarea id="ct-summary" value={content.summary} onChange={(e) => update((c) => ({ ...c, summary: e.target.value }))} className="min-h-20" />
        </Field>
      </Card>

      <SectionTitle
        action={
          <Button
            size="sm"
            onClick={() => {
              const it = newContractItem();
              update((c) => ({ ...c, items: [...c.items, it] }));
              setOpenId(it.id);
            }}
          >
            <Plus /> Móvel
          </Button>
        }
      >
        Móveis e serviços contratados
      </SectionTitle>

      {content.items.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">Nenhum item. Adicione pelo menos um móvel ou serviço (obrigatório para emitir).</Card>
      )}

      {content.items.map((it, idx) => {
        const open = openId === it.id;
        return (
          <Card key={it.id} className="overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : it.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-3 p-4 text-left"
            >
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Item {idx + 1}</div>
                <div className="truncate font-semibold">{it.name.trim() || "Sem nome"}</div>
                {!open && (it.environment || it.description) && (
                  <div className="truncate text-sm text-muted-foreground">{[it.environment, it.description].filter(Boolean).join(" · ")}</div>
                )}
              </div>
              <span className="shrink-0 text-sm font-semibold text-primary">{open ? "Recolher" : "Editar"}</span>
            </button>
            {open && (
              <div className="space-y-4 border-t border-border p-4">
                <Field label="Nome do móvel ou serviço" htmlFor={`it-name-${it.id}`} error={it.name.trim() ? undefined : "Obrigatório"}>
                  <Input id={`it-name-${it.id}`} value={it.name} onChange={(e) => setItem(it.id, { name: e.target.value })} placeholder="Ex.: Guarda-roupa planejado" />
                </Field>
                <div className="grid grid-cols-[1fr_6rem] gap-3">
                  <Field label="Ambiente" htmlFor={`it-env-${it.id}`}>
                    <Input id={`it-env-${it.id}`} value={it.environment} onChange={(e) => setItem(it.id, { environment: e.target.value })} placeholder="Quarto principal" />
                  </Field>
                  <Field label="Qtd." htmlFor={`it-qty-${it.id}`}>
                    <NumberInput id={`it-qty-${it.id}`} value={it.quantity} maxDecimals={0} onChange={(v) => setItem(it.id, { quantity: Math.max(1, Math.floor(v ?? 1)) })} />
                  </Field>
                </div>
                <Field label="Descrição" htmlFor={`it-desc-${it.id}`}>
                  <Textarea id={`it-desc-${it.id}`} value={it.description} onChange={(e) => setItem(it.id, { description: e.target.value })} placeholder="Guarda-roupa em MDF, com portas, gavetas e prateleiras." />
                </Field>
                <Field label="Dimensões externas (aproximadas ou finais)" htmlFor={`it-dim-${it.id}`}>
                  <Input id={`it-dim-${it.id}`} value={it.dimensions} onChange={(e) => setItem(it.id, { dimensions: e.target.value })} placeholder="Ex.: 2,70 m (A) × 3,20 m (L) × 0,60 m (P)" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="MDF e acabamento" htmlFor={`it-mat-${it.id}`}>
                    <Input id={`it-mat-${it.id}`} value={it.material} onChange={(e) => setItem(it.id, { material: e.target.value })} />
                  </Field>
                  <Field label="Cor" htmlFor={`it-color-${it.id}`}>
                    <Input id={`it-color-${it.id}`} value={it.color} onChange={(e) => setItem(it.id, { color: e.target.value })} />
                  </Field>
                  <Field label="Tipo de portas" htmlFor={`it-doors-${it.id}`}>
                    <Input id={`it-doors-${it.id}`} value={it.doors} onChange={(e) => setItem(it.id, { doors: e.target.value })} placeholder="Correr, abrir, basculante…" />
                  </Field>
                  <Field label="Ferragens relevantes" htmlFor={`it-hw-${it.id}`}>
                    <Input id={`it-hw-${it.id}`} value={it.hardware} onChange={(e) => setItem(it.id, { hardware: e.target.value })} placeholder="Dobradiças com amortecedor…" />
                  </Field>
                </div>
                <Field label="Observações do item" htmlFor={`it-notes-${it.id}`}>
                  <Input id={`it-notes-${it.id}`} value={it.notes} onChange={(e) => setItem(it.id, { notes: e.target.value })} />
                </Field>
                <Button
                  variant="destructive-outline"
                  size="sm"
                  onClick={() => update((c) => ({ ...c, items: c.items.filter((x) => x.id !== it.id) }))}
                >
                  <Trash2 /> Remover item
                </Button>
              </div>
            )}
          </Card>
        );
      })}

      <SectionTitle
        action={
          <Button size="sm" variant="secondary" onClick={() => update((c) => ({ ...c, externalDocs: [...c.externalDocs, { id: newId(), description: "" }] }))}>
            <Plus /> Documento
          </Button>
        }
      >
        Projeto técnico, desenhos e medições
      </SectionTitle>
      <Card className="space-y-3 p-4">
        <div className="flex items-start gap-2 rounded-xl bg-secondary p-3 text-sm text-secondary-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            Liste aqui os desenhos, medições ou projeto aprovado que fazem parte da contratação. O contrato os <strong>referencia</strong> e diz que{" "}
            <strong>não estão anexados ao PDF</strong> (ficam arquivados com as partes).
          </p>
        </div>
        {content.externalDocs.map((d, i) => (
          <div key={d.id} className="flex items-start gap-2">
            <Input
              aria-label={`Documento ${i + 1}`}
              value={d.description}
              onChange={(e) => update((c) => ({ ...c, externalDocs: c.externalDocs.map((x) => (x.id === d.id ? { ...x, description: e.target.value } : x)) }))}
              placeholder="Ex.: Projeto 3D aprovado em 05/11/2026 (arquivo enviado por e-mail)"
            />
            <Button variant="ghost" size="icon" aria-label={`Remover documento ${i + 1}`} onClick={() => update((c) => ({ ...c, externalDocs: c.externalDocs.filter((x) => x.id !== d.id) }))}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </Card>

      <SectionTitle>Observações comerciais</SectionTitle>
      <Card className="p-4">
        <Textarea aria-label="Observações comerciais" value={content.notes} onChange={(e) => update((c) => ({ ...c, notes: e.target.value }))} className="min-h-20" placeholder="Condições combinadas com o cliente que devam constar no contrato." />
      </Card>
    </div>
  );
}

/* ===================== 3. Valores e pagamento ===================== */

export function PaymentStep({
  content,
  update,
  referencePriceCents,
}: {
  content: ContractContent;
  update: Update;
  referencePriceCents: number | null;
}) {
  const pay = content.payment;
  const sum = paymentSummary(pay);
  const setPay = (patch: Partial<typeof pay>) =>
    update((c) => ({ ...c, payment: recomputePayment({ ...c.payment, ...patch }, todayISO()) }));
  const setRaw = (fn: (p: typeof pay) => typeof pay) => update((c) => ({ ...c, payment: fn(c.payment) }));

  const toggleMethod = (m: PaymentMethod) =>
    setRaw((p) => ({ ...p, methods: p.methods.includes(m) ? p.methods.filter((x) => x !== m) : [...p.methods, m] }));

  return (
    <div className="space-y-2">
      <Card className="space-y-3 p-4">
        <Field label="Valor total contratado" htmlFor="pay-total" error={pay.totalCents > 0 ? undefined : "Informe o valor total"}>
          <MoneyInput id="pay-total" cents={pay.totalCents} onChange={(v) => setPay({ totalCents: v ?? 0 })} />
        </Field>
        {referencePriceCents !== null && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-sm">
            <span>
              Preço do orçamento: <strong className="tabular">{formatBRL(referencePriceCents)}</strong>
            </span>
            {referencePriceCents !== pay.totalCents && (
              <Button size="sm" variant="outline" onClick={() => setPay({ totalCents: referencePriceCents })}>
                Voltar ao valor do orçamento
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Mudar o valor aqui <strong>não altera</strong> custos, markup nem preço do orçamento original.
        </p>
      </Card>

      <SectionTitle>Entrada</SectionTitle>
      <Card className="space-y-3 p-4">
        <Segmented
          ariaLabel="Entrada em percentual ou reais"
          value={pay.downMode}
          onChange={(m) => setPay({ downMode: m, ...(m === "amount" ? { downCents: pay.downCents } : { downPercent: Math.round(downPercentOf(pay) * 100) / 100 }) })}
          options={[
            { value: "percent", label: "Percentual" },
            { value: "amount", label: "Valor em R$" },
          ]}
        />
        {pay.downMode === "percent" ? (
          <Field label="Entrada" htmlFor="pay-down-pct" hint={`= ${formatBRL(pay.downCents)}`}>
            <NumberInput id="pay-down-pct" value={pay.downPercent} onChange={(v) => setPay({ downPercent: Math.min(100, Math.max(0, v ?? 0)) })} suffix="%" maxDecimals={2} />
          </Field>
        ) : (
          <Field label="Entrada" htmlFor="pay-down-amt" hint={`= ${formatNumber(downPercentOf(pay), 2)}% do total`}>
            <MoneyInput id="pay-down-amt" cents={pay.downCents} onChange={(v) => setPay({ downCents: v ?? 0 })} />
          </Field>
        )}
        {pay.downCents > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vencimento da entrada" htmlFor="pay-down-trigger">
              <Select id="pay-down-trigger" value={pay.downTrigger} onChange={(e) => setRaw((p) => ({ ...p, downTrigger: e.target.value as typeof p.downTrigger }))}>
                {PAYMENT_TRIGGERS.map((t) => (
                  <option key={t} value={t}>
                    {PAYMENT_TRIGGER_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <DateField
              id="pay-down-date"
              label={pay.downTrigger === "data" ? "Data da entrada" : "Data prevista (opcional)"}
              value={pay.downDueDate}
              onChange={(v) => setRaw((p) => ({ ...p, downDueDate: v }))}
              error={pay.downTrigger === "data" && !isValidISODate(pay.downDueDate) ? "Defina a data" : undefined}
            />
          </div>
        )}
      </Card>

      <SectionTitle>Parcelas do saldo</SectionTitle>
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Número de parcelas" htmlFor="pay-count">
            <NumberInput id="pay-count" value={pay.installmentCount} maxDecimals={0} onChange={(v) => setPay({ installmentCount: Math.min(120, Math.max(0, Math.floor(v ?? 0))) })} />
          </Field>
          <Field label="Intervalo sugerido" htmlFor="pay-interval">
            <NumberInput id="pay-interval" value={pay.intervalDays} maxDecimals={0} onChange={(v) => setPay({ intervalDays: Math.min(365, Math.max(1, Math.floor(v ?? 30))) })} suffix="dias" />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Ao mudar total, entrada ou número de parcelas, o saldo é dividido igualmente (sem sobrar centavos). Depois você pode editar cada parcela.</p>

        {pay.installments.map((inst, i) => (
          <div key={inst.id} className="space-y-2 rounded-xl border border-border p-3" data-testid={`installment-${i}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-primary">Parcela {i + 1}/{pay.installments.length}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Valor">
                <MoneyInput aria-label={`Valor da parcela ${i + 1}`} cents={inst.amountCents} onChange={(v) => setRaw((p) => ({ ...p, installments: p.installments.map((x) => (x.id === inst.id ? { ...x, amountCents: v ?? 0 } : x)) }))} />
              </Field>
              <Field label="Vencimento">
                <Select
                  aria-label={`Vencimento da parcela ${i + 1}`}
                  value={inst.trigger}
                  onChange={(e) => setRaw((p) => ({ ...p, installments: p.installments.map((x) => (x.id === inst.id ? { ...x, trigger: e.target.value as typeof x.trigger } : x)) }))}
                >
                  {PAYMENT_TRIGGERS.map((t) => (
                    <option key={t} value={t}>
                      {PAYMENT_TRIGGER_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <DateField
                id={`inst-date-${inst.id}`}
                label={inst.trigger === "data" ? "Data" : "Data prevista (opcional)"}
                value={inst.dueDate}
                onChange={(v) => setRaw((p) => ({ ...p, installments: p.installments.map((x) => (x.id === inst.id ? { ...x, dueDate: v } : x)) }))}
                error={inst.trigger === "data" && !isValidISODate(inst.dueDate) ? "Defina a data" : undefined}
              />
            </div>
          </div>
        ))}
      </Card>

      <Card className={cn("space-y-1.5 p-4", sum.balanced ? "border-success/40 bg-success-soft" : "border-destructive/40 bg-destructive-soft")} data-testid="payment-summary">
        <div className="flex items-center gap-2 text-sm font-bold">
          {sum.balanced ? <CheckCircle2 className="size-5 text-success" /> : <AlertTriangle className="size-5 text-destructive" />}
          {sum.balanced ? "Entrada + parcelas = valor total" : sum.diffCents > 0 ? `Faltam ${formatBRL(sum.diffCents)} para fechar o total` : `Excede o total em ${formatBRL(-sum.diffCents)}`}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm tabular">
          <dt>Valor total</dt>
          <dd className="text-right font-semibold">{formatBRL(sum.totalCents)}</dd>
          <dt>Entrada</dt>
          <dd className="text-right font-semibold">{formatBRL(sum.downCents)}</dd>
          <dt>Saldo</dt>
          <dd className="text-right font-semibold">{formatBRL(sum.balanceCents)}</dd>
          <dt>Soma das parcelas</dt>
          <dd className="text-right font-semibold">{formatBRL(sum.installmentsCents)}</dd>
        </dl>
        {!sum.balanced && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setPay({})}>
              Dividir saldo igualmente
            </Button>
            {pay.installments.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setRaw((p) => adjustLastInstallment(p))}>
                Ajustar última parcela
              </Button>
            )}
          </div>
        )}
      </Card>

      <SectionTitle>Forma de pagamento (informativa)</SectionTitle>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Formas de pagamento">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={pay.methods.includes(m)}
              onClick={() => toggleMethod(m)}
              className={cn("h-11 rounded-full border px-4 text-sm font-semibold", pay.methods.includes(m) ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}
            >
              {PAYMENT_METHOD_LABELS[m]}
            </button>
          ))}
        </div>
        <Field label="Observações sobre o pagamento" htmlFor="pay-notes">
          <Textarea id="pay-notes" value={pay.notes} onChange={(e) => setRaw((p) => ({ ...p, notes: e.target.value }))} className="min-h-20" />
        </Field>
        <p className="text-xs text-muted-foreground">As formas de pagamento são só uma informação do contrato: o aplicativo não processa nem cobra pagamentos.</p>
      </Card>
    </div>
  );
}

/* ===================== 4. Prazo e condições ===================== */

export function ScheduleStep({ content, update, holidays }: { content: ContractContent; update: Update; holidays: string[] }) {
  const s = content.schedule;
  const t = content.terms;
  const hset = React.useMemo(() => new Set(holidays), [holidays]);
  const setSched = (patch: Partial<typeof s>) => update((c) => ({ ...c, schedule: { ...c.schedule, ...patch } }));
  const setTerms = (patch: Partial<typeof t>) => update((c) => ({ ...c, terms: { ...c.terms, ...patch } }));

  const canSuggest = isValidISODate(s.startDate) && s.leadTime > 0;
  const deliveryBeforeStart = isValidISODate(s.startDate) && isValidISODate(s.deliveryDate) && s.deliveryDate < s.startDate;
  const installBeforeDelivery = isValidISODate(s.deliveryDate) && isValidISODate(s.installationDate) && s.installationDate < s.deliveryDate;

  return (
    <div className="space-y-2">
      <Card className="space-y-4 p-4">
        <Field label="Marco inicial da contagem do prazo" htmlFor="sch-milestone" hint="O prazo só começa a correr quando este marco ocorrer.">
          <Select id="sch-milestone" value={s.startMilestone} onChange={(e) => setSched({ startMilestone: e.target.value as typeof s.startMilestone })}>
            {START_MILESTONES.map((m) => (
              <option key={m} value={m}>
                {m === "entrada_aprovacao" ? "Aprovação do projeto + pagamento da entrada" : m === "assinatura" ? "Assinatura do contrato" : m === "medicao_final" ? "Medição final no local" : "Outro (descrever)"}
              </option>
            ))}
          </Select>
        </Field>
        {s.startMilestone === "outro" ? (
          <Field label="Descreva o marco" htmlFor="sch-milestone-text" error={s.startMilestoneText.trim() ? undefined : "Obrigatório"}>
            <Input id="sch-milestone-text" value={s.startMilestoneText} onChange={(e) => setSched({ startMilestoneText: e.target.value })} />
          </Field>
        ) : (
          <p className="rounded-xl bg-secondary px-3 py-2 text-sm text-secondary-foreground">
            No contrato: o prazo conta a partir d{START_MILESTONE_LABELS[s.startMilestone]}.
          </p>
        )}
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="Prazo de fabricação" htmlFor="sch-lead" error={s.leadTime > 0 ? undefined : "Obrigatório para emitir"}>
            <NumberInput id="sch-lead" value={s.leadTime || null} maxDecimals={0} onChange={(v) => setSched({ leadTime: Math.max(0, Math.floor(v ?? 0)) })} suffix="dias" />
          </Field>
          <div className="pb-1.5">
            <Segmented ariaLabel="Unidade do prazo" value={s.leadUnit} onChange={(u) => setSched({ leadUnit: u })} options={[{ value: "uteis", label: "Úteis" }, { value: "corridos", label: "Corridos" }]} />
          </div>
        </div>
        {s.leadUnit === "uteis" && (
          <p className="text-xs text-muted-foreground">
            Dias úteis excluem sábados, domingos e {holidays.length} feriado(s) cadastrado(s) em Configurações.
          </p>
        )}
        <DateField id="sch-start" label="Data prevista de início" value={s.startDate} onChange={(v) => setSched({ startDate: v })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField
            id="sch-delivery"
            label="Data prevista de entrega"
            value={s.deliveryDate}
            onChange={(v) => setSched({ deliveryDate: v })}
            error={deliveryBeforeStart ? "Antes do início" : undefined}
          />
          <DateField
            id="sch-install"
            label="Data prevista de instalação"
            value={s.installationDate}
            onChange={(v) => setSched({ installationDate: v })}
            error={installBeforeDelivery ? "Antes da entrega" : undefined}
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={!canSuggest}
          onClick={() => {
            const delivery = addLeadTime(s.startDate!, s.leadTime, s.leadUnit, hset);
            setSched({ deliveryDate: delivery, installationDate: nextBusinessDay(addDays(delivery, 1), hset) });
          }}
        >
          <RefreshCw /> Sugerir entrega e instalação
        </Button>
        <p className="text-xs text-muted-foreground">As datas são previsões editáveis. A sugestão usa início + prazo (e feriados) e instalação no dia útil seguinte à entrega.</p>
        <Field label="Local da instalação" htmlFor="sch-loc">
          <Textarea id="sch-loc" value={s.installationLocation} onChange={(e) => setSched({ installationLocation: e.target.value })} className="min-h-16" placeholder="Se vazio, usa o endereço de entrega ou o endereço do cliente." />
        </Field>
        <Field label="Observações de logística" htmlFor="sch-log">
          <Textarea id="sch-log" value={s.logisticsNotes} onChange={(e) => setSched({ logisticsNotes: e.target.value })} className="min-h-16" />
        </Field>
      </Card>

      <SectionTitle>Garantia, atraso e cancelamento</SectionTitle>
      <Card className="space-y-4 p-4">
        <div className="flex items-start gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>Estes percentuais são <strong>parâmetros do contrato</strong> e devem passar por revisão jurídica. A garantia legal sempre vale, independentemente da contratual.</p>
        </div>
        <Field label="Garantia contratual adicional" htmlFor="t-warranty" hint="0 = sem garantia contratual adicional (vale só a legal).">
          <NumberInput id="t-warranty" value={t.warrantyMonths} maxDecimals={0} onChange={(v) => setTerms({ warrantyMonths: Math.max(0, Math.floor(v ?? 0)) })} suffix="meses" />
        </Field>
        {t.warrantyMonths > 0 && (
          <Field label="Detalhes da garantia contratual (opcional)" htmlFor="t-warranty-notes">
            <Input id="t-warranty-notes" value={t.warrantyNotes} onChange={(e) => setTerms({ warrantyNotes: e.target.value })} />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Multa por atraso de pagamento" htmlFor="t-fee" error={t.lateFeePercent > 2 ? "Acima de 2%: revise com advogado" : undefined}>
            <NumberInput id="t-fee" value={t.lateFeePercent} onChange={(v) => setTerms({ lateFeePercent: Math.max(0, v ?? 0) })} suffix="%" />
          </Field>
          <Field label="Juros de mora" htmlFor="t-int">
            <NumberInput id="t-int" value={t.interestMonthlyPercent} onChange={(v) => setTerms({ interestMonthlyPercent: Math.max(0, v ?? 0) })} suffix="% a.m." />
          </Field>
          <Field label="Tolerância de atraso da contratada" htmlFor="t-tol">
            <NumberInput id="t-tol" value={t.delayToleranceDays} maxDecimals={0} onChange={(v) => setTerms({ delayToleranceDays: Math.max(0, Math.floor(v ?? 0)) })} suffix="dias" />
          </Field>
          <Field label="Retenção no cancelamento" htmlFor="t-ret" hint="0 = só despesas comprovadas">
            <NumberInput id="t-ret" value={t.cancellationRetentionPercent} onChange={(v) => setTerms({ cancellationRetentionPercent: Math.max(0, v ?? 0) })} suffix="%" />
          </Field>
        </div>
      </Card>

      <SectionTitle>Condições especiais (opcionais)</SectionTitle>
      <div className="space-y-2">
        {content.specialConditions.map((sc) => (
          <Card key={sc.key} className="p-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`sc-${sc.key}`} className="min-w-0 flex-1 text-sm font-semibold">
                {SPECIAL_CONDITION_DEFS[sc.key].label}
              </label>
              <Switch
                id={`sc-${sc.key}`}
                checked={sc.enabled}
                onCheckedChange={(v) => update((c) => ({ ...c, specialConditions: c.specialConditions.map((x) => (x.key === sc.key ? { ...x, enabled: v } : x)) }))}
                aria-label={SPECIAL_CONDITION_DEFS[sc.key].label}
              />
            </div>
            {sc.enabled && (
              <Textarea
                aria-label={`Texto: ${SPECIAL_CONDITION_DEFS[sc.key].label}`}
                value={sc.text}
                onChange={(e) => update((c) => ({ ...c, specialConditions: c.specialConditions.map((x) => (x.key === sc.key ? { ...x, text: e.target.value } : x)) }))}
                className="mt-3 min-h-28"
              />
            )}
          </Card>
        ))}
      </div>
      <p className="px-1 text-xs text-muted-foreground">Essas condições descrevem o local e a obra; o contrato diz que elas não afastam obrigações legais da contratada nem direitos do cliente.</p>

      <SectionTitle>Assinatura</SectionTitle>
      <Card className="space-y-4 p-4">
        <Field label="Cidade do “Local e data”" htmlFor="sign-city">
          <Input id="sign-city" value={content.signingCity} onChange={(e) => update((c) => ({ ...c, signingCity: e.target.value }))} placeholder="Ex.: São Paulo/SP" />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="sign-wit" className="text-sm font-semibold">
            Incluir campos para duas testemunhas
          </label>
          <Switch id="sign-wit" checked={content.witnesses} onCheckedChange={(v) => update((c) => ({ ...c, witnesses: v }))} aria-label="Incluir testemunhas" />
        </div>
      </Card>
    </div>
  );
}

/* ===================== 5. Revisão ===================== */

const LEVEL_STYLE = {
  error: { icon: AlertTriangle, box: "border-destructive/30 bg-destructive-soft text-destructive", title: "Pendências obrigatórias (impedem emitir)" },
  warning: { icon: AlertTriangle, box: "border-warning/30 bg-warning-soft text-warning", title: "Atenção (não impedem emitir)" },
  info: { icon: Info, box: "border-border bg-secondary text-secondary-foreground", title: "Lembretes" },
} as const;

export function ReviewList({ review, onGoToStep }: { review: Review; onGoToStep: (step: ReviewItem["step"]) => void }) {
  const groups: Array<["error" | "warning" | "info", ReviewItem[]]> = [
    ["error", review.errors],
    ["warning", review.warnings],
    ["info", review.infos],
  ];
  return (
    <div className="space-y-3">
      {review.canIssue && (
        <div className="flex items-center gap-2 rounded-2xl border border-success/40 bg-success-soft p-3 text-sm font-semibold text-success">
          <CheckCircle2 className="size-5" /> Todos os campos obrigatórios estão preenchidos.
        </div>
      )}
      {groups.map(([level, items]) =>
        items.length === 0 ? null : (
          <div key={level} className={cn("space-y-2 rounded-2xl border p-3", LEVEL_STYLE[level].box)} data-testid={`review-${level}`}>
            <div className="flex items-center gap-2 text-sm font-bold">
              {React.createElement(LEVEL_STYLE[level].icon, { className: "size-4" })} {LEVEL_STYLE[level].title} ({items.length})
            </div>
            <ul className="space-y-1.5">
              {items.map((it) => (
                <li key={it.id} className="flex items-start justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1">{it.message}</span>
                  {it.step !== "revisao" && (
                    <button type="button" onClick={() => onGoToStep(it.step)} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold underline">
                      Corrigir
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}
