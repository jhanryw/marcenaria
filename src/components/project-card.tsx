"use client";
import * as React from "react";
import Link from "next/link";
import { Copy, Trash2, Layers, Scissors } from "lucide-react";
import type { Project } from "@/domain/schema";
import { calculateProject } from "@/engine/project-calc";
import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/format-date";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { StatusBadge } from "./status-badge";

export function ProjectCard({
  project,
  onDuplicate,
  onDelete,
}: {
  project: Project;
  onDuplicate?: (p: Project) => void;
  onDelete?: (p: Project) => void;
}) {
  const calc = React.useMemo(() => calculateProject(project), [project]);
  const incomplete = !calc.reliable && project.pieces.length > 0;

  return (
    <Card className="overflow-hidden">
      <Link href={`/projeto/?id=${encodeURIComponent(project.id)}`} className="block p-4 active:bg-muted/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{project.name}</h3>
            <p className="truncate text-sm text-muted-foreground">{project.clientName || "Sem cliente"}</p>
          </div>
          <StatusBadge status={project.status} />
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Layers className="size-3.5" />
              {incomplete ? "—" : calc.cut.totalSheetsToBuy} chapa{calc.cut.totalSheetsToBuy === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-1">
              <Scissors className="size-3.5" />
              {calc.pieceCount} peça{calc.pieceCount === 1 ? "" : "s"}
            </span>
            <span>Atualizado {formatDate(project.updatedAt)}</span>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold leading-none text-primary tabular">
              {calc.finance.finalPriceCents > 0 ? formatBRL(calc.finance.finalPriceCents) : "—"}
            </div>
            {incomplete && <div className="mt-1 text-[11px] font-semibold text-warning">orçamento incompleto</div>}
          </div>
        </div>
      </Link>
      {(onDuplicate || onDelete) && (
        <div className="flex border-t border-border">
          {onDuplicate && (
            <Button variant="ghost" size="sm" className="h-11 flex-1 rounded-none text-muted-foreground" onClick={() => onDuplicate(project)}>
              <Copy /> Duplicar
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-11 flex-1 rounded-none border-l border-border text-destructive hover:bg-destructive-soft"
              onClick={() => onDelete(project)}
            >
              <Trash2 /> Excluir
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
