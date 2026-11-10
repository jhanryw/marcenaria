"use client";
import * as React from "react";
import { RotateCcw, Save } from "lucide-react";
import type { Clause, ContractContent } from "@/domain/schema";
import { baseClauses, resetContractTemplate, saveContractTemplate } from "@/db/contracts";
import { PLACEHOLDER_HELP, findUnknownPlaceholders } from "@/contracts/template";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";

export function ClausesDialog({
  open,
  onOpenChange,
  content,
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  content: ContractContent;
  onApply: (patch: Pick<ContractContent, "title" | "clauses" | "templateVersion">) => void;
}) {
  const [title, setTitle] = React.useState(content.title);
  const [clauses, setClauses] = React.useState<Clause[]>(content.clauses);
  const confirm = useConfirm();
  const { toast } = useToast();

  React.useEffect(() => {
    if (open) {
      setTitle(content.title);
      setClauses(structuredClone(content.clauses));
    }
    // só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const unknown = findUnknownPlaceholders(clauses);
  const setBody = (id: string, body: string) => setClauses((cur) => cur.map((c) => (c.id === id ? { ...c, body } : c)));
  const setClauseTitle = (id: string, t: string) => setClauses((cur) => cur.map((c) => (c.id === id ? { ...c, title: t } : c)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Cláusulas do contrato" description="Edite o texto. Parágrafos são separados por linha em branco e numerados automaticamente." className="h-[94dvh] md:max-w-3xl">
        <DialogBody className="space-y-5">
          <div className="rounded-xl bg-warning-soft p-3 text-sm text-warning">
            <strong>Modelo-base, não homologado.</strong> É um ponto de partida em linguagem clara. Multas, juros, retenções, garantias e cancelamento devem ser
            revisados por um advogado antes do uso. Não inclua cláusulas que retirem direitos do consumidor.
          </div>
          <Field label="Título do documento" htmlFor="ct-title">
            <Input id="ct-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="rounded-xl bg-secondary p-3 text-xs text-secondary-foreground">
            <div className="mb-1 font-semibold">Marcadores preenchidos automaticamente</div>
            <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {PLACEHOLDER_HELP.map((p) => (
                <li key={p.key}>
                  <code className="font-mono font-bold">{`{{${p.key}}}`}</code> — {p.description}
                </li>
              ))}
            </ul>
            <p className="mt-1">Marcadores sem dados somem do texto. Quadros de partes, itens, pagamento e prazos são inseridos automaticamente nas seções 1, 3, 4 e 5.</p>
          </div>
          {unknown.length > 0 && (
            <p role="alert" className="rounded-xl bg-destructive-soft p-3 text-sm font-medium text-destructive">
              Marcadores desconhecidos: {unknown.map((u) => `{{${u}}}`).join(", ")}
            </p>
          )}
          {clauses.map((c, i) => (
            <div key={c.id} className="space-y-2 rounded-2xl border border-border p-3">
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-primary">{i + 1}</span>
                <Input aria-label={`Título da cláusula ${i + 1}`} value={c.title} onChange={(e) => setClauseTitle(c.id, e.target.value)} className="h-11 font-semibold" />
              </div>
              <Textarea aria-label={`Texto da cláusula ${i + 1}`} value={c.body} onChange={(e) => setBody(c.id, e.target.value)} className="min-h-40 text-[15px] leading-relaxed" />
            </div>
          ))}
        </DialogBody>
        <DialogFooter className="sm:flex-wrap">
          <Button
            variant="outline"
            onClick={async () => {
              const ok = await confirm({ title: "Restaurar o modelo-base?", message: "Descarta suas alterações nas cláusulas DESTE contrato e volta ao texto original do aplicativo.", confirmLabel: "Restaurar" });
              if (ok) {
                setClauses(baseClauses());
                setTitle("Contrato de Fornecimento e Instalação de Móveis Planejados");
              }
            }}
          >
            <RotateCcw /> Restaurar modelo-base
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await saveContractTemplate(title, clauses);
              toast("Salvo como modelo padrão para os próximos contratos");
            }}
          >
            <Save /> Salvar como modelo padrão
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              const ok = await confirm({ title: "Voltar ao modelo do aplicativo?", message: "Os próximos contratos usarão o texto original, em vez do seu modelo personalizado." , confirmLabel: "Voltar ao original"});
              if (ok) {
                await resetContractTemplate();
                toast("Modelo padrão restaurado");
              }
            }}
          >
            Limpar modelo padrão
          </Button>
          <Button
            onClick={() => {
              onApply({ title: title.trim() || content.title, clauses, templateVersion: content.templateVersion });
              onOpenChange(false);
            }}
          >
            Aplicar neste contrato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
