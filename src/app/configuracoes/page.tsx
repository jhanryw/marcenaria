"use client";
import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  HardDrive,
  ImagePlus,
  ShieldCheck,
  X,
  Info,
  Smartphone,
  Trash2,
  Upload,
} from "lucide-react";
import { useSettings } from "@/hooks/use-data";
import { saveSettings } from "@/db/repository";
import {
  APP_VERSION,
  buildBackup,
  backupFileName,
  importBackup,
  markBackupDone,
  parseBackup,
  serializeBackup,
  wipeAllData,
  type ImportMode,
  type ParseBackupResult,
} from "@/db/backup";
import { ensureSeeded } from "@/db/seed";
import { deleteAllContracts, scrubClientDataFromProjects } from "@/db/contracts";
import { documentStatus, formatDocument } from "@/contracts/validators";
import { processLogoFile } from "@/contracts/logo";
import { fixedNationalHolidays, mergeHolidays } from "@/contracts/holidays";
import { formatDateBR, isValidISODate } from "@/contracts/dates";
import type { Settings } from "@/domain/schema";
import { formatNumber } from "@/lib/money";
import { formatDateTime, daysSince } from "@/lib/format-date";
import { PageContainer, PageHeader, SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { MoneyInput, NumberInput } from "@/components/ui/number-input";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { usePwa } from "@/components/pwa-provider";

export default function SettingsPage() {
  const loaded = useSettings();
  const { toast } = useToast();
  const confirm = useConfirm();
  const pwa = usePwa();

  const [s, setS] = React.useState<Settings | null>(null);
  const dirty = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (loaded && !dirty.current) setS(loaded);
  }, [loaded]);

  const update = (patch: Partial<Settings>) => {
    setS((cur) => {
      if (!cur) return cur;
      const next = { ...cur, ...patch };
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        await saveSettings(next);
        dirty.current = false;
      }, 400);
      return next;
    });
  };

  const logoRef = React.useRef<HTMLInputElement>(null);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const [newHoliday, setNewHoliday] = React.useState("");

  /** Atualiza a empresa e mantém `companyName` (usado nos resumos) em sincronia com o nome fantasia. */
  const setCompany = (patch: Partial<Settings["company"]>) => {
    if (!s) return;
    const company = { ...s.company, ...patch };
    update({ company, companyName: company.tradeName.trim() || company.legalName.trim() });
  };

  async function onLogoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLogoError(null);
    try {
      setCompany({ logoDataUrl: await processLogoFile(file) });
    } catch (err) {
      setLogoError((err as Error).message);
    }
  }

  async function onDeleteContracts() {
    const ok = await confirm({
      title: "Excluir TODOS os contratos?",
      message: "Remove contratos (rascunhos, emitidos e assinados) deste aparelho, inclusive CPF/CNPJ e endereços neles. Faça backup antes. Não pode ser desfeito.",
      confirmLabel: "Excluir contratos",
      destructive: true,
    });
    if (!ok) return;
    const n = await deleteAllContracts();
    toast(`${n} contrato(s) excluído(s)`);
  }

  async function onScrubClients() {
    const ok = await confirm({
      title: "Apagar nomes e telefones dos orçamentos?",
      message: "Os orçamentos continuam, mas ficam sem o nome e o telefone do cliente. Contratos têm exclusão própria. Não pode ser desfeito.",
      confirmLabel: "Apagar dados",
      destructive: true,
    });
    if (!ok) return;
    const n = await scrubClientDataFromProjects();
    toast(`Dados de cliente removidos de ${n} orçamento(s)`);
  }

  /* ---------------- backup ---------------- */
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<(ParseBackupResult & { ok: true }) | null>(null);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onExport() {
    setBusy(true);
    try {
      const backup = await buildBackup();
      const text = serializeBackup(backup);
      const name = backupFileName();
      const file = new File([text], name, { type: "application/json" });
      const isIOS = pwa.isIOS;
      if (isIOS && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Backup Marcenaria" });
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
      await markBackupDone();
      toast(`Backup gerado: ${backup.data.projects.length} projeto(s)`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast("Não foi possível gerar o backup", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = parseBackup(text);
      if (!parsed.ok) {
        setImportError(parsed.error);
        return;
      }
      setPending(parsed);
    } catch {
      setImportError("Não foi possível ler o arquivo.");
    }
  }

  async function doImport(mode: ImportMode) {
    if (!pending) return;
    if (mode === "replace") {
      const ok = await confirm({
        title: "Substituir todos os dados?",
        message: "Todos os projetos, materiais e fitas atuais deste aparelho serão apagados e trocados pelo conteúdo do backup.",
        confirmLabel: "Substituir tudo",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const summary = await importBackup(pending.backup, mode);
      toast(
        mode === "replace"
          ? `Backup restaurado: ${summary.projects} projeto(s)`
          : `Mesclado: ${summary.projects} projeto(s) importados/atualizados`,
      );
      setPending(null);
    } catch {
      toast("Falha ao importar. Nenhum dado foi alterado.", "error");
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- armazenamento ---------------- */
  const [storage, setStorage] = React.useState<{ persisted: boolean | null; usage: number | null; quota: number | null }>({
    persisted: null,
    usage: null,
    quota: null,
  });
  const refreshStorage = React.useCallback(async () => {
    try {
      const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
      const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
      setStorage({ persisted, usage: est?.usage ?? null, quota: est?.quota ?? null });
    } catch {
      /* sem suporte */
    }
  }, []);
  React.useEffect(() => {
    void refreshStorage();
  }, [refreshStorage]);

  async function askPersist() {
    try {
      const ok = await navigator.storage.persist();
      toast(ok ? "Armazenamento protegido pelo navegador" : "O navegador não concedeu proteção extra", ok ? "success" : "info");
    } finally {
      void refreshStorage();
    }
  }

  async function onWipe() {
    const ok = await confirm({
      title: "Apagar TODOS os dados?",
      message: "Remove projetos, materiais, fitas e configurações deste aparelho. Faça um backup antes. Esta ação não pode ser desfeita.",
      confirmLabel: "Apagar tudo",
      destructive: true,
    });
    if (!ok) return;
    await wipeAllData();
    await ensureSeeded();
    dirty.current = false;
    toast("Dados apagados");
  }

  if (!s) {
    return (
      <>
        <PageHeader title="Configurações" />
        <PageContainer>
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        </PageContainer>
      </>
    );
  }

  const backupDays = daysSince(s.lastBackupAt);

  return (
    <>
      <PageHeader title="Configurações" subtitle="Padrões para novos orçamentos · salvo automaticamente" />
      <PageContainer className="space-y-2 pb-10">
        <SectionTitle>Dados da empresa</SectionTitle>
        <Card className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            Preencha uma vez: estes dados são copiados para cada contrato novo e aparecem no resumo do orçamento. Ficam só neste aparelho.
          </p>
          <Field label="Nome empresarial ou nome completo" htmlFor="co-legal">
            <Input id="co-legal" value={s.company.legalName} onChange={(e) => setCompany({ legalName: e.target.value })} placeholder="Ex.: Silva Móveis Planejados Ltda." />
          </Field>
          <Field label="Nome fantasia" htmlFor="co-trade" hint="Aparece nos resumos do orçamento.">
            <Input id="co-trade" value={s.company.tradeName} onChange={(e) => setCompany({ tradeName: e.target.value })} placeholder="Ex.: Silva Marcenaria" />
          </Field>
          <Field
            label="CPF ou CNPJ"
            htmlFor="co-doc"
            error={documentStatus(s.company.document) === "invalid" ? "Os dígitos não conferem. Confira o número." : undefined}
          >
            <Input
              id="co-doc"
              inputMode="numeric"
              value={s.company.document}
              onChange={(e) => setCompany({ document: e.target.value })}
              onBlur={(e) => setCompany({ document: formatDocument(e.target.value) })}
              placeholder="00.000.000/0000-00"
            />
          </Field>
          <Field label="Endereço completo" htmlFor="co-address">
            <Input id="co-address" value={s.company.address} onChange={(e) => setCompany({ address: e.target.value })} placeholder="Rua, número, bairro, CEP" autoComplete="off" />
          </Field>
          <div className="grid grid-cols-[1fr_5.5rem] gap-3">
            <Field label="Cidade" htmlFor="co-city">
              <Input id="co-city" value={s.company.city} onChange={(e) => setCompany({ city: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="UF" htmlFor="co-state">
              <Input id="co-state" value={s.company.state} maxLength={2} onChange={(e) => setCompany({ state: e.target.value.toUpperCase() })} autoComplete="off" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Telefone" htmlFor="co-phone">
              <Input id="co-phone" type="tel" inputMode="tel" value={s.company.phone} onChange={(e) => setCompany({ phone: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="E-mail" htmlFor="co-email">
              <Input id="co-email" type="email" inputMode="email" value={s.company.email} onChange={(e) => setCompany({ email: e.target.value })} autoComplete="off" />
            </Field>
          </div>
          <Field label="Nome do responsável" htmlFor="co-resp" hint="Aparece abaixo da assinatura da contratada.">
            <Input id="co-resp" value={s.company.responsible} onChange={(e) => setCompany({ responsible: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Chave Pix (opcional)" htmlFor="co-pix" hint="Informativo: aparece no contrato se Pix for uma forma de pagamento. O app não processa pagamentos.">
            <Input id="co-pix" value={s.company.pixKey} onChange={(e) => setCompany({ pixKey: e.target.value })} autoComplete="off" />
          </Field>

          <div className="space-y-2">
            <div className="text-sm font-medium">Logotipo (opcional)</div>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
                {s.company.logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.company.logoDataUrl} alt="Logotipo da empresa" className="max-h-full max-w-full object-contain" />
                ) : (
                  <ImagePlus className="size-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button size="sm" variant="outline" onClick={() => logoRef.current?.click()}>
                  {s.company.logoDataUrl ? "Trocar" : "Escolher imagem"}
                </Button>
                {s.company.logoDataUrl && (
                  <Button size="sm" variant="ghost" onClick={() => setCompany({ logoDataUrl: null })}>
                    <X /> Remover
                  </Button>
                )}
              </div>
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={onLogoChosen} data-testid="logo-file" />
            </div>
            <p className="text-xs text-muted-foreground">
              A imagem é reduzida (máx. 480×200 px, ~180 KB) e guardada no aparelho, para funcionar offline e entrar no backup.
            </p>
            {logoError && <p role="alert" className="text-xs font-medium text-destructive">{logoError}</p>}
          </div>
        </Card>

        <SectionTitle>Preço e mão de obra</SectionTitle>
        <Card className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Markup padrão" hint="Sobre o custo total">
              <NumberInput value={s.defaultMarkupPercent} onChange={(v) => update({ defaultMarkupPercent: v ?? 0 })} suffix="%" />
            </Field>
            <Field label="Custo da hora" hint="Mão de obra por hora">
              <MoneyInput cents={s.defaultHourlyCents} onChange={(v) => update({ defaultHourlyCents: v ?? 0 })} />
            </Field>
          </div>
        </Card>

        <SectionTitle>Padrões de chapa e fita</SectionTitle>
        <Card className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Comprimento da chapa">
              <NumberInput value={s.defaultSheetLengthMm} onChange={(v) => update({ defaultSheetLengthMm: v ?? 0 })} suffix="mm" />
            </Field>
            <Field label="Largura da chapa">
              <NumberInput value={s.defaultSheetWidthMm} onChange={(v) => update({ defaultSheetWidthMm: v ?? 0 })} suffix="mm" />
            </Field>
          </div>
          <Field label="Preço por chapa (novos materiais)">
            <MoneyInput cents={s.defaultSheetPriceCents} onChange={(v) => update({ defaultSheetPriceCents: v ?? 0 })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Margem nas extremidades">
              <NumberInput value={s.defaultMarginMm} onChange={(v) => update({ defaultMarginMm: v ?? 0 })} suffix="mm" />
            </Field>
            <Field label="Espessura da serra">
              <NumberInput value={s.defaultKerfMm} onChange={(v) => update({ defaultKerfMm: v ?? 0 })} suffix="mm" />
            </Field>
          </div>
          <Field label="Perda padrão de fita de borda" hint="Emendas, refiles e sobras">
            <NumberInput value={s.defaultTapeWastePercent} onChange={(v) => update({ defaultTapeWastePercent: v ?? 0 })} suffix="%" />
          </Field>
        </Card>

        <SectionTitle>Sobras reaproveitáveis</SectionTitle>
        <Card className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">
            Uma sobra só é destacada como reaproveitável se tiver pelo menos estas medidas.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Menor lado mínimo">
              <NumberInput value={s.remnantMinShortMm} onChange={(v) => update({ remnantMinShortMm: v ?? 0 })} suffix="mm" />
            </Field>
            <Field label="Maior lado mínimo">
              <NumberInput value={s.remnantMinLongMm} onChange={(v) => update({ remnantMinLongMm: v ?? 0 })} suffix="mm" />
            </Field>
          </div>
        </Card>

        <SectionTitle>Reserva de material (novos projetos)</SectionTitle>
        <Card className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <Select
                value={s.defaultReserve.mode}
                onChange={(e) => update({ defaultReserve: { ...s.defaultReserve, mode: e.target.value as Settings["defaultReserve"]["mode"] } })}
              >
                <option value="none">Sem reserva</option>
                <option value="percent">Percentual</option>
                <option value="sheets">Chapas extras</option>
              </Select>
            </Field>
            <Field label="Valor">
              <NumberInput
                value={s.defaultReserve.value}
                disabled={s.defaultReserve.mode === "none"}
                onChange={(v) => update({ defaultReserve: { ...s.defaultReserve, value: v ?? 0 } })}
                suffix={s.defaultReserve.mode === "percent" ? "%" : "chapas"}
              />
            </Field>
          </div>
        </Card>

        <SectionTitle>Impostos, comissões e indiretos (padrão)</SectionTitle>
        <Card className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">
            Percentuais sobre o preço de venda, usados para estimar quanto sobra depois dessas deduções. Deixe zero se ainda não souber.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Impostos">
              <NumberInput
                value={s.defaultDeductions.taxPercent}
                onChange={(v) => update({ defaultDeductions: { ...s.defaultDeductions, taxPercent: v ?? 0 } })}
                suffix="%"
              />
            </Field>
            <Field label="Comissões">
              <NumberInput
                value={s.defaultDeductions.commissionPercent}
                onChange={(v) => update({ defaultDeductions: { ...s.defaultDeductions, commissionPercent: v ?? 0 } })}
                suffix="%"
              />
            </Field>
            <Field label="Indiretos">
              <NumberInput
                value={s.defaultDeductions.overheadPercent}
                onChange={(v) => update({ defaultDeductions: { ...s.defaultDeductions, overheadPercent: v ?? 0 } })}
                suffix="%"
              />
            </Field>
          </div>
        </Card>

        <SectionTitle>Contratos: padrões</SectionTitle>
        <Card className="space-y-4 p-4">
          <p className="text-sm text-muted-foreground">
            Valores iniciais dos contratos novos (editáveis em cada contrato). <strong>Peça revisão jurídica</strong>: para consumidores, a lei costuma limitar a multa por atraso a 2%.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Multa por atraso">
              <NumberInput value={s.contractDefaults.lateFeePercent} onChange={(v) => update({ contractDefaults: { ...s.contractDefaults, lateFeePercent: v ?? 0 } })} suffix="%" />
            </Field>
            <Field label="Juros de mora">
              <NumberInput value={s.contractDefaults.interestMonthlyPercent} onChange={(v) => update({ contractDefaults: { ...s.contractDefaults, interestMonthlyPercent: v ?? 0 } })} suffix="% a.m." />
            </Field>
            <Field label="Tolerância de atraso" hint="Dias até o cliente poder notificar">
              <NumberInput value={s.contractDefaults.delayToleranceDays} maxDecimals={0} onChange={(v) => update({ contractDefaults: { ...s.contractDefaults, delayToleranceDays: Math.max(0, Math.floor(v ?? 0)) } })} suffix="dias" />
            </Field>
            <Field label="Retenção no cancelamento" hint="0 = só despesas comprovadas">
              <NumberInput value={s.contractDefaults.cancellationRetentionPercent} onChange={(v) => update({ contractDefaults: { ...s.contractDefaults, cancellationRetentionPercent: v ?? 0 } })} suffix="%" />
            </Field>
          </div>
          <Field label="Garantia contratual adicional" hint="Além da garantia legal. 0 = nenhuma garantia contratual adicional.">
            <NumberInput value={s.contractDefaults.warrantyMonths} maxDecimals={0} onChange={(v) => update({ contractDefaults: { ...s.contractDefaults, warrantyMonths: Math.max(0, Math.floor(v ?? 0)) } })} suffix="meses" />
          </Field>
        </Card>

        <SectionTitle>Feriados (prazos em dias úteis)</SectionTitle>
        <Card className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">
            Usados só para calcular datas em dias úteis (sem internet). Os feriados nacionais de data fixa podem ser adicionados de uma vez; Carnaval,
            Sexta-feira Santa, Corpus Christi e feriados locais você informa à mão.
          </p>
          <div className="flex gap-2">
            <Input type="date" value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)} aria-label="Novo feriado" />
            <Button
              variant="outline"
              disabled={!isValidISODate(newHoliday)}
              onClick={() => {
                update({ holidays: mergeHolidays(s.holidays, [newHoliday]) });
                setNewHoliday("");
              }}
            >
              Adicionar
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {[0, 1].map((k) => {
              const y = new Date().getFullYear() + k;
              return (
                <Button key={y} size="sm" variant="secondary" onClick={() => update({ holidays: mergeHolidays(s.holidays, fixedNationalHolidays(y)) })}>
                  + Nacionais fixos {y}
                </Button>
              );
            })}
          </div>
          {s.holidays.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {s.holidays.map((h) => (
                <li key={h} className="flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-sm">
                  {formatDateBR(h)}
                  <button type="button" aria-label={`Remover feriado ${formatDateBR(h)}`} className="flex size-7 items-center justify-center rounded-full hover:bg-border" onClick={() => update({ holidays: s.holidays.filter((x) => x !== h) })}>
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div id="backup" className="scroll-mt-20" />
        <SectionTitle>Backup e restauração</SectionTitle>
        <Card className="space-y-4 p-4">
          <div className="flex items-start gap-3 rounded-xl bg-warning-soft p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <p>
              Seus dados ficam <strong>somente neste aparelho</strong> (no navegador). Limpar dados do navegador, usar a navegação
              anônima, desinstalar o app ou trocar de celular <strong>apaga tudo</strong>. Faça backup com frequência e guarde o arquivo
              em outro lugar (e-mail, nuvem, computador).
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {s.lastBackupAt
              ? `Último backup: ${formatDateTime(s.lastBackupAt)}${backupDays !== null && backupDays > 0 ? ` (há ${backupDays} dia${backupDays === 1 ? "" : "s"})` : ""}.`
              : "Nenhum backup feito ainda."}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={onExport} disabled={busy} size="lg">
              <Download /> Exportar backup (JSON)
            </Button>
            <Button variant="outline" size="lg" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload /> Importar backup
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFileChosen} data-testid="import-file" />
          </div>
          {importError && (
            <p role="alert" className="rounded-xl bg-destructive-soft p-3 text-sm font-medium text-destructive">
              {importError}
            </p>
          )}
        </Card>

        <SectionTitle>Armazenamento</SectionTitle>
        <Card className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <HardDrive className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="min-w-0 text-sm">
              <p>
                Proteção contra limpeza automática:{" "}
                <strong>{storage.persisted === null ? "não informado pelo navegador" : storage.persisted ? "ativa" : "não ativa"}</strong>
              </p>
              {storage.usage !== null && storage.quota !== null && (
                <p className="text-muted-foreground">
                  Em uso: {formatNumber(storage.usage / 1024 / 1024, 2)} MB de {formatNumber(storage.quota / 1024 / 1024, 0)} MB disponíveis
                </p>
              )}
            </div>
          </div>
          {storage.persisted === false && (
            <Button variant="outline" onClick={askPersist}>
              Pedir proteção ao navegador
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Mesmo com a proteção ativa, ela não substitui o backup: o usuário ou o sistema ainda podem apagar os dados.
          </p>
        </Card>

        <SectionTitle>Aplicativo</SectionTitle>
        <Card className="space-y-3 p-4 text-sm">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="min-w-0 space-y-1">
              <p>
                Estado:{" "}
                <strong>{pwa.isStandalone ? "instalado (tela inicial)" : "aberto no navegador"}</strong>
                {" · "}
                Offline: <strong>{pwa.offlineReady ? "pronto" : "preparando…"}</strong>
              </p>
              {!pwa.isStandalone && pwa.canInstall && (
                <Button size="sm" onClick={() => pwa.promptInstall()}>
                  Instalar aplicativo
                </Button>
              )}
              {!pwa.isStandalone && !pwa.canInstall && pwa.isIOS && (
                <p className="text-muted-foreground">
                  No iPhone/iPad: toque em <strong>Compartilhar</strong> (quadrado com seta) → <strong>Adicionar à Tela de Início</strong>. Use o Safari.
                </p>
              )}
              {!pwa.isStandalone && !pwa.canInstall && !pwa.isIOS && (
                <p className="text-muted-foreground">
                  No Android/Chrome: menu ⋮ → <strong>Instalar aplicativo</strong> (ou “Adicionar à tela inicial”).
                </p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3 text-muted-foreground">
            <Info className="mt-0.5 size-5 shrink-0" />
            <p>
              Versão {APP_VERSION}. Atualizações do aplicativo <strong>não apagam</strong> seus orçamentos: o código do app e os seus dados ficam em
              áreas separadas do navegador.
            </p>
          </div>
        </Card>

        <SectionTitle>Privacidade e dados pessoais</SectionTitle>
        <Card className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="space-y-2 text-sm">
              <p>
                Contratos e orçamentos (inclusive CPF/CNPJ, endereços e telefones) ficam <strong>somente neste aparelho</strong>. Nada é enviado a servidores,
                e o app não usa analytics. O PDF é gerado no próprio aparelho.
              </p>
              <p className="text-muted-foreground">
                Os dados <strong>não são criptografados</strong> pelo aplicativo: quem tiver acesso ao aparelho desbloqueado, ou ao arquivo de backup JSON, pode lê-los.
                Proteja o aparelho com senha e guarde backups em local seguro.
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="destructive-outline" onClick={onDeleteContracts}>
              <Trash2 /> Excluir todos os contratos
            </Button>
            <Button variant="destructive-outline" onClick={onScrubClients}>
              <Trash2 /> Apagar nomes e telefones dos orçamentos
            </Button>
          </div>
        </Card>

        <SectionTitle>Zona de perigo</SectionTitle>
        <Card className="p-4">
          <Button variant="destructive-outline" onClick={onWipe}>
            <Trash2 /> Apagar todos os dados
          </Button>
        </Card>
      </PageContainer>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        {pending && (
          <DialogContent title="Importar backup" description={`Criado em ${formatDateTime(pending.backup.exportedAt)}`}>
            <DialogBody className="space-y-3 text-sm">
              <div className="flex items-center gap-2 rounded-xl bg-success-soft p-3 font-medium text-success">
                <CheckCircle2 className="size-5" /> Arquivo válido
                {pending.migratedFrom !== null && ` (migrado da versão ${pending.migratedFrom})`}
              </div>
              <ul className="list-inside list-disc text-muted-foreground">
                <li>{pending.backup.data.projects.length} projeto(s)</li>
                <li>{pending.backup.data.sheetMaterials.length} chapa(s) no catálogo</li>
                <li>{pending.backup.data.edgeTapes.length} fita(s) no catálogo</li>
                <li>{pending.backup.data.contracts.length} contrato(s)</li>
              </ul>
              <p>
                <strong>Mesclar</strong> adiciona o que falta e mantém a versão mais recente de cada item.{" "}
                <strong>Substituir</strong> apaga tudo o que existe aqui e restaura o backup.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPending(null)}>
                Cancelar
              </Button>
              <Button variant="destructive-outline" onClick={() => doImport("replace")} disabled={busy}>
                Substituir tudo
              </Button>
              <Button onClick={() => doImport("merge")} disabled={busy}>
                Mesclar
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
