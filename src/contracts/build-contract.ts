/**
 * Cria o conteúdo inicial do contrato a partir do orçamento.
 *
 * REGRA DE PRIVACIDADE COMERCIAL: só entram dados comerciais (nome do projeto, cliente,
 * descrição, nomes dos materiais/acabamentos, PREÇO FINAL DE VENDA). Custos de MDF, fita,
 * ferragens, mão de obra, markup, lucro, aproveitamento e lista de cortes NUNCA são copiados.
 */
import { newId } from "@/lib/utils";
import type {
  Contract,
  ContractContent,
  ContractItem,
  Project,
  Settings,
} from "@/domain/schema";
import { companySchema, contractContentSchema } from "@/domain/schema";
import { calculateProject } from "@/engine/project-calc";
import { downPaymentCents, recomputePayment } from "./payment";
import { todayISO } from "./dates";
import { BASE_TEMPLATE_VERSION, DEFAULT_CLAUSES, DEFAULT_TITLE, defaultSpecialConditions } from "./template";

export function formatContractNumber(number: number, revision = 1): string {
  const n = String(number).padStart(4, "0");
  return revision > 1 ? `${n}-R${revision}` : n;
}

function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Contrato_0001_Nome-do-Cliente.pdf (revisões: Contrato_0001-R2_...) */
export function contractFileName(c: Pick<Contract, "number" | "revision" | "projectName" | "status">, content: ContractContent): string {
  const who = slug(content.client.name) || slug(c.projectName) || "Cliente";
  const draft = c.status === "rascunho" ? "_MINUTA" : "";
  return `Contrato_${formatContractNumber(c.number, c.revision)}_${who}${draft}.pdf`;
}

export function newContractItem(partial: Partial<ContractItem> = {}): ContractItem {
  return {
    id: newId(),
    name: "",
    environment: "",
    description: "",
    dimensions: "",
    material: "",
    color: "",
    doors: "",
    hardware: "",
    quantity: 1,
    notes: "",
    ...partial,
  };
}

export function createContentFromProject(project: Project, settings: Settings): ContractContent {
  const calc = calculateProject(project);

  // Materiais e acabamentos dos itens realmente usados (apenas nomes — sem preço).
  const used = project.materials.filter((m) => project.pieces.some((p) => p.materialId === m.id));
  const materialText = used.map((m) => m.name.trim()).filter(Boolean).join("; ");
  const finishes = [...new Set(used.map((m) => m.finish.trim()).filter(Boolean))].join(" / ");

  const company = companySchema.parse({
    ...settings.company,
    legalName: settings.company.legalName || settings.companyName || "",
  });

  const client = {
    name: project.clientName || project.commercial?.client?.name || "",
    document: project.commercial?.client?.document ?? "",
    phone: project.clientPhone || project.commercial?.client?.phone || "",
    email: project.commercial?.client?.email ?? "",
    address: project.commercial?.client?.address ?? "",
    deliveryAddress: "",
    notes: "",
  };

  let payment = contractContentSchema.shape.payment.parse({
    totalCents: calc.finance.finalPriceCents,
    downMode: "percent",
    downPercent: 40,
    installmentCount: 2,
    methods: ["pix"],
  });
  payment = recomputePayment({ ...payment, downCents: downPaymentCents(payment) }, todayISO());

  const template = settings.contractTemplate;
  return contractContentSchema.parse({
    title: template?.title || DEFAULT_TITLE,
    company,
    client,
    summary: "",
    items: [
      newContractItem({
        name: project.name,
        description: project.description.trim(),
        material: materialText,
        color: finishes,
      }),
    ],
    externalDocs: [],
    payment,
    schedule: { installationLocation: "" },
    terms: { ...settings.contractDefaults },
    specialConditions: defaultSpecialConditions(),
    clauses: structuredClone(template?.clauses ?? DEFAULT_CLAUSES),
    templateVersion: template?.version ?? BASE_TEMPLATE_VERSION,
    signingCity: [company.city, company.state].filter(Boolean).join("/"),
    witnesses: false,
    notes: project.notes.trim(),
  });
}
