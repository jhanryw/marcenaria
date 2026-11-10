/**
 * Modelo-base de cláusulas + marcadores.
 *
 * AVISO IMPORTANTE: este texto é um PONTO DE PARTIDA em linguagem clara, pensado para
 * contratação de móveis planejados no Brasil, inclusive com consumidores. NÃO é um modelo
 * juridicamente homologado nem garantido como válido para todos os casos. Multas, juros,
 * retenções, garantias e demais condições devem ser revisados por profissional jurídico.
 *
 * Princípios adotados no texto:
 *  - não afasta direitos do consumidor (garantia legal, arrependimento, inversão de ônus etc.);
 *  - garantia legal e garantia contratual adicional são tratadas em itens separados;
 *  - sem perda integral da entrada, sem renúncia de garantia, sem exclusão geral de responsabilidade,
 *    sem foro de eleição abusivo (padrão: foro do domicílio do contratante);
 *  - multa, juros, prazo de tolerância e retenção são parâmetros editáveis, não texto fixo.
 */
import type {
  Clause,
  ContractContent,
  ResolvedClause,
  SpecialCondition,
  SpecialConditionKey,
} from "@/domain/schema";
import { SPECIAL_CONDITION_KEYS, START_MILESTONE_LABELS } from "@/domain/schema";
import { formatBRL, formatNumber } from "@/lib/money";
import { formatDateBR, isValidISODate } from "./dates";
import { downPaymentCents, paymentSummary } from "./payment";
import { intToWordsPt, moneyToWordsPt } from "./words";
import { PAYMENT_METHOD_LABELS } from "@/domain/schema";

export const BASE_TEMPLATE_VERSION = 1;

/** "0001" ou "0001-R2" (mesma regra de build-contract, sem dependência circular) */
export function formatContractNumberSafe(number: number, revision = 1): string {
  const n = String(number).padStart(4, "0");
  return revision > 1 ? `${n}-R${revision}` : n;
}
export const DEFAULT_TITLE = "Contrato de Fornecimento e Instalação de Móveis Planejados";

export const SPECIAL_CONDITION_DEFS: Record<SpecialConditionKey, { label: string; defaultText: string }> = {
  reforma: {
    label: "Imóvel em reforma",
    defaultText:
      "O imóvel está em reforma. A instalação ocorrerá somente após a liberação do ambiente (pisos, pintura e acabamentos concluídos), a ser comunicada pela CONTRATANTE. Atrasos da obra podem ajustar as datas previstas, mediante comunicação entre as partes.",
  },
  escadas: {
    label: "Acesso por escadas",
    defaultText:
      "O acesso ao local de instalação é feito por escadas, condição informada pela CONTRATANTE antes da contratação. Custos adicionais decorrentes dessa condição só serão cobrados se constarem deste contrato ou forem previamente informados e aprovados por escrito.",
  },
  elevador: {
    label: "Necessidade de elevador",
    defaultText:
      "O transporte dos móveis exige o uso de elevador (social ou de serviço). Cabe à CONTRATANTE providenciar a reserva e a liberação do elevador nos dias e horários da entrega e da montagem.",
  },
  condominio: {
    label: "Restrições de horário do condomínio",
    defaultText:
      "O condomínio impõe as seguintes regras para entrega e montagem: ____________. A CONTRATANTE as informou antes da contratação e a CONTRATADA as respeitará.",
  },
  remocao: {
    label: "Remoção de móveis antigos",
    defaultText:
      "Inclui a remoção dos móveis antigos indicados pela CONTRATANTE: ____________. O destino final dos itens removidos será combinado entre as partes.",
  },
  tomadas_hidraulica: {
    label: "Ajustes de tomadas ou pontos hidráulicos",
    defaultText:
      "Ajustes em tomadas, interruptores e pontos de água ou esgoto que interfiram na instalação deverão ser executados por profissional habilitado e não estão incluídos neste contrato, salvo se descritos expressamente na seção de especificações.",
  },
  desnivel: {
    label: "Desníveis em paredes e pisos",
    defaultText:
      "Paredes e pisos fora de prumo, nível ou esquadro podem exigir ajustes (calços, frisos, rodapés). A CONTRATADA avisará a CONTRATANTE antes da instalação; custos adicionais dependem de aprovação prévia.",
  },
  area_umida: {
    label: "Instalação em área úmida",
    defaultText:
      "Os móveis serão instalados em ambiente sujeito a umidade. Serão usados os materiais e acabamentos indicados na descrição do item, e a CONTRATANTE foi orientada sobre os cuidados de conservação (ventilação, limpeza e vedações).",
  },
  acesso: {
    label: "Condições de acesso ao local",
    defaultText:
      "Condições de acesso (portaria, chaves, horários, estacionamento, responsável pelo recebimento): ____________.",
  },
  nao_incluidos: {
    label: "Serviços expressamente não incluídos",
    defaultText: "Não estão incluídos neste contrato os seguintes serviços: ____________.",
  },
};

export function defaultSpecialConditions(): SpecialCondition[] {
  return SPECIAL_CONDITION_KEYS.map((key) => ({ key, enabled: false, text: SPECIAL_CONDITION_DEFS[key].defaultText }));
}

/** Modelo-base. Os marcadores {{...}} são preenchidos com os dados do contrato. Parágrafos: linha em branco. */
export const DEFAULT_CLAUSES: Clause[] = [
  {
    id: "c1",
    title: "Identificação das partes",
    body: [
      "As partes acima qualificadas, doravante denominadas CONTRATADA e CONTRATANTE, ajustam o presente contrato, que se rege por suas cláusulas e pela legislação aplicável, em especial o Código Civil e, quando a CONTRATANTE for consumidora, o Código de Defesa do Consumidor (Lei nº 8.078/1990).",
      "As partes declaram que os dados informados são verdadeiros e comprometem-se a comunicar por escrito qualquer alteração de endereço ou de meios de contato durante a vigência do contrato.",
    ].join("\n\n"),
  },
  {
    id: "c2",
    title: "Objeto do contrato",
    body: [
      "O presente contrato tem por objeto a fabricação, o fornecimento e a instalação, pela CONTRATADA, dos móveis planejados descritos na seção de especificações, conforme o projeto e as medidas aprovados pela CONTRATANTE.",
      "Integram a contratação apenas os móveis e serviços expressamente descritos neste contrato. Itens, materiais ou serviços não descritos dependem de acordo prévio entre as partes e, se houver custo, de aditivo escrito.",
      "{{docs_tecnicos}}",
    ].join("\n\n"),
  },
  {
    id: "c3",
    title: "Especificações dos móveis e materiais",
    body: [
      "Os móveis serão fabricados com os materiais, cores, acabamentos e ferragens descritos em cada item. As medidas finais seguem o projeto aprovado e as medições realizadas no local.",
      "Pequenas variações de tonalidade, textura e veio, inerentes aos materiais de madeira e seus revestimentos, não caracterizam defeito quando dentro da tolerância normal do material, sem prejuízo do direito da CONTRATANTE de reclamar de vício de qualidade ou de divergência em relação ao que foi aprovado.",
      "A substituição de qualquer material ou ferragem por equivalente somente poderá ocorrer com a concordância prévia da CONTRATANTE.",
    ].join("\n\n"),
  },
  {
    id: "c4",
    title: "Valor e condições de pagamento",
    body: [
      "O valor total deste contrato é de {{valor_total}} ({{valor_extenso}}), a ser pago conforme o quadro acima.",
      "{{frase_formas_pagamento}}",
      "{{dados_pix}}",
      "As parcelas vinculadas a um evento vencem no dia em que o evento ocorrer, e a CONTRATADA informará a ocorrência à CONTRATANTE por escrito (mensagem eletrônica é suficiente). As parcelas com data definida vencem na data indicada.",
      "{{observacoes_pagamento}}",
      "O valor contratado cobre apenas o que está descrito neste contrato. Serviços ou itens adicionais serão cobrados somente se previamente informados e aprovados pela CONTRATANTE.",
    ].join("\n\n"),
  },
  {
    id: "c5",
    title: "Prazo de fabricação e entrega",
    body: [
      "{{frase_prazo}}",
      "{{frase_datas}}",
      "As datas previstas poderão ser ajustadas por acordo entre as partes ou em razão de fatos alheios à vontade da CONTRATADA, como atraso na liberação do local, alterações solicitadas pela CONTRATANTE ou caso fortuito e força maior, desde que comunicados à outra parte com a devida antecedência.",
    ].join("\n\n"),
  },
  {
    id: "c6",
    title: "Condições de montagem e instalação",
    body: [
      "A instalação será realizada em {{local_instalacao}}, em dias e horários combinados com a CONTRATANTE, respeitadas as normas do condomínio ou do local, desde que informadas previamente à CONTRATADA.",
      "{{logistica}}",
      "A CONTRATANTE deverá garantir o livre acesso ao local, que deve estar limpo e desimpedido, com energia elétrica disponível e, quando necessário, os pontos de água e esgoto adequados à instalação.",
      "Se a CONTRATADA constatar, antes ou durante a instalação, condição do local que impeça ou altere a instalação conforme o projeto (como medidas divergentes, desníveis ou instalações elétricas e hidráulicas incompatíveis), comunicará a CONTRATANTE para que as partes decidam em conjunto a solução. Custos adicionais só serão devidos se previamente informados e aprovados.",
      "{{condicoes_especiais}}",
    ].join("\n\n"),
  },
  {
    id: "c7",
    title: "Responsabilidades da contratada",
    body: [
      "A CONTRATADA obriga-se a: (a) fabricar os móveis conforme o projeto aprovado e com materiais de boa qualidade; (b) cumprir os prazos previstos, comunicando com antecedência qualquer imprevisto; (c) realizar a instalação com técnica adequada e profissionais capacitados; (d) respeitar as normas de segurança e as regras do local; (e) deixar o local limpo ao concluir a instalação, removendo os resíduos gerados por seus serviços; e (f) responder pelos danos que causar ao imóvel e a bens da CONTRATANTE durante a execução dos serviços.",
    ].join("\n\n"),
  },
  {
    id: "c8",
    title: "Responsabilidades do contratante",
    body: [
      "A CONTRATANTE obriga-se a: (a) fornecer informações corretas sobre o local e permitir as medições necessárias; (b) aprovar o projeto por escrito antes do início da fabricação; (c) efetuar os pagamentos nas condições ajustadas; (d) garantir o acesso ao local nas datas combinadas, informando restrições de condomínio ou de edifício; e (e) conservar os móveis conforme as orientações recebidas, evitando exposição excessiva à umidade e uso inadequado.",
    ].join("\n\n"),
  },
  {
    id: "c9",
    title: "Alterações no projeto e serviços adicionais",
    body: [
      "Alterações solicitadas após a aprovação do projeto serão analisadas pela CONTRATADA, que informará por escrito a viabilidade, o efeito no preço e no prazo. A alteração somente vale após o aceite escrito da CONTRATANTE.",
      "Serviços adicionais não previstos neste contrato dependem de orçamento e aprovação prévios e podem ser formalizados por aditivo ou por troca de mensagens que identifiquem claramente o serviço, o valor e o prazo.",
    ].join("\n\n"),
  },
  {
    id: "c10",
    title: "Garantias e assistência",
    body: [
      "Garantia legal. Ficam assegurados à CONTRATANTE os direitos previstos em lei, em especial no Código de Defesa do Consumidor, quanto a vícios de qualidade e de quantidade dos produtos e serviços, independentemente de qualquer garantia contratual.",
      "{{garantia_contratual}}",
      "A garantia contratual, quando existir, é complementar e não substitui a garantia legal. Ela não cobre danos decorrentes de mau uso, de intervenção de terceiros, de acidentes ou de agentes externos (como infiltrações e excesso de umidade), desde que demonstrado o nexo com o dano, sem prejuízo dos direitos legais da CONTRATANTE.",
      "A CONTRATANTE pode solicitar assistência pelos contatos da CONTRATADA indicados neste contrato ({{contato_empresa}}). A CONTRATADA responderá em prazo razoável e agendará a avaliação do problema com a CONTRATANTE.",
    ].join("\n\n"),
  },
  {
    id: "c11",
    title: "Atrasos e inadimplemento",
    body: [
      "Em caso de atraso no pagamento de qualquer parcela, incidirão multa moratória de {{multa}} sobre o valor em atraso e juros de mora de {{juros}} ao mês, calculados pro rata die, sem prejuízo de outras medidas previstas em lei.",
      "Se o atraso na entrega ou na instalação decorrer de causa imputável à CONTRATADA e ultrapassar {{tolerancia_atraso}} dias dos prazos previstos, a CONTRATANTE poderá notificá-la por escrito para cumprir a obrigação em prazo razoável e, persistindo o atraso, rescindir o contrato, com a devolução dos valores pagos correspondentes ao que não foi entregue, sem prejuízo de seus demais direitos legais.",
    ].join("\n\n"),
  },
  {
    id: "c12",
    title: "Cancelamento e rescisão",
    body: [
      "A CONTRATANTE pode solicitar o cancelamento por comunicação escrita. Havendo cancelamento, serão devolvidos os valores já pagos, descontadas apenas as despesas comprovadamente realizadas pela CONTRATADA em função do contrato (como medições, projeto, materiais já adquiridos ou cortados sob medida e serviços já executados), a serem demonstradas à CONTRATANTE. {{retencao_frase}}",
      "Se a contratação tiver ocorrido fora do estabelecimento comercial da CONTRATADA (inclusive por telefone ou internet), aplica-se à CONTRATANTE consumidora o direito de arrependimento previsto no art. 49 do Código de Defesa do Consumidor, no prazo de 7 (sete) dias, nos termos da lei.",
      "O descumprimento de obrigação essencial por qualquer das partes permite à outra notificá-la por escrito para sanar a falta em prazo razoável e, não sendo sanada, rescindir o contrato, observados os direitos legais de cada parte.",
    ].join("\n\n"),
  },
  {
    id: "c13",
    title: "Tratamento de dados pessoais",
    body: [
      "Os dados pessoais da CONTRATANTE (como nome, documento, contato e endereço) serão tratados pela CONTRATADA exclusivamente para a execução deste contrato, a emissão de documentos, o cumprimento de obrigações legais e o exercício regular de direitos, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).",
      "Os dados não serão compartilhados com terceiros, exceto quando indispensável à execução do contrato (por exemplo, transporte) ou por exigência legal. A CONTRATANTE pode exercer os direitos previstos no art. 18 da LGPD pelos contatos da CONTRATADA: {{contato_empresa}}.",
    ].join("\n\n"),
  },
  {
    id: "c14",
    title: "Disposições gerais",
    body: [
      "Qualquer alteração deste contrato deve ser feita por escrito e aceita por ambas as partes. A tolerância de uma parte quanto ao descumprimento de qualquer cláusula não implica renúncia a direitos nem novação.",
      "As comunicações entre as partes poderão ser feitas pelos telefones e e-mails indicados neste contrato, inclusive por aplicativos de mensagem, desde que seja possível comprovar o envio.",
      "Se alguma disposição deste contrato for considerada inválida, as demais permanecem em vigor.",
      "Fica eleito o foro do domicílio da CONTRATANTE para dirimir dúvidas decorrentes deste contrato, ressalvada a competência estabelecida em lei.",
    ].join("\n\n"),
  },
  {
    id: "c15",
    title: "Assinaturas",
    body: "E, por estarem de acordo, as partes assinam este contrato em duas vias de igual teor.",
  },
];

/** Marcadores que o editor de cláusulas oferece. */
export const PLACEHOLDER_HELP: Array<{ key: string; description: string }> = [
  { key: "contratada", description: "Nome da empresa contratada" },
  { key: "contratante", description: "Nome do cliente" },
  { key: "numero_contrato", description: "Número do contrato" },
  { key: "valor_total", description: "Valor total em reais" },
  { key: "valor_extenso", description: "Valor total por extenso" },
  { key: "multa", description: "Multa por atraso de pagamento" },
  { key: "juros", description: "Juros de mora ao mês" },
  { key: "tolerancia_atraso", description: "Dias de tolerância de atraso" },
  { key: "contato_empresa", description: "Telefone e e-mail da empresa" },
  { key: "local_instalacao", description: "Local da instalação" },
];

const FIXED_KEYS = new Set([
  "contratada", "contratante", "numero_contrato", "valor_total", "valor_extenso", "frase_formas_pagamento", "dados_pix",
  "observacoes_pagamento", "frase_prazo", "frase_datas", "local_instalacao", "logistica", "condicoes_especiais",
  "docs_tecnicos", "garantia_contratual", "multa", "juros", "tolerancia_atraso", "retencao_frase", "contato_empresa",
]);

export interface ContractMeta {
  /** "0001" ou "0001-R2" */
  numberLabel: string;
}

export function companyDisplayName(c: ContractContent["company"]): string {
  return c.legalName.trim() || c.tradeName.trim();
}

function pct(n: number): string {
  return `${formatNumber(n, 2)}%`;
}

function daysPhrase(n: number, unit: "corridos" | "uteis"): string {
  return `${n} (${intToWordsPt(n)}) dia${n === 1 ? "" : "s"} ${unit === "uteis" ? (n === 1 ? "útil" : "úteis") : (n === 1 ? "corrido" : "corridos")}`;
}

export function startMilestoneText(c: ContractContent): string {
  const s = c.schedule;
  if (s.startMilestone === "outro") return s.startMilestoneText.trim() || "o marco a ser definido entre as partes";
  return START_MILESTONE_LABELS[s.startMilestone];
}

/** Constrói o mapa marcador → texto. Marcadores sem dados viram "" (o parágrafo some se ficar vazio). */
export function buildPlaceholderValues(c: ContractContent, meta: ContractMeta): Record<string, string> {
  const pay = c.payment;
  const s = c.schedule;
  const t = c.terms;
  const company = c.company;
  const v: Record<string, string> = {};

  v.contratada = companyDisplayName(company) || "CONTRATADA";
  v.contratante = c.client.name.trim() || "CONTRATANTE";
  v.numero_contrato = meta.numberLabel;
  v.valor_total = formatBRL(pay.totalCents);
  v.valor_extenso = pay.totalCents > 0 ? moneyToWordsPt(pay.totalCents) : "valor a definir";

  const methods = pay.methods.map((m) => PAYMENT_METHOD_LABELS[m]);
  v.frase_formas_pagamento = methods.length
    ? `O pagamento será realizado por ${methods.length > 1 ? methods.slice(0, -1).join(", ") + " ou " + methods[methods.length - 1] : methods[0]}, conforme combinado entre as partes. A forma de pagamento é apenas uma informação contratual: este aplicativo não processa pagamentos.`
    : "";
  v.dados_pix =
    pay.methods.includes("pix") && company.pixKey.trim()
      ? `Para pagamentos por Pix, a chave da CONTRATADA é: ${company.pixKey.trim()}. A CONTRATANTE deve conferir o nome do recebedor antes de confirmar a transferência.`
      : "";
  v.observacoes_pagamento = pay.notes.trim() ? `Observações sobre o pagamento: ${pay.notes.trim()}` : "";

  v.frase_prazo = s.leadTime > 0
    ? `O prazo de fabricação é de ${daysPhrase(s.leadTime, s.leadUnit)}, contado a partir do seguinte marco inicial: ${startMilestoneText(c)}. O prazo termina na entrega dos móveis para instalação.`
    : "";
  const dates: string[] = [];
  if (isValidISODate(s.startDate)) dates.push(`início previsto em ${formatDateBR(s.startDate)}`);
  if (isValidISODate(s.deliveryDate)) dates.push(`entrega prevista em ${formatDateBR(s.deliveryDate)}`);
  if (isValidISODate(s.installationDate)) dates.push(`instalação prevista em ${formatDateBR(s.installationDate)}`);
  v.frase_datas = dates.length ? `Datas previstas: ${dates.join("; ")}. Elas dependem do marco inicial acima: se ele ocorrer depois da data de início prevista, as demais datas são deslocadas na mesma medida.` : "";

  v.local_instalacao =
    s.installationLocation.trim() || c.client.deliveryAddress.trim() || c.client.address.trim() || "o endereço indicado pela CONTRATANTE";
  v.logistica = s.logisticsNotes.trim() ? `Observações de logística: ${s.logisticsNotes.trim()}` : "";

  const enabled = c.specialConditions.filter((sc) => sc.enabled && sc.text.trim());
  v.condicoes_especiais = enabled.length
    ? [
        "Condições especiais do local e da instalação informadas pelas partes:",
        ...enabled.map((sc) => `• ${SPECIAL_CONDITION_DEFS[sc.key].label}: ${sc.text.trim()}`),
        "As condições acima não afastam as obrigações legais da CONTRATADA nem os direitos da CONTRATANTE.",
      ].join("\n\n")
    : "";

  const docs = c.externalDocs.filter((d) => d.description.trim());
  v.docs_tecnicos = docs.length
    ? [
        "Para a fabricação e a instalação, as partes tomam como referência os seguintes desenhos, medições ou projeto técnico aprovados:",
        ...docs.map((d) => `• ${d.description.trim()}`),
        "Esses documentos são apenas referenciados neste contrato: não estão anexados a este arquivo PDF e permanecem arquivados com as partes.",
      ].join("\n\n")
    : "";

  v.garantia_contratual =
    t.warrantyMonths > 0
      ? `Garantia contratual adicional. A CONTRATADA concede, além da garantia legal, garantia contratual de ${t.warrantyMonths} (${intToWordsPt(t.warrantyMonths)}) ${t.warrantyMonths === 1 ? "mês" : "meses"}, contada da conclusão da instalação, contra defeitos de fabricação e de instalação.${t.warrantyNotes.trim() ? " " + t.warrantyNotes.trim() : ""}`
      : "Garantia contratual adicional. Não há garantia contratual adicional à legal neste contrato.";

  v.multa = pct(t.lateFeePercent);
  v.juros = pct(t.interestMonthlyPercent);
  v.tolerancia_atraso = String(t.delayToleranceDays);
  v.retencao_frase =
    t.cancellationRetentionPercent > 0
      ? `Poderá ainda ser retido, a título de ressarcimento, percentual de até ${pct(t.cancellationRetentionPercent)} do valor pago, limitado aos prejuízos efetivamente comprovados e sem exceder o que a lei admite.`
      : "Não haverá retenção de valores além das despesas comprovadas acima.";

  const contacts = [company.phone.trim() && `telefone ${company.phone.trim()}`, company.email.trim() && `e-mail ${company.email.trim()}`].filter(Boolean);
  v.contato_empresa = contacts.length ? contacts.join(" / ") : "contatos informados pela CONTRATADA";
  return v;
}

/** Substitui {{marcador}}. Marcadores desconhecidos permanecem visíveis (a revisão avisa). Remove parágrafos que ficarem vazios. */
export function resolveClauses(c: ContractContent, meta: ContractMeta): ResolvedClause[] {
  const values = buildPlaceholderValues(c, meta);
  return c.clauses.map((clause) => {
    const paragraphs: string[] = [];
    for (const raw of clause.body.split(/\n\s*\n/)) {
      const text = raw.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, key: string) => (FIXED_KEYS.has(key) ? (values[key] ?? "") : m)).trim();
      if (!text) continue;
      // um marcador pode ter expandido para vários parágrafos
      for (const p of text.split(/\n\s*\n/)) if (p.trim()) paragraphs.push(p.trim());
    }
    return { title: clause.title, paragraphs };
  });
}

export function findUnknownPlaceholders(clauses: Clause[]): string[] {
  const found = new Set<string>();
  for (const cl of clauses) {
    for (const m of cl.body.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) if (!FIXED_KEYS.has(m[1])) found.add(m[1]);
  }
  return [...found];
}

/** Resumo numérico usado no documento (entrada em reais e %). */
export function paymentLines(c: ContractContent) {
  const sum = paymentSummary(c.payment);
  return { ...sum, down: downPaymentCents(c.payment) };
}
