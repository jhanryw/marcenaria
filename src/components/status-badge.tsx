import { Badge } from "@/components/ui/badge";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/domain/schema";

const TONES: Record<ProjectStatus, "neutral" | "blue" | "green" | "amber" | "dark" | "red"> = {
  rascunho: "neutral",
  orcado: "blue",
  aprovado: "green",
  em_producao: "amber",
  concluido: "dark",
  cancelado: "red",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge tone={TONES[status]}>{PROJECT_STATUS_LABELS[status]}</Badge>;
}
