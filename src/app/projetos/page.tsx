"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Plus, Search } from "lucide-react";
import { useProjects } from "@/hooks/use-data";
import { createProject, deleteProject, duplicateProject, filterProjects } from "@/db/repository";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type Project, type ProjectStatus } from "@/domain/schema";
import { PageContainer, PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectCard } from "@/components/project-card";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export default function ProjectsPage() {
  const router = useRouter();
  const projects = useProjects();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<ProjectStatus | "todos">("todos");

  const filtered = React.useMemo(
    () => filterProjects(projects ?? [], { search, status }),
    [projects, search, status],
  );

  async function onNew() {
    const p = await createProject();
    router.push(`/projeto/?id=${encodeURIComponent(p.id)}`);
  }

  async function onDuplicate(p: Project) {
    const copy = await duplicateProject(p.id);
    if (copy) toast("Projeto duplicado");
  }

  async function onDelete(p: Project) {
    const ok = await confirm({
      title: "Excluir projeto?",
      message: (
        <>
          O orçamento <strong>{p.name}</strong> será excluído deste aparelho. Esta ação não pode ser desfeita (a menos que você
          tenha um backup).
        </>
      ),
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    await deleteProject(p.id);
    toast("Projeto excluído");
  }

  return (
    <>
      <PageHeader
        title="Projetos"
        subtitle={projects ? `${projects.length} orçamento${projects.length === 1 ? "" : "s"}` : undefined}
        actions={
          <Button size="sm" onClick={onNew}>
            <Plus /> Novo
          </Button>
        }
      />
      <PageContainer className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por projeto ou cliente"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-12"
            aria-label="Buscar projetos"
          />
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Filtrar por status">
          {(["todos", ...PROJECT_STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={cn(
                "h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors",
                status === s ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground",
              )}
            >
              {s === "todos" ? "Todos" : PROJECT_STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {projects === undefined ? (
          <div className="h-28 animate-pulse rounded-2xl bg-muted" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FolderOpen />}
            title={projects.length === 0 ? "Nenhum projeto ainda" : "Nada encontrado"}
            description={
              projects.length === 0
                ? "Crie um orçamento para começar."
                : "Tente outro nome de projeto, cliente ou status."
            }
            action={
              projects.length === 0 ? (
                <Button onClick={onNew}>
                  <Plus /> Novo projeto
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((p) => (
              <ProjectCard key={p.id} project={p} onDuplicate={onDuplicate} onDelete={onDelete} />
            ))}
          </div>
        )}
      </PageContainer>
    </>
  );
}
