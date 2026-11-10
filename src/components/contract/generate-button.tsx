"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { FilePlus2, FileText, Loader2 } from "lucide-react";
import { getDb } from "@/db/db";
import { createContractFromProject } from "@/db/contracts";
import { formatContractNumber } from "@/contracts/build-contract";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

/** "Gerar contrato": cria um rascunho com os dados do orçamento (ou oferece continuar um rascunho existente). */
export function GenerateContractButton({ projectId, className }: { projectId: string; className?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [askOpen, setAskOpen] = React.useState(false);
  const contracts = useLiveQuery(() => getDb().contracts.where("projectId").equals(projectId).toArray(), [projectId], undefined);
  const drafts = (contracts ?? []).filter((c) => c.status === "rascunho");

  async function create() {
    setBusy(true);
    try {
      const c = await createContractFromProject(projectId);
      router.push(`/contrato/?id=${encodeURIComponent(c.id)}`);
    } catch {
      toast("Não foi possível criar o contrato", "error");
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="lg" className={className} disabled={busy || contracts === undefined} onClick={() => (drafts.length > 0 ? setAskOpen(true) : create())} data-testid="generate-contract">
        {busy ? <Loader2 className="animate-spin" /> : <FilePlus2 />} Gerar contrato
      </Button>
      <Dialog open={askOpen} onOpenChange={setAskOpen}>
        <DialogContent title="Já existe um rascunho" description="Você pode continuar de onde parou ou começar um contrato novo.">
          <DialogBody className="space-y-2">
            {drafts.map((d) => (
              <Link
                key={d.id}
                href={`/contrato/?id=${encodeURIComponent(d.id)}`}
                className="flex items-center gap-3 rounded-xl border border-border p-3 active:bg-muted"
              >
                <FileText className="size-5 shrink-0 text-primary" />
                <span className="min-w-0 text-sm">
                  <strong>Contrato nº {formatContractNumber(d.number, d.revision)}</strong>
                  <span className="block truncate text-muted-foreground">{d.content.client.name || "Sem cliente"} · continuar rascunho</span>
                </span>
              </Link>
            ))}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAskOpen(false)}>
              Fechar
            </Button>
            <Button
              onClick={() => {
                setAskOpen(false);
                void create();
              }}
            >
              Criar novo contrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
