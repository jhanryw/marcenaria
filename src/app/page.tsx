"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, FileText, FolderOpen, Hammer, Plus, ShieldAlert, Smartphone } from "lucide-react";
import { useProjects, useSettings } from "@/hooks/use-data";
import { createProject } from "@/db/repository";
import { calculateProject } from "@/engine/project-calc";
import { formatBRL } from "@/lib/money";
import { daysSince } from "@/lib/format-date";
import { PageContainer, PageHeader, SectionTitle, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProjectCard } from "@/components/project-card";
import { usePwa } from "@/components/pwa-provider";

export default function HomePage() {
  const router = useRouter();
  const projects = useProjects();
  const settings = useSettings();
  const pwa = usePwa();

  const stats = React.useMemo(() => {
    const list = projects ?? [];
    const active = list.filter((p) => p.status !== "cancelado" && p.status !== "concluido");
    const pipeline = active
      .filter((p) => p.status === "orcado" || p.status === "aprovado" || p.status === "em_producao")
      .reduce((a, p) => a + calculateProject(p).finance.finalPriceCents, 0);
    return { total: list.length, active: active.length, pipeline };
  }, [projects]);

  const recent = React.useMemo(
    () => [...(projects ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4),
    [projects],
  );

  const backupDays = settings ? daysSince(settings.lastBackupAt) : null;
  const needsBackup = (projects?.length ?? 0) > 0 && settings && (backupDays === null || backupDays >= 7);

  async function onNew() {
    const p = await createProject();
    router.push(`/projeto/?id=${encodeURIComponent(p.id)}`);
  }

  return (
    <>
      <PageHeader
        title={settings?.companyName ? settings.companyName : "Marcenaria"}
        subtitle="Orçamentos de móveis planejados"
        actions={
          <Button size="sm" onClick={onNew}>
            <Plus /> Novo
          </Button>
        }
      />
      <PageContainer className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3">
            <div className="text-2xl font-bold text-primary tabular">{stats.total}</div>
            <div className="text-xs text-muted-foreground">projetos</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-primary tabular">{stats.active}</div>
            <div className="text-xs text-muted-foreground">em andamento</div>
          </Card>
          <Card className="p-3">
            <div className="truncate text-lg font-bold leading-8 text-primary tabular">{formatBRL(stats.pipeline)}</div>
            <div className="text-xs text-muted-foreground">em negociação</div>
          </Card>
        </div>

        {needsBackup && (
          <Card className="flex items-start gap-3 border-warning/30 bg-warning-soft p-4">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-warning">
                {backupDays === null ? "Você ainda não fez backup." : `Último backup há ${backupDays} dias.`}
              </p>
              <p className="mt-0.5 text-sm text-warning/90">
                Os orçamentos ficam só neste aparelho. Limpar os dados do navegador ou remover o app apaga tudo.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link href="/configuracoes/#backup">
                  <Download /> Fazer backup agora
                </Link>
              </Button>
            </div>
          </Card>
        )}

        {pwa.canInstall && !pwa.isStandalone && (
          <Card className="flex items-center gap-3 p-4">
            <Smartphone className="size-6 shrink-0 text-primary" />
            <p className="flex-1 text-sm">Instale o app na tela inicial para abrir como aplicativo, mesmo sem internet.</p>
            <Button size="sm" onClick={() => pwa.promptInstall()}>
              Instalar
            </Button>
          </Card>
        )}

        <div>
          <SectionTitle
            action={
              <Link href="/projetos/" className="text-sm font-semibold text-primary">
                Ver todos
              </Link>
            }
          >
            Recentes
          </SectionTitle>
          {projects === undefined ? (
            <div className="h-24 animate-pulse rounded-2xl bg-muted" />
          ) : recent.length === 0 ? (
            <EmptyState
              icon={<Hammer />}
              title="Crie seu primeiro orçamento"
              description="Cadastre as peças do móvel e descubra quantas chapas de MDF comprar, o custo e o preço de venda."
              action={
                <Button onClick={onNew}>
                  <Plus /> Novo projeto
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {recent.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </div>

        <Button asChild variant="outline" className="w-full">
          <Link href="/contratos/">
            <FileText /> Contratos
          </Link>
        </Button>

        {recent.length > 0 && (
          <Button asChild variant="outline" className="w-full">
            <Link href="/projetos/">
              <FolderOpen /> Todos os projetos
            </Link>
          </Button>
        )}
      </PageContainer>
    </>
  );
}
