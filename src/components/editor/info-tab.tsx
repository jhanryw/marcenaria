"use client";
import * as React from "react";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type Project, type ProjectStatus } from "@/domain/schema";
import { formatDateTime } from "@/lib/format-date";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/label";
import { Input, Select, Textarea } from "@/components/ui/input";

export function InfoTab({ project, update }: { project: Project; update: (fn: (p: Project) => Project) => void }) {
  const set = <K extends keyof Project>(k: K, v: Project[K]) => update((p) => ({ ...p, [k]: v }));
  return (
    <div className="space-y-3">
      <Link href={`/contratos/?projeto=${encodeURIComponent(project.id)}`} className="block">
        <Card className="flex items-center gap-3 p-4 active:bg-muted/60">
          <FileText className="size-6 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Contratos</div>
            <div className="text-sm text-muted-foreground">Criar, continuar e consultar os contratos deste projeto</div>
          </div>
          <span className="text-sm font-semibold text-primary">Abrir</span>
        </Card>
      </Link>
      <Card className="space-y-4 p-4">
        <Field label="Nome do projeto" error={project.name.trim() ? undefined : "Informe o nome do projeto"} htmlFor="p-name">
          <Input id="p-name" value={project.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Cozinha da Maria" />
        </Field>
        <Field label="Status" htmlFor="p-status">
          <Select id="p-status" value={project.status} onChange={(e) => set("status", e.target.value as ProjectStatus)}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente (opcional)" htmlFor="p-client">
            <Input id="p-client" value={project.clientName} onChange={(e) => set("clientName", e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Telefone do cliente (opcional)" htmlFor="p-phone">
            <Input id="p-phone" type="tel" inputMode="tel" value={project.clientPhone} onChange={(e) => set("clientPhone", e.target.value)} placeholder="(11) 99999-0000" autoComplete="off" />
          </Field>
        </div>
        <Field label="Descrição do serviço" hint="Aparece no resumo para o cliente." htmlFor="p-desc">
          <Textarea id="p-desc" value={project.description} onChange={(e) => set("description", e.target.value)} placeholder="Ex.: Armário de cozinha com 6 portas, gavetas com corrediça telescópica…" />
        </Field>
        <Field label="Observações adicionais" htmlFor="p-notes">
          <Textarea id="p-notes" value={project.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Prazos, condições, detalhes de instalação…" />
        </Field>
      </Card>
      <p className="px-1 text-xs text-muted-foreground">
        Criado em {formatDateTime(project.createdAt)} · Atualizado em {formatDateTime(project.updatedAt)}
      </p>
    </div>
  );
}
