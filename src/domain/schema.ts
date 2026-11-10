/**
 * Modelos de dados (Zod). São a fonte única da verdade para:
 *  - tipos TypeScript (via z.infer);
 *  - validação de formulários;
 *  - validação de backups importados.
 *
 * Convenções:
 *  - Dinheiro SEMPRE em centavos inteiros (`...Cents`).
 *  - Medidas SEMPRE em milímetros inteiros ou decimais (`...Mm`).
 *  - Percentuais em "pontos percentuais" (50 = 50%).
 *  - Datas em ISO 8601 (string).
 *
 * Qualquer mudança incompatível neste arquivo exige subir SCHEMA_VERSION
 * e registrar uma migração em src/db/migrations.ts.
 */
import { z } from "zod";

export const SCHEMA_VERSION = 2;
export const BACKUP_FORMAT = "marcenaria-orcamentos-backup";

const id = z.string().min(1);
const isoDate = z.string().min(1);
const cents = z.number().int().min(0);
const mm = z.number().positive();

/* ------------------------------------------------------------------ */
/* Materiais                                                           */
/* ------------------------------------------------------------------ */

export const sheetMaterialSchema = z.object({
  id,
  name: z.string().trim().min(1, "Informe o nome"),
  manufacturer: z.string().default(""),
  finish: z.string().default(""),
  thicknessMm: mm,
  /** Dimensão menor da chapa (ex.: 1850) */
  widthMm: mm,
  /** Dimensão maior da chapa (ex.: 2750) */
  lengthMm: mm,
  priceCents: cents,
  /** Margem de segurança (refilo) em cada extremidade da chapa */
  marginMm: z.number().min(0).default(10),
  /** Espessura do corte da serra */
  kerfMm: z.number().min(0).default(3),
  /** Se verdadeiro, peças NÃO podem girar (comprimento da peça ∥ comprimento da chapa) */
  grainRequired: z.boolean().default(false),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type SheetMaterial = z.infer<typeof sheetMaterialSchema>;

export const edgeTapeSchema = z.object({
  id,
  name: z.string().trim().min(1, "Informe o nome"),
  color: z.string().default(""),
  widthMm: mm.default(22),
  thicknessMm: mm.default(0.45),
  pricePerMeterCents: cents,
  /** Perda adicional para emendas, refiles e sobras (%) */
  wastePercent: z.number().min(0).default(10),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type EdgeTape = z.infer<typeof edgeTapeSchema>;

/* ------------------------------------------------------------------ */
/* Peças                                                               */
/* ------------------------------------------------------------------ */

export const EDGE_SIDES = ["top", "bottom", "left", "right"] as const;
export type EdgeSide = (typeof EDGE_SIDES)[number];

export const pieceEdgesSchema = z.object({
  top: z.string().nullable().default(null),
  bottom: z.string().nullable().default(null),
  left: z.string().nullable().default(null),
  right: z.string().nullable().default(null),
});
export type PieceEdges = z.infer<typeof pieceEdgesSchema>;

export const pieceSchema = z.object({
  id,
  ref: z.string().default(""),
  description: z.string().trim().min(1, "Informe a descrição"),
  materialId: id,
  /** Largura da peça (mm) */
  widthMm: mm,
  /** Comprimento da peça (mm). Em materiais com veio, é a direção do veio. */
  lengthMm: mm,
  quantity: z.number().int().min(1).max(10000),
  allowRotation: z.boolean().default(true),
  edges: pieceEdgesSchema.default({ top: null, bottom: null, left: null, right: null }),
  notes: z.string().default(""),
});
export type Piece = z.infer<typeof pieceSchema>;

/* ------------------------------------------------------------------ */
/* Custos                                                              */
/* ------------------------------------------------------------------ */

export const COST_CATEGORIES = [
  "ferragens",
  "dobradicas",
  "corredicas",
  "puxadores",
  "parafusos",
  "cola",
  "solvente",
  "frete",
  "instalacao",
  "outros",
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  ferragens: "Ferragens",
  dobradicas: "Dobradiças",
  corredicas: "Corrediças",
  puxadores: "Puxadores",
  parafusos: "Parafusos",
  cola: "Cola",
  solvente: "Solvente",
  frete: "Frete",
  instalacao: "Instalação",
  outros: "Outros",
};

export const costItemSchema = z.object({
  id,
  category: z.enum(COST_CATEGORIES).default("outros"),
  description: z.string().trim().min(1, "Informe a descrição"),
  /** "unit": quantidade × valor unitário · "fixed": valor fixo (sem quantidade) */
  mode: z.enum(["unit", "fixed"]).default("unit"),
  quantity: z.number().min(0).default(1),
  unit: z.string().default("un."),
  unitCents: cents,
});
export type CostItem = z.infer<typeof costItemSchema>;

export const laborPartSchema = z.object({
  mode: z.enum(["fixed", "hourly"]).default("fixed"),
  fixedCents: cents.default(0),
  hours: z.number().min(0).default(0),
  hourlyCents: cents.default(0),
});
export type LaborPart = z.infer<typeof laborPartSchema>;

export const laborSchema = z.object({
  fabrication: laborPartSchema.default({ mode: "fixed", fixedCents: 0, hours: 0, hourlyCents: 0 }),
  installation: laborPartSchema.default({ mode: "fixed", fixedCents: 0, hours: 0, hourlyCents: 0 }),
});
export type Labor = z.infer<typeof laborSchema>;

export const reserveSchema = z.object({
  mode: z.enum(["none", "percent", "sheets"]).default("none"),
  value: z.number().min(0).default(0),
});
export type Reserve = z.infer<typeof reserveSchema>;

/** Deduções sobre a venda ainda NÃO embutidas nos custos. Não são lucro líquido. */
export const deductionsSchema = z.object({
  taxPercent: z.number().min(0).default(0),
  commissionPercent: z.number().min(0).default(0),
  overheadPercent: z.number().min(0).default(0),
});
export type Deductions = z.infer<typeof deductionsSchema>;

/* ------------------------------------------------------------------ */
/* Projeto / orçamento                                                 */
/* ------------------------------------------------------------------ */

export const PROJECT_STATUSES = [
  "rascunho",
  "orcado",
  "aprovado",
  "em_producao",
  "concluido",
  "cancelado",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  rascunho: "Rascunho",
  orcado: "Orçado",
  aprovado: "Aprovado",
  em_producao: "Em produção",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

/**
 * Dados reservados para o futuro módulo de contratos.
 * Nenhuma tela usa estes campos na versão 1; existem para que os orçamentos
 * já salvos possam ser completados depois sem migração destrutiva.
 */
export const commercialTermsSchema = z.object({
  client: z
    .object({
      name: z.string().optional(),
      document: z.string().optional(), // CPF/CNPJ
      email: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),
  paymentMethod: z.string().optional(),
  installments: z.number().int().min(1).optional(),
  downPaymentCents: cents.optional(),
  deliveryDays: z.number().int().min(0).optional(),
  warrantyMonths: z.number().int().min(0).optional(),
  installationTerms: z.string().optional(),
  clauses: z.array(z.object({ title: z.string(), body: z.string() })).optional(),
});
export type CommercialTerms = z.infer<typeof commercialTermsSchema>;

export const projectSchema = z.object({
  id,
  /** Número sequencial do projeto (atribuído quando necessário, ex.: ao gerar contrato) */
  number: z.number().int().min(1).optional(),
  name: z.string().trim().min(1, "Informe o nome do projeto"),
  clientName: z.string().default(""),
  clientPhone: z.string().default(""),
  description: z.string().default(""),
  status: z.enum(PROJECT_STATUSES).default("rascunho"),
  createdAt: isoDate,
  updatedAt: isoDate,

  pieces: z.array(pieceSchema).default([]),

  /**
   * SNAPSHOTS: cópias dos materiais/fitas usados neste orçamento, com os preços
   * da época. Alterar o catálogo depois NÃO altera orçamentos existentes.
   * O `id` do snapshot é o mesmo do item de catálogo de origem.
   */
  materials: z.array(sheetMaterialSchema).default([]),
  tapes: z.array(edgeTapeSchema).default([]),

  costItems: z.array(costItemSchema).default([]),
  labor: laborSchema.default({
    fabrication: { mode: "fixed", fixedCents: 0, hours: 0, hourlyCents: 0 },
    installation: { mode: "fixed", fixedCents: 0, hours: 0, hourlyCents: 0 },
  }),
  reserve: reserveSchema.default({ mode: "none", value: 0 }),
  /** Dimensões mínimas para considerar uma sobra reaproveitável (snapshot das configurações) */
  remnantMinShortMm: z.number().min(0).default(300),
  remnantMinLongMm: z.number().min(0).default(600),

  markupPercent: z.number().min(0).default(50),
  /** Quando definido, substitui o preço sugerido */
  manualPriceCents: cents.nullable().default(null),
  deductions: deductionsSchema.default({ taxPercent: 0, commissionPercent: 0, overheadPercent: 0 }),

  notes: z.string().default(""),

  commercial: commercialTermsSchema.optional(),
});
export type Project = z.infer<typeof projectSchema>;

/* ------------------------------------------------------------------ */
/* Contratos (v2)                                                      */
/* ------------------------------------------------------------------ */

/** Dados da empresa contratada. O logotipo fica como data URL (reduzido) para funcionar offline e entrar no backup. */
export const companySchema = z.object({
  legalName: z.string().default(""),
  tradeName: z.string().default(""),
  document: z.string().default(""),
  address: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
  responsible: z.string().default(""),
  pixKey: z.string().default(""),
  logoDataUrl: z.string().nullable().default(null),
});
export type Company = z.infer<typeof companySchema>;

export const CONTRACT_STATUSES = ["rascunho", "emitido", "assinado", "cancelado"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  rascunho: "Rascunho",
  emitido: "Emitido",
  assinado: "Assinado",
  cancelado: "Cancelado",
};

export const PAYMENT_METHODS = ["pix", "transferencia", "dinheiro", "cartao", "boleto"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  transferencia: "Transferência",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  boleto: "Boleto",
};

export const PAYMENT_TRIGGERS = [
  "data",
  "assinatura",
  "aprovacao_projeto",
  "inicio_fabricacao",
  "entrega",
  "conclusao_instalacao",
] as const;
export type PaymentTrigger = (typeof PAYMENT_TRIGGERS)[number];
export const PAYMENT_TRIGGER_LABELS: Record<PaymentTrigger, string> = {
  data: "Em data definida",
  assinatura: "Na assinatura do contrato",
  aprovacao_projeto: "Na aprovação final do projeto",
  inicio_fabricacao: "No início da fabricação",
  entrega: "Na entrega dos móveis",
  conclusao_instalacao: "Na conclusão da instalação",
};

export const installmentSchema = z.object({
  id,
  amountCents: cents,
  /** Para "data": vencimento. Para eventos: data prevista do evento (opcional, informativa). */
  dueDate: z.string().nullable().default(null),
  trigger: z.enum(PAYMENT_TRIGGERS).default("data"),
});
export type Installment = z.infer<typeof installmentSchema>;

export const contractPaymentSchema = z.object({
  totalCents: cents.default(0),
  downMode: z.enum(["percent", "amount"]).default("percent"),
  downPercent: z.number().min(0).max(100).default(0),
  /** Valor da entrada em centavos (derivado do percentual, ou digitado quando downMode = "amount") */
  downCents: cents.default(0),
  downDueDate: z.string().nullable().default(null),
  downTrigger: z.enum(PAYMENT_TRIGGERS).default("assinatura"),
  installmentCount: z.number().int().min(0).max(120).default(0),
  /** Intervalo padrão (dias) entre parcelas ao sugerir datas */
  intervalDays: z.number().int().min(1).max(365).default(30),
  installments: z.array(installmentSchema).default([]),
  methods: z.array(z.enum(PAYMENT_METHODS)).default([]),
  notes: z.string().default(""),
});
export type ContractPayment = z.infer<typeof contractPaymentSchema>;

export const START_MILESTONES = ["entrada_aprovacao", "assinatura", "medicao_final", "outro"] as const;
export type StartMilestone = (typeof START_MILESTONES)[number];
export const START_MILESTONE_LABELS: Record<StartMilestone, string> = {
  entrada_aprovacao: "a aprovação final do projeto e a confirmação do pagamento da entrada",
  assinatura: "a assinatura deste contrato",
  medicao_final: "a confirmação da medição final no local",
  outro: "outro marco (descrever)",
};

export const contractScheduleSchema = z.object({
  startDate: z.string().nullable().default(null),
  startMilestone: z.enum(START_MILESTONES).default("entrada_aprovacao"),
  startMilestoneText: z.string().default(""),
  leadTime: z.number().int().min(0).max(1000).default(0),
  leadUnit: z.enum(["corridos", "uteis"]).default("uteis"),
  deliveryDate: z.string().nullable().default(null),
  installationDate: z.string().nullable().default(null),
  installationLocation: z.string().default(""),
  logisticsNotes: z.string().default(""),
});
export type ContractSchedule = z.infer<typeof contractScheduleSchema>;

export const contractItemSchema = z.object({
  id,
  name: z.string().default(""),
  environment: z.string().default(""),
  description: z.string().default(""),
  dimensions: z.string().default(""),
  material: z.string().default(""),
  color: z.string().default(""),
  doors: z.string().default(""),
  hardware: z.string().default(""),
  quantity: z.number().int().min(1).max(999).default(1),
  notes: z.string().default(""),
});
export type ContractItem = z.infer<typeof contractItemSchema>;

export const CONTRACT_PARTY_FIELDS = ["name", "document", "phone", "email", "address", "deliveryAddress", "notes"] as const;
export const contractClientSchema = z.object({
  name: z.string().default(""),
  document: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
  address: z.string().default(""),
  deliveryAddress: z.string().default(""),
  notes: z.string().default(""),
});
export type ContractClient = z.infer<typeof contractClientSchema>;

export const SPECIAL_CONDITION_KEYS = [
  "reforma",
  "escadas",
  "elevador",
  "condominio",
  "remocao",
  "tomadas_hidraulica",
  "desnivel",
  "area_umida",
  "acesso",
  "nao_incluidos",
] as const;
export type SpecialConditionKey = (typeof SPECIAL_CONDITION_KEYS)[number];

export const specialConditionSchema = z.object({
  key: z.enum(SPECIAL_CONDITION_KEYS),
  enabled: z.boolean().default(false),
  text: z.string().default(""),
});
export type SpecialCondition = z.infer<typeof specialConditionSchema>;

export const contractTermsSchema = z.object({
  /** Multa moratória por atraso de pagamento (%). Para consumidores, a lei limita a 2%. */
  lateFeePercent: z.number().min(0).max(100).default(2),
  /** Juros de mora (% ao mês) */
  interestMonthlyPercent: z.number().min(0).max(100).default(1),
  /** Atraso (dias) além do qual o contratante pode notificar/rescindir */
  delayToleranceDays: z.number().int().min(0).max(365).default(30),
  /** Retenção máxima sobre valores pagos em caso de cancelamento pelo contratante (%), limitada ao dano comprovado. 0 = sem retenção. */
  cancellationRetentionPercent: z.number().min(0).max(100).default(0),
  /** Garantia contratual ADICIONAL à legal (meses). 0 = não há garantia contratual adicional. */
  warrantyMonths: z.number().int().min(0).max(120).default(0),
  warrantyNotes: z.string().default(""),
});
export type ContractTerms = z.infer<typeof contractTermsSchema>;

export const clauseSchema = z.object({
  id,
  title: z.string().default(""),
  /** Parágrafos separados por linha em branco. Aceita {{marcadores}}. */
  body: z.string().default(""),
});
export type Clause = z.infer<typeof clauseSchema>;

export const externalDocSchema = z.object({ id, description: z.string().default("") });
export type ExternalDoc = z.infer<typeof externalDocSchema>;

/** Tudo o que o usuário edita no contrato. É o conteúdo congelado na emissão. */
export const contractContentSchema = z.object({
  title: z.string().default("Contrato de Fornecimento e Instalação de Móveis Planejados"),
  company: companySchema.default(() => companySchema.parse({})),
  client: contractClientSchema.default(() => contractClientSchema.parse({})),
  /** Descrição comercial geral do projeto (não é a lista de cortes) */
  summary: z.string().default(""),
  items: z.array(contractItemSchema).default([]),
  /** Desenhos, medições ou projeto técnico aprovados, apenas REFERENCIADOS (não anexados ao PDF) */
  externalDocs: z.array(externalDocSchema).default([]),
  payment: contractPaymentSchema.default(() => contractPaymentSchema.parse({})),
  schedule: contractScheduleSchema.default(() => contractScheduleSchema.parse({})),
  terms: contractTermsSchema.default(() => contractTermsSchema.parse({})),
  specialConditions: z.array(specialConditionSchema).default([]),
  clauses: z.array(clauseSchema).default([]),
  /** Versão do modelo de cláusulas usado como base */
  templateVersion: z.number().int().min(0).default(1),
  /** Cidade para "Local e data" das assinaturas */
  signingCity: z.string().default(""),
  witnesses: z.boolean().default(false),
  notes: z.string().default(""),
});
export type ContractContent = z.infer<typeof contractContentSchema>;

export const resolvedClauseSchema = z.object({
  title: z.string(),
  paragraphs: z.array(z.string()),
});
export type ResolvedClause = z.infer<typeof resolvedClauseSchema>;

export const contractSchema = z.object({
  id,
  /** Número sequencial (0001...). Revisões do mesmo contrato compartilham o número. */
  number: z.number().int().min(1),
  revision: z.number().int().min(1).default(1),
  previousContractId: z.string().nullable().default(null),
  projectId: z.string().default(""),
  projectNumber: z.number().int().min(1).nullable().default(null),
  projectName: z.string().default(""),
  /** Data do orçamento (updatedAt do projeto quando o contrato foi criado) */
  budgetDate: z.string().default(""),
  status: z.enum(CONTRACT_STATUSES).default("rascunho"),
  createdAt: isoDate,
  updatedAt: isoDate,
  issuedAt: z.string().nullable().default(null),
  signedAt: z.string().nullable().default(null),
  signedNote: z.string().default(""),
  cancelledAt: z.string().nullable().default(null),
  cancelReason: z.string().default(""),
  content: contractContentSchema,
  /** Versão imutável gravada na emissão: conteúdo + texto final das cláusulas já resolvido */
  issued: z
    .object({
      content: contractContentSchema,
      clauses: z.array(resolvedClauseSchema),
      /** Data de emissão (AAAA-MM-DD, data local), fixada na emissão */
      date: z.string().default(""),
    })
    .nullable()
    .default(null),
});
export type Contract = z.infer<typeof contractSchema>;

export const contractTemplateSchema = z.object({
  version: z.number().int().min(1).default(1),
  title: z.string().default("Contrato de Fornecimento e Instalação de Móveis Planejados"),
  clauses: z.array(clauseSchema),
});
export type ContractTemplate = z.infer<typeof contractTemplateSchema>;

/* ------------------------------------------------------------------ */
/* Configurações                                                       */
/* ------------------------------------------------------------------ */

export const settingsSchema = z.object({
  id: z.literal("main").default("main"),
  companyName: z.string().default(""),
  defaultMarkupPercent: z.number().min(0).default(50),
  defaultSheetWidthMm: mm.default(1850),
  defaultSheetLengthMm: mm.default(2750),
  defaultSheetPriceCents: cents.default(32000),
  defaultMarginMm: z.number().min(0).default(10),
  defaultKerfMm: z.number().min(0).default(3),
  defaultTapeWastePercent: z.number().min(0).default(10),
  defaultHourlyCents: cents.default(0),
  remnantMinShortMm: z.number().min(0).default(300),
  remnantMinLongMm: z.number().min(0).default(600),
  defaultReserve: reserveSchema.default({ mode: "none", value: 0 }),
  defaultDeductions: deductionsSchema.default({ taxPercent: 0, commissionPercent: 0, overheadPercent: 0 }),
  /** Último backup exportado (para lembrar o usuário) */
  lastBackupAt: z.string().nullable().default(null),

  /* v2 — contratos */
  company: companySchema.default(() => companySchema.parse({})),
  nextContractNumber: z.number().int().min(1).default(1),
  nextProjectNumber: z.number().int().min(1).default(1),
  /** Feriados (YYYY-MM-DD) usados no cálculo de dias úteis */
  holidays: z.array(z.string()).default([]),
  contractDefaults: contractTermsSchema.default(() => contractTermsSchema.parse({})),
  /** Modelo de cláusulas personalizado do usuário (null = modelo-base do aplicativo) */
  contractTemplate: contractTemplateSchema.nullable().default(null),
});
export type Settings = z.infer<typeof settingsSchema>;

/* ------------------------------------------------------------------ */
/* Backup                                                              */
/* ------------------------------------------------------------------ */

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.number().int().min(1),
  exportedAt: isoDate,
  appVersion: z.string().default(""),
  data: z.object({
    projects: z.array(projectSchema),
    sheetMaterials: z.array(sheetMaterialSchema),
    edgeTapes: z.array(edgeTapeSchema),
    settings: settingsSchema.nullable().default(null),
    contracts: z.array(contractSchema).default([]),
  }),
});
export type Backup = z.infer<typeof backupSchema>;
