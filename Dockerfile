# Front do DRPCommerce: build estático (Vite) servido por nginx sem root.
# A imagem final roda em ARM64 (VMs Ampere da Oracle). O build roda na arquitetura
# da máquina que constrói ($BUILDPLATFORM): o resultado são arquivos estáticos,
# iguais em qualquer arquitetura, e assim não há emulação no `npm ci`.
#
#   docker buildx build --platform linux/arm64 --load -t drpcommerce/front:AAAA.MM.DD .
#
# Na main, o GitHub Actions gera e publica a imagem no GHCR (.github/workflows/imagem-front.yml).
#
# As variáveis VITE_* ficam gravadas no build: para mudar, gere a imagem de novo.

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# --ignore-scripts: o husky (hook de commit) não existe fora do repositório git.
RUN npm ci --ignore-scripts

COPY . .

# Produção chama o Gateway no mesmo host (/api/store, /api/drop): caminhos relativos.
# O painel (#/admin) só monta com VITE_ADMIN_ENABLED=true.
ARG VITE_ADMIN_ENABLED=true
ARG VITE_STORE_API_BASE_URL=/api/store/api
ARG VITE_DROP_API_BASE_URL=/api/drop/api
ENV VITE_API_MODE=http \
    VITE_ADMIN_ENABLED=$VITE_ADMIN_ENABLED \
    VITE_STORE_API_BASE_URL=$VITE_STORE_API_BASE_URL \
    VITE_DROP_API_BASE_URL=$VITE_DROP_API_BASE_URL

RUN npm run ds:check && npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
