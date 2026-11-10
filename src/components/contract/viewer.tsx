"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, CopyPlus, Download, Eye, FileSignature, Loader2, Share2, Trash2 } from "lucide-react";
import type { Contract } from "@/domain/schema";
import { cancelContract, createRevision, deleteContract, listContractsByProject, markContractSigned } from "@/db/contracts";
import { formatContractNumber } from "@/contracts/build-contract";
import { formatDateBR, todayISO } from "@/contracts/dates";
import { describeDue, downPaymentCents, paymentSummary } from "@/contracts/payment";
import { formatDateTime } from "@/lib/format-date";
import { formatBRL } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { ContractStatusBadge } from "./status-badge";
import { ContractPreviewDialog } from "./contract-preview";
import { downloadPdf, makePdf, sharePdf } from "./pdf-actions";

/** Contrato emitido / assinado / cancelado: somente leitura. */
export function ContractViewer({ contract, onChanged }: { contract: Contract; onChanged: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [signOpen, setSignOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [signDate, setSignDate] = React.useState(todayISO());
  const [signNote, setSignNote] = React.useState("");
  const [cancelReason, setCancelReason] = React.useState("");
  const [busy, setBusy] = React.useState<null | "download" | "share">(null);
  const [superseded, setSuperseded] = React.useState(false);

  const c = contract.issued?.content ?? contract.content;
  const pay = c.payment;
  const sum = paymentSummary(pay);
  const numberLabel = formatContractNumber(contract.number, contract.revision);

  React.useEffect(() => {
    let alive = true;
    listContractsByProject(contract.projectId).then((all) => {
      if (alive) setSuperseded(all.some((x) => x.previousContractId === contract.id && x.status !== "cancelado"));
    });
    return () => {
      alive = false;
    };
  }, [contract.id, contract.projectId]);

  async function run(kind: "download" | "share") {
    setBusy(kind);
    try {
      const { bytes, fileName } = await makePdf(contract);
      if (kind === "download") {
        downloadPdf(bytes, fileName);
        toast("PDF gerado");
      } else {
        const r = await sharePdf(bytes, fileName);
        if (r === "downloaded") toast("Compartilhamento indisponível aqui — PDF baixado");
      }
    } catch {
      toast("Não foi possível gerar o PDF", "error");
    } finally {
      setBusy(null);
    }
  }

  async function onRevision() {
    const rev = await createRevision(contract.id);
    toast(`Revisão ${rev.revision} criada como rascunho`);
    router.push(`/contrato/?id=${encodeURIComponent(rev.id)}`);
  }

  async function onDelete() {
    const ok = await confirm({
      title: "Excluir este contrato?",
      message: "O contrato e os dados pessoais nele (CPF/CNPJ, endereços) serão apagados deste aparelho. Não pode ser desfeito; faça backup antes se precisar guardar.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    await deleteContract(contract.id);
    toast("Contrato excluído");
    router.push(`/contratos/?projeto=${encodeURIComponent(contract.projectId)}`);
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Contrato nº {numberLabel}</div>
            <h2 className="text-lg font-bold leading-tight">{c.client.name || "Sem cliente"}</h2>
            <p className="text-sm text-muted-foreground">{contract.projectName}</p>
          </div>
          <ContractStatusBadge status={contract.status} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Valor</dt>
          <dd className="text-right font-bold tabular" data-testid="viewer-total">{formatBRL(pay.totalCents)}</dd>
          <dt className="text-muted-foreground">Emitido em</dt>
          <dd className="text-right">{contract.issuedAt ? formatDateTime(contract.issuedAt) : "—"}</dd>
          {contract.signedAt && (
            <>
              <dt className="text-muted-foreground">Assinatura registrada</dt>
              <dd className="text-right">{formatDateBR(contract.signedAt)}</dd>
            </>
          )}
          {contract.cancelledAt && (
            <>
              <dt className="text-muted-foreground">Cancelado em</dt>
              <dd className="text-right">{formatDateTime(contract.cancelledAt)}</dd>
            </>
          )}
        </dl>
        {contract.signedNote && <p className="rounded-xl bg-secondary p-2 text-sm">Nota: {contract.signedNote}</p>}
        {contract.cancelReason && <p className="rounded-xl bg-destructive-soft p-2 text-sm text-destructive">Motivo: {contract.cancelReason}</p>}
        {superseded && <p className="rounded-xl bg-warning-soft p-2 text-sm text-warning">Há uma revisão mais nova deste contrato.</p>}
        {contract.status === "emitido" && (
          <p className="text-xs text-muted-foreground">
            “Emitido” significa que o PDF definitivo foi gerado. Ele só passa a “Assinado” quando você registrar manualmente a assinatura; o aplicativo não verifica
            a autenticidade de assinaturas.
          </p>
        )}
      </Card>

      <Card className="space-y-1 p-4 text-sm">
        <div className="font-semibold">Pagamento</div>
        <div className="flex justify-between"><span>Entrada</span><span className="tabular">{downPaymentCents(pay) > 0 ? `${formatBRL(downPaymentCents(pay))} · ${describeDue(pay.downTrigger, pay.downDueDate)}` : "—"}</span></div>
        {pay.installments.map((i, k) => (
          <div key={i.id} className="flex justify-between gap-3"><span>Parcela {k + 1}/{pay.installments.length}</span><span className="text-right tabular">{formatBRL(i.amountCents)} · {describeDue(i.trigger, i.dueDate)}</span></div>
        ))}
        <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="tabular">{formatBRL(sum.sumCents)}</span></div>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="outline" size="lg" onClick={() => setPreviewOpen(true)}>
          <Eye /> Visualizar contrato
        </Button>
        <Button size="lg" onClick={() => run("download")} disabled={busy !== null}>
          {busy === "download" ? <Loader2 className="animate-spin" /> : <Download />} Baixar PDF
        </Button>
        <Button size="lg" variant="secondary" onClick={() => run("share")} disabled={busy !== null}>
          {busy === "share" ? <Loader2 className="animate-spin" /> : <Share2 />} Compartilhar PDF
        </Button>
        <Button size="lg" variant="outline" onClick={onRevision}>
          <CopyPlus /> Nova revisão
        </Button>
        {contract.status === "emitido" && (
          <Button size="lg" variant="outline" onClick={() => setSignOpen(true)}>
            <FileSignature /> Registrar assinatura
          </Button>
        )}
        {contract.status !== "cancelado" && (
          <Button size="lg" variant="destructive-outline" onClick={() => setCancelOpen(true)}>
            <Ban /> Cancelar contrato
          </Button>
        )}
        <Button size="lg" variant="destructive-outline" onClick={onDelete}>
          <Trash2 /> Excluir
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        <Link href={`/contratos/?projeto=${encodeURIComponent(contract.projectId)}`} className="font-semibold text-primary underline">
          Ver todos os contratos deste projeto
        </Link>
      </p>

      <ContractPreviewDialog contract={contract} open={previewOpen} onOpenChange={setPreviewOpen} />

      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent title="Registrar assinatura" description="Registro manual. O app não verifica nem certifica assinaturas.">
          <DialogBody className="space-y-4">
            <Field label="Data da assinatura" htmlFor="sign-date">
              <Input id="sign-date" type="date" value={signDate} onChange={(e) => setSignDate(e.target.value)} />
            </Field>
            <Field label="Observação (opcional)" htmlFor="sign-note">
              <Textarea id="sign-note" value={signNote} onChange={(e) => setSignNote(e.target.value)} placeholder="Ex.: assinado em papel; via do cliente entregue." className="min-h-20" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOpen(false)}>Voltar</Button>
            <Button
              disabled={!signDate}
              onClick={async () => {
                await markContractSigned(contract.id, { date: signDate, note: signNote });
                setSignOpen(false);
                toast("Assinatura registrada");
                onChanged();
              }}
            >
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent title="Cancelar contrato" description="O contrato continua guardado, marcado como cancelado.">
          <DialogBody className="space-y-4">
            <Field label="Motivo (opcional)" htmlFor="cancel-reason">
              <Textarea id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="min-h-20" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Voltar</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await cancelContract(contract.id, cancelReason);
                setCancelOpen(false);
                toast("Contrato cancelado");
                onChanged();
              }}
            >
              Cancelar contrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
