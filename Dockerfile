# syntax=docker/dockerfile:1
#
# Marcenaria — imagem de produção para EasyPanel (ou qualquer host Docker).
#
#   Estágio 1 (build):   Node.js LTS instala dependências e gera o site estático em /app/out
#   Estágio 2 (runtime): nginx:alpine serve SOMENTE os arquivos de /app/out na porta 80
#
# A imagem final NÃO contém Node.js, código-fonte, node_modules nem dependências de desenvolvimento.
# O app é 100% frontend: não há backend, banco remoto nem servidor Node em produção.

ARG NODE_VERSION=22

# ---------------------------------------------------------------------------
# 1) BUILD
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

# libc6-compat: recomendado pelo Next.js em Alpine (musl) para binários nativos
RUN apk add --no-cache libc6-compat

ENV NEXT_TELEMETRY_DISABLED=1 \
    CI=true

# Camada de dependências (só invalida quando package*.json mudam)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Código-fonte (respeita o .dockerignore) e build estático -> /app/out (+ out/sw.js)
COPY . .
RUN npm run build

# Falha o build da imagem se faltar algo essencial ou se algum arquivo referenciado
# (rotas, manifest, ícones, fontes, pré-cache do service worker) não existir em out/
RUN test -f out/index.html && test -f out/sw.js && test -f out/manifest.webmanifest \
 && node scripts/verify-static.mjs

# ---------------------------------------------------------------------------
# 2) RUNTIME (nginx)
# ---------------------------------------------------------------------------
FROM nginx:alpine AS runtime

# Remove o site padrão e instala a configuração do app
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/marcenaria.conf

# Apenas o resultado estático do build
COPY --from=build /app/out /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1

# CMD/ENTRYPOINT herdados da imagem oficial do nginx (nginx -g 'daemon off;')
