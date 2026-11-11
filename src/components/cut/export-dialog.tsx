"use client";
import * as React from "react";
import { AlertTriangle, CheckCircle2, Download, Eye, FileSpreadsheet, ListChecks, Loader2, Share2 } from "lucide-react";
import type { Project } from "@/domain/schema";
import { useSettings } from "@/hooks/use-data";
import { buildExportModel, defaultReference, type ExportModel } from "@/export/model";
import { GENERIC_CSV_ID, exportFileName, getPartsExporter, listPartsExporters } from "@/export/exporters";
import { generateCutPlanPdf, layoutCutPlanPreview, type PlanMode } from "@/export/pdf/generate";
import { loadFontBytes } from "@/contracts/pdf/fonts";
import type { LaidOutDocument } from "@/contracts/pdf/layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { PagesView } from "@/components/contract/contract-preview";
import { downloadFile, shareFile } from "./file-actions";

type Kind = "plano" | "lista" | "csv";

const SHARE_TEXT = "Plano de corte para validação. Estimado por algoritmo heurístico, sujeito à validação técnica da madeireira antes da execução. Medidas em milímetros.";

/** "Exportar para madeireira": validação, pré-visualização, download e compartilhamento. */
export function ExportDialog({ project, open, onOpenChange }: { project: Project; open: boolean; onOpenChange: (o: boolean) => void }) {
  const settings = useSettings();
  const { toast } = useToast();
  const [kind, setKind] = React.useState<Kind>("plano");
  const [name, setName] = React.useState(project.name);
  const [reference, setReference] = React.useState(defaultReference(project));
  const [includeContact, setIncludeContact] = React.useState(false);
  const [exporterId, setExporterId] = React.useState(GENERIC_CSV_ID);
  const [busy, setBusy] = React.useState<null | "download" | "share" | "preview">(null);
  const [preview, setPreview] = React.useState<{ layout?: LaidOutDocument; csv?: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setKind("plano");
      setName(project.name);
      setReference(defaultReference(project));
      setIncludeContact(false);
      setPreview(null);
      setError(null);
    }
    // só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const company = settings?.companyName || settings?.company.tradeName || settings?.company.legalName || "";
  const contact = { phone: settings?.company.phone, email: settings?.company.email };

  // o modelo é recalculado a partir do projeto atual (plano + validação) sempre que algo muda
  const model: ExportModel = React.useMemo(
    () => buildExportModel(project, { projectName: name, reference, companyName: company, contact, includeContact }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, name, reference, includeContact, company, contact.phone, contact.email],
  );
  React.useEffect(() => setPreview(null), [kind, model]);

  const exporter = getPartsExporter(exporterId) ?? getPartsExporter(GENERIC_CSV_ID)!;
  const blocked = kind === "plano" && !model.valid;
  const hasContact = !!(contact.phone || contact.email);

  async function build(): Promise<{ bytes: Uint8Array | string; fileName: string; mime: string }> {
    if (kind === "csv") return { bytes: exporter.build(model), fileName: exportFileName(model, "lista", exporter.extension), mime: exporter.mimeType };
    const mode: PlanMode = kind === "plano" ? "plan" : "list";
    const fonts = await loadFontBytes();
    const { bytes } = await generateCutPlanPdf(model, mode, fonts);
    return { bytes, fileName: exportFileName(model, kind === "plano" ? "plano" : "lista", "pdf"), mime: "application/pdf" };
  }

  async function run(action: "download" | "share") {
    if (blocked) return;
    setBusy(action);
    setError(null);
    try {
      const f = await build();
      if (action === "download") {
        downloadFile(f.bytes, f.fileName, f.mime);
        toast("Arquivo gerado");
      } else {
        const r = await shareFile(f.bytes, f.fileName, f.mime, { title: f.fileName, text: SHARE_TEXT });
        if (r === "downloaded") toast("Compartilhamento indisponível aqui — arquivo baixado");
      }
    } catch {
      setError("Não foi possível gerar o arquivo.");
    } finally {
      setBusy(null);
    }
  }

  async function showPreview() {
    if (blocked) return;
    setBusy("preview");
    setError(null);
    try {
      if (kind === "csv") setPreview({ csv: exporter.build(model) });
      else setPreview({ layout: await layoutCutPlanPreview(model, kind === "plano" ? "plan" : "list", await loadFontBytes()) });
    } catch {
      setError("Não foi possível montar a pré-visualização.");
    } finally {
      setBusy(null);
    }
  }

  const csvRows = preview?.csv ? preview.csv.replace(/^﻿/, "").split("\r\n").filter(Boolean).map((l) => l.split(";")) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Exportar para madeireira"
        description="PDF e lista de peças com medidas em milímetros, sem preços, custos ou dados do cliente."
        className="h-[94dvh] md:h-[90dvh] md:max-w-4xl"
      >
        <DialogBody className="space-y-4">
          <Segmented
            ariaLabel="O que exportar"
            value={kind}
            onChange={setKind}
            options={[
              { value: "plano", label: "Plano completo (PDF)" },
              { value: "lista", label: "Só lista de peças (PDF)" },
              { value: "csv", label: "Lista de peças (CSV)" },
            ]}
          />

          {/* problemas encontrados na validação */}
          {!model.valid && (
            <div role="alert" className="space-y-2 rounded-2xl border border-destructive/30 bg-destructive-soft p-4 text-sm text-destructive" data-testid="export-problems">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="size-5" />
                {kind === "plano" ? "Exportação do plano bloqueada: o plano de corte não está completo e válido" : "Plano de corte NÃO validado — a lista abaixo não é um plano executável"}
              </div>
              <ul className="list-inside list-disc space-y-1">
                {model.problems.slice(0, 10).map((p) => (
                  <li key={p.id}>{p.materialName ? `${p.materialName}: ` : ""}{p.message}</li>
                ))}
              </ul>
              {model.problems.length > 10 && <p>… e mais {model.problems.length - 10} problema(s).</p>}
              {kind !== "plano" && <p className="text-destructive/90">O documento levará um aviso claro de “plano não validado”.</p>}
            </div>
          )}
          {model.valid && (
            <div className="flex items-start gap-2 rounded-2xl border border-success/40 bg-success-soft p-3 text-sm text-success" data-testid="export-valid">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <p>
                <strong>Plano validado:</strong> {model.pieces.reduce((a, p) => a + p.quantity, 0)} peças posicionadas em {model.materials.reduce((a, m) => a + m.sheetsInPlan, 0)} chapa(s), sem sobreposição, dentro das margens, respeitando rotação e veio.
              </p>
            </div>
          )}

          <div className="rounded-xl bg-warning-soft p-3 text-sm text-warning">
            <strong>Estimativa heurística.</strong> O plano é calculado por algoritmo e está sujeito à validação técnica da madeireira antes da execução.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome do projeto no documento" htmlFor="ex-name" hint="Pode ser trocado para não expor o nome do cliente.">
              <Input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Referência" htmlFor="ex-ref">
              <Input id="ex-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
          {hasContact && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <label htmlFor="ex-contact" className="min-w-0 text-sm">
                <span className="font-semibold">Incluir contato da marcenaria</span>
                <span className="block text-xs text-muted-foreground">Telefone e e-mail da sua empresa (nunca do cliente).</span>
              </label>
              <Switch id="ex-contact" checked={includeContact} onCheckedChange={setIncludeContact} aria-label="Incluir contato da marcenaria" />
            </div>
          )}
          {kind === "csv" && listPartsExporters().length > 1 && (
            <Field label="Formato">
              <Select value={exporterId} onChange={(e) => setExporterId(e.target.value)}>
                {listPartsExporters().map((x) => (
                  <option key={x.id} value={x.id}>{x.label}</option>
                ))}
              </Select>
            </Field>
          )}
          {kind === "csv" && <p className="text-xs text-muted-foreground">{exporter.description} Unidade: milímetros (mm).</p>}

          {error && <p role="alert" className="rounded-xl bg-destructive-soft p-3 text-sm font-medium text-destructive">{error}</p>}

          {busy === "preview" && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" /> Montando pré-visualização…
            </div>
          )}
          {preview?.layout && (
            <div className="-mx-2 rounded-2xl bg-[#d9dbd6] p-3" data-testid="export-preview">
              <PagesView layout={preview.layout} maxWidth={1000} label="do plano de corte" testId="export" />
            </div>
          )}
          {preview?.csv && (
            <div className="space-y-2" data-testid="export-csv-preview">
              <p className="text-sm font-semibold">{Math.max(0, csvRows.length - 1)} linha(s) de peças · medidas em mm</p>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full table-fixed text-left text-[11px]">
                  <thead className="bg-muted">
                    <tr>
                      {[0, 1, 2, 5, 6, 7].map((i) => (
                        <th key={i} className="break-words px-2 py-1.5 font-semibold">{csvRows[0]?.[i]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {csvRows.slice(1, 13).map((r, ri) => (
                      <tr key={ri}>
                        {[0, 1, 2, 5, 6, 7].map((i) => (
                          <td key={i} className="break-words px-2 py-1">{r[i]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvRows.length > 13 && <p className="text-xs text-muted-foreground">Mostrando as primeiras 12 de {csvRows.length - 1} linhas.</p>}
            </div>
          )}
        </DialogBody>
        <DialogFooter className="sm:flex-wrap">
          <Button variant="outline" onClick={showPreview} disabled={blocked || busy !== null || project.pieces.length === 0} data-testid="export-preview-btn">
            <Eye /> Pré-visualizar
          </Button>
          <Button variant="outline" onClick={() => run("download")} disabled={blocked || busy !== null || project.pieces.length === 0} data-testid="export-download">
            {busy === "download" ? <Loader2 className="animate-spin" /> : kind === "csv" ? <FileSpreadsheet /> : kind === "lista" ? <ListChecks /> : <Download />}
            Baixar {kind === "csv" ? "CSV" : "PDF"}
          </Button>
          <Button onClick={() => run("share")} disabled={blocked || busy !== null || project.pieces.length === 0} data-testid="export-share">
            {busy === "share" ? <Loader2 className="animate-spin" /> : <Share2 />} Compartilhar com a madeireira
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

