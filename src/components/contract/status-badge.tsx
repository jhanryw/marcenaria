import { Badge } from "@/components/ui/badge";
import { CONTRACT_STATUS_LABELS, type ContractStatus } from "@/domain/schema";

const TONES: Record<ContractStatus, "neutral" | "blue" | "green" | "red"> = {
  rascunho: "neutral",
  emitido: "blue",
  assinado: "green",
  cancelado: "red",
};

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  return <Badge tone={TONES[status]}>{CONTRACT_STATUS_LABELS[status]}</Badge>;
}
