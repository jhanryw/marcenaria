# Marcenaria — Orçamentos de MDF (PWA)

Aplicativo web progressivo, mobile-first, para marceneiros: cadastra as peças de um móvel, calcula o **plano de corte**
(quantas chapas de MDF comprar), a **fita de borda**, os **custos** e o **preço de venda** com markup. Funciona **offline**
e guarda tudo **no próprio aparelho** (IndexedDB). Sem backend, sem login.

Stack: Next.js (App Router, exportação estática) · TypeScript · Tailwind CSS v4 · componentes estilo shadcn/ui (Radix) ·
Lucide · Dexie (IndexedDB) · Zod · Vitest · Playwright.

## Executar

```bash
npm install
npm run dev          # desenvolvimento (http://localhost:3100 via launch.json, ou a porta que o Next indicar)
npm run build        # gera a pasta out/ (site estático + service worker)
npm start            # serve out/ em http://localhost:3000 para testar o build de produção
```

> O service worker só é registrado no build de produção (`npm run build && npm start`).

### Testes

```bash
npm run verify:out   # audita out/ (rotas, manifest, ícones, fontes, pré-cache do SW)
npm test             # 195 testes unitários: corte, fita, financeiro, banco, backup, contratos, exportação e unidades
npm run typecheck
npm run lint
npm run build && npm run test:e2e   # E2E (Playwright/Chromium) em 5 tamanhos de tela, offline, PWA, backup
npx playwright install chromium     # uma vez, para o E2E
```

## Publicar

O build é um site 100% estático (`out/`). Publique em qualquer hospedagem estática **com HTTPS** (obrigatório para PWA e
service worker; `localhost` é exceção):

- **EasyPanel (Docker + nginx)**: veja a seção [Deploy no EasyPanel](#deploy-no-easypanel-dockerfile--nginx) abaixo.
- **Vercel / Netlify / Cloudflare Pages**: comando `npm run build`, diretório de saída `out`.
- **GitHub Pages (subpasta)**: `NEXT_PUBLIC_BASE_PATH=/nome-do-repo npm run build` e publique `out/`.
- Servidor próprio (nginx etc.): use o `nginx.conf` deste repositório como referência.

Ícones: `npm run icons` regenera `public/icons` (ícones, maskable, apple-touch-icon e splash do iOS).

## Deploy no EasyPanel (Dockerfile + nginx)

Arquitetura de produção: **Docker multi-stage**. Estágio 1 (`node:22-alpine`) roda `npm ci` e `npm run build`; estágio 2 (`nginx:alpine`) serve
só a pasta `out/` na **porta 80**. A imagem final não tem Node.js, código-fonte nem `node_modules`. Continua 100% frontend: sem backend,
sem banco remoto, **sem variáveis de ambiente e sem volumes** (os dados dos usuários ficam no navegador de cada um).

Arquivos: `Dockerfile`, `nginx.conf`, `.dockerignore`.

### Passo a passo

1. **Suba o código para um repositório Git** (GitHub/GitLab ou outro acessível ao EasyPanel). A raiz do repositório deve conter `Dockerfile`,
   `nginx.conf`, `package.json` e `package-lock.json`. (Alternativa: enviar o código por upload ZIP no próprio EasyPanel.)
2. No EasyPanel, abra (ou crie) o **Projeto** e clique em **+ Service → App**. Dê um nome, por exemplo `marcenaria`.
3. Aba **Source**: escolha o **Git** (ou GitHub) e informe repositório e branch (ex.: `main`). *Build path* / contexto: `/` (raiz).
4. Aba **Build**: escolha o método **Dockerfile** e informe o caminho **`Dockerfile`** (arquivo na raiz do repositório).
   Não há *build arguments* nem variáveis de ambiente a configurar.
5. Aba **Domains & Proxy** (Domínios): adicione seu domínio (ex.: `orcamentos.seudominio.com.br`) com a **porta interna `80`**.
   Aponte o DNS (registro **A**/CNAME) para o IP do servidor do EasyPanel; o **HTTPS (Let's Encrypt)** é emitido automaticamente pelo EasyPanel
   quando o DNS resolve. HTTPS é obrigatório para instalar o PWA e ativar o service worker.
6. Clique em **Deploy**. O primeiro build leva alguns minutos (instalação das dependências + build do Next). Acompanhe pelos logs de build.
7. Abra o domínio, teste uma rota interna (ex.: `/projetos`, `/contratos`) e atualize a página (F5). Instale o app pelo navegador.

> Os nomes exatos das abas e botões podem variar um pouco conforme a versão do EasyPanel; o que importa é: origem = Git, build = Dockerfile
> em `Dockerfile`, porta interna = `80`, domínio com HTTPS.

### Redeploy (atualizações)
- Faça commit e push na branch configurada e clique em **Deploy** no EasyPanel (ou ative o *auto deploy*/webhook do repositório para deploy a cada push).
  O EasyPanel refaz o build da imagem e troca o container.
- A cada build o service worker muda de versão: quem já usa o app vê o aviso **“Nova versão disponível — Atualizar agora”**. O HTML e o
  `sw.js` são servidos com `Cache-Control: no-cache` (sempre revalidados) e os arquivos com hash em `/_next/static/` com cache de 1 ano.
- **Os orçamentos e contratos dos usuários não são afetados por redeploys**: ficam no IndexedDB do navegador, fora da imagem.
- O app é servido na **raiz do domínio** (`/`). Para publicar em subcaminho seria preciso `NEXT_PUBLIC_BASE_PATH` e ajustar o `nginx.conf` (não suportado por esta imagem).

### O que o nginx.conf faz
- Escuta na porta 80; `/healthz` responde `200 ok` (usado pelo `HEALTHCHECK` do Dockerfile).
- **Rotas**: `try_files $uri $uri/index.html =404`. `/projetos`, `/projetos/` e `/projeto/?id=...` entregam o HTML exportado com **200, sem
  redirecionamento**, tanto no acesso direto quanto no refresh. Arquivo inexistente é **404 de verdade** (sem fallback para `index.html`).
- **Cache**: `/_next/static/*` → `public, max-age=31536000, immutable`; `/icons/` e `/fonts/` → 7 dias; todo o resto (HTML, `sw.js`,
  `manifest.webmanifest`, payloads `.txt`) → `no-cache`.
- **MIME** correto para `manifest.webmanifest` (`application/manifest+json`) e `sw.js` (JavaScript); gzip para texto/JS/CSS/JSON/SVG.
- Cabeçalhos: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`; bloqueia arquivos ocultos (`/.env`, `/.git`).
  Não define CSP nem HSTS (configure HSTS no proxy/domínio se quiser).

### Testar a imagem localmente (requer Docker)
```bash
docker build -t marcenaria .
docker run --rm -p 8080:80 marcenaria
# em outro terminal: smoke test de deploy (rotas, refresh, MIME, cache, PWA, 404)
E2E_BASE_URL=http://localhost:8080 npx playwright test deploy --project=desktop
```
Sem Docker, dá para validar o export com `npm run build && npm run verify:out` (confere rotas, manifest, ícones, fontes e todo o pré-cache do
service worker) e rodar a suíte com as regras de rota do nginx: `NGINX_LIKE=1 PORT=4173 node scripts/serve.mjs` + `npm run test:e2e`.

### Instalar no celular
- **Android/Chrome**: banner/botão “Instalar” (também em Configurações) ou menu ⋮ → *Instalar aplicativo*.
- **iPhone/iPad (Safari)**: Compartilhar → *Adicionar à Tela de Início*. O iOS não oferece o prompt automático.

## Dados, backup e atualizações

- Dados ficam no **IndexedDB**. Não é armazenamento infalível: limpar dados do navegador, modo anônimo, remover o app ou trocar
  de aparelho **apaga tudo**. O app avisa na tela inicial se faz mais de 7 dias sem backup, pede armazenamento persistente
  (`navigator.storage.persist`) e oferece **Exportar/Importar JSON** em Configurações.
- O backup é versionado (`schemaVersion`), validado com Zod e importado em transação (tudo ou nada). Modos: **Mesclar**
  (vence o `updatedAt` mais recente) ou **Substituir**. Migrações futuras entram em `src/db/migrations.ts`.
- **Atualizações não apagam orçamentos**: o service worker guarda só arquivos do app; os dados ficam no IndexedDB, que ele nunca
  toca. A nova versão baixa em segundo plano e só entra quando o usuário toca em “Atualizar agora”.
- Cada orçamento guarda **cópias (snapshots)** dos materiais e fitas com os preços da época. Mudar o catálogo não altera
  orçamentos antigos; o editor mostra “Catálogo mudou — atualizar” para aplicar de propósito.

## Arquitetura

```
src/domain/     schema.ts (Zod = tipos + validação + backup), defaults.ts
src/engine/
  cutting/      guillotine.ts (heurística), plan.ts (orquestra, métricas, reserva), validate.ts (validação geométrica)
  finance/      edge-banding.ts (fita), pricing.ts (custos, mão de obra, markup, margem)
  project-calc.ts, summary.ts   (composição e textos de resumo) — funções puras, sem UI
src/db/         db.ts (Dexie v2), repository.ts, contracts.ts, backup.ts, migrations.ts, seed.ts
src/lib/units.ts   conversão cm ↔ mm (única fonte da regra 1 cm = 10 mm)
src/export/     exportação do plano de corte (modelo, validação, CSV, PDF paisagem)
src/contracts/  módulo de contratos: modelo de cláusulas, parcelas, prazos, revisão, PDF (pdf/)
src/components/ UI (ui/ = primitivos shadcn-style; editor/ = abas do orçamento)
src/app/        /, /projetos, /projeto?id=, /projeto/resultado?id=, /materiais, /configuracoes
scripts/        postbuild.mjs (gera sw.js), sw.template.js, serve.mjs, generate-icons.mjs
tests/          unitários (Vitest)      tests-e2e/   E2E (Playwright)
```




## Unidades de medida: centímetros na tela, milímetros por dentro

- **Interface**: comprimento e largura de **peças** e **chapas** (e o tamanho mínimo de sobras) são digitados e exibidos em **centímetros**
  (275 × 185 cm). Aceita vírgula ou ponto (`60,5` e `60.5`) e abre o teclado numérico decimal no celular.
  Espessura do MDF, espessura da serra, margem e medidas da fita continuam em **mm**, com a unidade escrita no rótulo.
  Área segue em m², fita em metros, preços em R$.
- **Dentro do app tudo é milímetro**: dados gravados no IndexedDB, motor de corte, posições, serra, margens, validação geométrica,
  aproveitamento, exportações e backups. A conversão acontece só na digitação/exibição, **em um único módulo**
  (`src/lib/units.ts`: `cmToMm`, `mmToCm`, `parseCmToMm`, `formatCm`) e no campo `CmInput`.
  A conversão desloca a vírgula uma casa e só limpa o ruído de ponto flutuante na 6ª casa (1,1 cm = 11 mm exatos); ida e volta é exata.
- **Dados antigos**: nenhuma migração e nenhuma multiplicação. Uma peça salva como 600 × 1800 mm aparece como 60 × 180 cm e, ao salvar de novo,
  continua 600 × 1800 mm. Backups antigos e novos são idênticos em unidade (mm).
- **Plano de corte em mm**: visualização 2D, medidas das peças e das chapas, PDF para a madeireira e CSV continuam em milímetros, com a unidade
  identificada (cabeçalhos “(mm)”, “Medidas em milímetros”).
- **Contratos**: o campo de dimensões dos móveis pede **centímetros** (ex.: `240 × 220 × 60 cm`). Contratos já emitidos e suas versões congeladas
  não são alterados.

## Exportar plano de corte para madeireira

Na aba **Corte** do projeto: **Exportar plano de corte** abre “Exportar para madeireira”, com três saídas e **pré-visualização antes de baixar**:

- **Plano completo (PDF, A4 paisagem)**: resumo (projeto/referência, aviso de estimativa heurística, materiais, cor/acabamento, espessura, tamanho da chapa,
  margem, serra, veio, chapas por material); **uma página por chapa** com o desenho em escala (peças com código e medidas, ↻ peças giradas, seta do veio,
  sobras reaproveitáveis numeradas e sobras pequenas hachuradas); **lista consolidada de peças** (código, medidas, quantidade, material, gira?, veio,
  observações); **fita de borda em seção separada** (bordas por peça e total por tipo).
- **Só lista de peças (PDF)** e **Lista de peças (CSV genérico)**: `;` como separador, UTF-8 com BOM, vírgula decimal, CRLF, medidas em mm.
- **Compartilhar com a madeireira**: menu nativo do aparelho (WhatsApp, e-mail…) com o arquivo; sem suporte, baixa o arquivo.
- **Desenho = cálculo**: usa as posições reais do motor de corte (`planProjectCutting`); nada é redesenhado.
- **Validação antes de exportar**: validador geométrico do motor **+** conferência independente sobre o próprio modelo exportado (todas as peças
  posicionadas na quantidade cadastrada, medidas iguais às do cadastro, dentro da área útil/margens, sem sobreposição respeitando a serra, rotação e
  veio). Plano incompleto/inválido **bloqueia** o PDF do plano e mostra os problemas; a lista de peças continua exportável, com aviso explícito de
  “plano não validado” no documento e no nome do arquivo.
- **Privacidade**: o modelo é montado por lista branca. **Nunca** entram preços, custos, markup, lucro, preço de venda, CPF, nome/telefone do cliente,
  descrição comercial ou observações do orçamento. O nome do projeto no documento é editável (para não expor o cliente); o contato da marcenaria só
  entra se você marcar. Testado no modelo, no PDF e no CSV (inclusive ausência de “R$”).
- **Offline**: tudo é gerado no navegador (pdf-lib + fontes pré-cacheadas), sem backend.
- **Aviso**: todo PDF informa que o plano é **estimado por algoritmo heurístico, sujeito à validação técnica da madeireira antes da execução**.
- **Exportadores específicos**: o CSV é **genérico** e não presume compatibilidade com nenhuma seccionadora. A arquitetura (`src/export/exporters.ts`,
  `PartsListExporter` + `registerPartsExporter`) permite adicionar formatos próprios de cada equipamento/software sem mexer no motor ou no PDF.

## Fórmulas

Dinheiro é sempre **centavos inteiros** (sem erro de ponto flutuante); medidas em mm.

| Item | Fórmula |
|---|---|
| Subtotal de custo | `quantidade × valor unitário` (ou valor fixo) |
| Mão de obra | `horas × custo/hora` (ou valor fixo); fabricação e instalação separadas |
| Fita (por tipo) | `Σ comprimento das bordas marcadas × quantidade × (1 + perda%)` → metros × preço/m |
| Custo das chapas | `chapas a comprar × preço da chapa`, por material |
| Chapas a comprar | `chapas do plano` + reserva (`⌈n × (1+p/100)⌉` ou `n + ⌈k⌉`) |
| Custo total | MDF + fita + custos extras + mão de obra |
| **Preço de venda** | `custo total × (1 + markup/100)` |
| Lucro bruto | `preço − custo` |
| Margem bruta | `lucro ÷ preço` (≠ markup) |
| Preço manual | `markup efetivo = (preço − custo) ÷ custo`; `margem = (preço − custo) ÷ preço` |
| Após deduções (estimativa) | `lucro bruto − preço × (impostos + comissões + indiretos)%` — **não é lucro líquido** |

Bordas: **superior/inferior** medem o *comprimento* da peça; **esquerda/direita** medem a *largura*. A fita soma apenas as
bordas marcadas.

## Plano de corte: como funciona e limitações

- Por material: área útil = chapa − margem de segurança nas 4 bordas. O eixo x acompanha o **comprimento** da chapa.
- Heurística de **corte guilhotinado** com retângulos livres: ao posicionar uma peça, o retângulo livre se divide em dois por
  cortes de ponta a ponta, deixando a espessura da serra (kerf) entre peças. Resultado sempre executável em esquadrejadora.
- Testa **108 combinações** (6 ordenações × 3 critérios de encaixe × 6 regras de divisão) e escolhe a de menos chapas
  (desempate: última chapa mais vazia → sobra maior).
- **Veio obrigatório**: o comprimento da peça fica paralelo ao comprimento da chapa e a rotação é proibida. Sem veio, gira 90°
  se a peça permitir.
- **Não é ótimo garantido** (o problema é NP-difícil). O app mostra o *limite inferior por área* e diz quando o resultado o
  iguala (ótimo comprovado); caso contrário informa que é uma estimativa.
- Uma só dimensão de chapa por material; sem aproveitamento de retalhos de estoque anterior; kerf considerado entre peças
  (a margem já embute o refilo de borda).
- Peças que não cabem aparecem em “não cabem”. O orçamento fica **incompleto**: o total de chapas mostra `n*` e há alertas; nunca
  é exibida uma quantidade fictícia. Todo plano é revalidado geometricamente (limites, sobreposição, kerf, rotação, guilhotina,
  balanço de áreas); falha de validação vira erro na tela.
- Sobras: **reaproveitável** (retângulo ≥ dimensões mínimas configuráveis), **sobra pequena** e **perda de corte** (serra) +
  refilo são contabilizadas separadamente.

## Cobertura de testes

Unitários (`tests/`): peças diferentes/iguais/repetidas, vários materiais, peça maior que a chapa, rotação proibida, veio,
efeito do kerf e da margem, reservas (inclusive arredondamento), fita em bordas distintas, centavos, markup 0% e alto, preço
manual, snapshots de preço, duplicar/excluir/buscar, persistência entre “sessões”, backup (exportar, restaurar, mesclar,
inválido, versão futura, migração) e **300 cenários aleatórios** validados geometricamente.

E2E (`tests-e2e/`, 5 tamanhos de tela): fluxo completo com recarga e **offline**, sem rolagem horizontal, navegação
inferior/lateral, teclado decimal, manifest/ícones/service worker, cache offline de todas as rotas, atualização do app sem
perda de dados e backup/restauração pela interface.

> Instalação como app: valide em Chrome/Android e Safari/iOS reais, com HTTPS. O Playwright cobre manifest, SW e offline, mas
> não o prompt nativo de instalação.

## Módulo de contratos

Fluxo: **Resultado do orçamento → Gerar contrato** → assistente em 5 etapas (Cliente · Móveis · Valores · Prazo · Revisão e PDF) →
pré-visualizar → baixar minuta → **Emitir** → baixar/compartilhar PDF → (opcional) registrar assinatura. Lista em `/contratos`.

- **100% no navegador**: PDF com `pdf-lib` + `@pdf-lib/fontkit`, fontes Noto Serif e Inter (OFL) em `public/fonts`, pré-cacheadas pelo service
  worker: gera, visualiza e baixa PDF **offline**. Sem backend, sem APIs externas, sem analytics.
- **Pré-visualização = PDF**: um único motor de layout A4 (`src/contracts/pdf/layout.ts`) alimenta o PDF e a prévia em SVG. Linhas são quebradas pela
  largura real das fontes; títulos ficam com o texto seguinte; sem linhas órfãs/viúvas; o fecho (frase final + local/data + assinaturas) é um bloco
  indivisível, então as assinaturas nunca ficam sozinhas numa página. Paginação “Página i de N” e rodapé discreto.
- **Dados**: contrato guarda cópia própria de empresa, cliente, itens, pagamento, prazos, condições e **texto final das cláusulas**. Só entram dados
  comerciais; custos, markup, lucro, aproveitamento, ferragens (preço) e lista de cortes **nunca** são copiados (há testes no conteúdo e no texto extraído
  do PDF).
- **Estados**: rascunho → emitido → assinado | cancelado. Só rascunho é editável. Ao emitir, `issued` congela conteúdo e cláusulas (e a data); o PDF emitido
  é regenerado dessa cópia, de forma determinística. Mudar orçamento, configurações ou catálogo depois não altera o contrato. Gerar PDF **não** assina;
  “assinado” é registro manual (o app não verifica nem certifica assinaturas). “Nova revisão” cria rascunho vinculado (`0001-R2`) a partir do conteúdo emitido.
- **Pagamento** em centavos: entrada em % ou R$, saldo dividido igualmente (diferença máxima de 1 centavo, soma exata), parcelas editáveis individualmente
  (valor, data ou evento: assinatura, aprovação, início da fabricação, entrega, conclusão da instalação). Emissão exige entrada + parcelas = total.
  Valor total por extenso em português. A forma de pagamento é só informativa.
- **Prazos**: marco inicial explícito, prazo em dias corridos ou úteis (sábados, domingos e **feriados cadastrados em Configurações**, sem API), datas
  sugeridas e editáveis; contradições (entrega antes do início etc.) bloqueiam a emissão.
- **Revisão**: obrigatórios (bloqueiam emitir) × avisos × lembretes. Obrigatórios: nome da empresa e do cliente, ao menos um móvel, valor total, soma de
  pagamento exata, vencimentos definidos, prazo de fabricação e prazos coerentes. CPF/CNPJ são validados quando preenchidos, mas só **avisam**.
- **Cláusulas**: 15 seções, texto-base editável, marcadores `{{...}}`, “salvar como modelo padrão”, restaurar. Garantia legal e garantia contratual adicional
  são itens separados; multa, juros, tolerância de atraso e retenção no cancelamento são parâmetros (padrão: multa 2%, juros 1% a.m., **sem retenção**);
  foro padrão = domicílio do contratante. Sem perda integral da entrada, renúncia de garantia ou exclusão geral de responsabilidade.
  **O modelo não é juridicamente homologado: peça revisão de um advogado.**
- **Privacidade**: tudo fica no aparelho, **sem criptografia** (o app avisa). Em Configurações: excluir contratos, apagar nomes/telefones dos orçamentos.
  Contratos, empresa (com logotipo reduzido a ≤180 KB) e contadores entram no backup JSON.
- **Banco**: Dexie v2 só *adiciona* a tabela `contracts` e completa as configurações; backups v1 continuam importando (migração 1→2).

### Limitações conhecidas
- Sem assinatura eletrônica certificada, cobrança, envio de mensagens ou integrações (fora do escopo).
- O PDF usa subconjunto Latin das fontes: caracteres fora dele (emoji, CJK, ✓) viram “?”. Acentos e símbolos usuais do português estão cobertos.
- Documentos técnicos citados no contrato são apenas **referenciados**, não anexados ao PDF.
- Feriados móveis e locais precisam ser cadastrados à mão; só os nacionais de data fixa têm atalho.
- Numeração de contratos é por aparelho: dois aparelhos com bancos separados podem gerar o mesmo número.
- Compartilhar arquivo PDF depende do Web Share do navegador; sem suporte, o app baixa o arquivo.
