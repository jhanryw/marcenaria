/**
 * Revisão do contrato antes de emitir.
 *  - "error": impede EMITIR (o rascunho/pré-visualização continuam permitidos);
 *  - "warning": destaca algo importante, mas não bloqueia;
 *  - "info": lembrete.
 * Campos opcionais vazios nunca bloqueiam.
 */
import type { ContractContent } from "@/domain/schema";
import { documentStatus } from "./validators";
import { isLikelyEmail } from "./validators";
import { isDueDefined, paymentSummary } from "./payment";
import { isValidISODate } from "./dates";
import { findUnknownPlaceholders } from "./template";
import { formatBRL } from "@/lib/money";

export type ReviewStep = "cliente" | "moveis" | "valores" | "prazo" | "revisao";
export type ReviewLevel = "error" | "warning" | "info";

export interface ReviewItem {
  id: string;
  level: ReviewLevel;
  step: ReviewStep;
  message: string;
}

export interface Review {
  items: ReviewItem[];
  errors: ReviewItem[];
  warnings: ReviewItem[];
  infos: ReviewItem[];
  /** Pode emitir? (sem erros) */
  canIssue: boolean;
}

export function reviewContract(c: ContractContent): Review {
  const items: ReviewItem[] = [];
  const add = (level: ReviewLevel, step: ReviewStep, id: string, message: string) => items.push({ id, level, step, message });

  /* ---- empresa ---- */
  const co = c.company;
  if (!co.legalName.trim() && !co.tradeName.trim()) add("error", "revisao", "company-name", "Dados da empresa incompletos: informe o nome da empresa em Configurações › Dados da empresa.");
  const coDoc = documentStatus(co.document);
  if (coDoc === "empty") add("warning", "revisao", "company-doc", "CPF/CNPJ da empresa não informado.");
  else if (coDoc !== "valid") add("warning", "revisao", "company-doc", "CPF/CNPJ da empresa parece incorreto ou incompleto.");
  if (!co.address.trim()) add("warning", "revisao", "company-address", "Endereço da empresa não informado.");
  if (!co.phone.trim() && !co.email.trim()) add("warning", "revisao", "company-contact", "Nenhum contato (telefone ou e-mail) da empresa informado.");
  if (co.email.trim() && !isLikelyEmail(co.email)) add("warning", "revisao", "company-email", "E-mail da empresa parece incorreto.");

  /* ---- cliente ---- */
  const cl = c.client;
  if (!cl.name.trim()) add("error", "cliente", "client-name", "Informe o nome completo ou a razão social do cliente.");
  const clDoc = documentStatus(cl.document);
  if (clDoc === "empty") add("warning", "cliente", "client-doc", "CPF/CNPJ do cliente não informado (recomendado para identificar as partes).");
  else if (clDoc !== "valid") add("warning", "cliente", "client-doc", "CPF/CNPJ do cliente parece incorreto ou incompleto. Confira os dígitos.");
  if (!cl.address.trim()) add("warning", "cliente", "client-address", "Endereço do cliente não informado.");
  if (!cl.phone.trim() && !cl.email.trim()) add("warning", "cliente", "client-contact", "Nenhum contato do cliente (telefone ou e-mail) informado.");
  if (cl.email.trim() && !isLikelyEmail(cl.email)) add("warning", "cliente", "client-email", "E-mail do cliente parece incorreto.");

  /* ---- móveis ---- */
  if (c.items.length === 0) add("error", "moveis", "items-empty", "Descrição contratual ausente: adicione pelo menos um móvel ou serviço contratado.");
  c.items.forEach((it, i) => {
    if (!it.name.trim()) add("error", "moveis", `item-${it.id}-name`, `Item ${i + 1}: informe o nome do móvel ou serviço.`);
    else if (!it.description.trim()) add("warning", "moveis", `item-${it.id}-desc`, `Item ${i + 1} (${it.name}): sem descrição detalhada.`);
  });
  if (c.items.length > 0 && c.items.every((it) => !it.name.trim() && !it.description.trim())) {
    /* já coberto pelos erros acima */
  }
  if (c.externalDocs.some((d) => !d.description.trim())) add("warning", "moveis", "docs-empty", "Há documento técnico de referência sem descrição.");

  /* ---- pagamento ---- */
  const pay = c.payment;
  if (!(pay.totalCents > 0)) add("error", "valores", "total", "Informe o valor total contratado.");
  const sum = paymentSummary(pay);
  if (pay.totalCents > 0 && !sum.balanced) {
    const d = sum.diffCents;
    add(
      "error",
      "valores",
      "sum",
      d > 0
        ? `Entrada + parcelas somam ${formatBRL(sum.sumCents)}: faltam ${formatBRL(d)} para fechar o total de ${formatBRL(pay.totalCents)}.`
        : `Entrada + parcelas somam ${formatBRL(sum.sumCents)}: excedem o total de ${formatBRL(pay.totalCents)} em ${formatBRL(-d)}.`,
    );
  }
  if (pay.downCents > pay.totalCents) add("error", "valores", "down-over", "A entrada não pode ser maior que o valor total.");
  if (pay.downCents > 0 && !isDueDefined(pay.downTrigger, pay.downDueDate)) add("error", "valores", "down-due", "Entrada: defina a data de vencimento ou o evento.");
  pay.installments.forEach((inst, i) => {
    if (!isDueDefined(inst.trigger, inst.dueDate)) add("error", "valores", `inst-${inst.id}`, `Parcela ${i + 1}: vencimento não definido (escolha uma data ou um evento).`);
  });
  if (pay.methods.length === 0) add("warning", "valores", "methods", "Forma de pagamento não informada.");

  /* ---- prazos ---- */
  const s = c.schedule;
  if (!(s.leadTime > 0)) add("error", "prazo", "lead", "Prazo de fabricação não informado.");
  if (s.startMilestone === "outro" && !s.startMilestoneText.trim()) add("error", "prazo", "milestone", "Descreva o marco inicial da contagem do prazo.");
  if (isValidISODate(s.startDate) && isValidISODate(s.deliveryDate) && s.deliveryDate < s.startDate)
    add("error", "prazo", "delivery-before-start", "Prazos contraditórios: a entrega está antes do início.");
  if (isValidISODate(s.deliveryDate) && isValidISODate(s.installationDate) && s.installationDate < s.deliveryDate)
    add("error", "prazo", "install-before-delivery", "Prazos contraditórios: a instalação está antes da entrega.");
  if (!isValidISODate(s.startDate)) add("warning", "prazo", "start", "Data prevista de início não informada.");
  if (!isValidISODate(s.deliveryDate)) add("warning", "prazo", "delivery", "Data prevista de entrega não informada.");
  if (!s.installationLocation.trim() && !cl.deliveryAddress.trim() && !cl.address.trim())
    add("warning", "prazo", "install-location", "Local da instalação não informado.");

  /* ---- cláusulas e termos ---- */
  if (c.clauses.every((cl2) => !cl2.body.trim())) add("warning", "revisao", "clauses-empty", "As cláusulas estão vazias.");
  const unknown = findUnknownPlaceholders(c.clauses);
  if (unknown.length) add("warning", "revisao", "placeholders", `Marcadores desconhecidos nas cláusulas: ${unknown.map((u) => `{{${u}}}`).join(", ")}.`);
  if (c.terms.lateFeePercent > 2) add("warning", "prazo", "late-fee", "Multa por atraso acima de 2%: para consumidores, a lei costuma limitar a multa moratória a 2%. Peça revisão jurídica.");
  if (c.terms.cancellationRetentionPercent > 0) add("info", "prazo", "retention", "Há retenção em caso de cancelamento. Ela deve ser proporcional e comprovável; peça revisão jurídica.");
  if (c.terms.warrantyMonths === 0) add("info", "prazo", "warranty", "Sem garantia contratual adicional: valerá apenas a garantia legal.");
  if (!co.logoDataUrl) add("info", "revisao", "logo", "Sem logotipo cadastrado (opcional).");
  add("info", "revisao", "legal", "O modelo de cláusulas é um ponto de partida, não é juridicamente homologado. Recomenda-se revisão por advogado.");

  const errors = items.filter((i) => i.level === "error");
  return {
    items,
    errors,
    warnings: items.filter((i) => i.level === "warning"),
    infos: items.filter((i) => i.level === "info"),
    canIssue: errors.length === 0,
  };
}
