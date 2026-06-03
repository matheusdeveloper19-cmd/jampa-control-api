# ============================================================
# Jampa Control API — Dockerfile
# Multi-stage build: menor imagem final, sem devDependencies
# ============================================================

# ── Stage 1: instalar dependências ───────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copiar manifests primeiro (cache de layer)
COPY package.json package-lock.json* ./

# Instalar apenas dependências de produção
RUN npm ci --omit=dev

# ── Stage 2: imagem final ─────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Usuário não-root para segurança
RUN addgroup -S jampa && adduser -S jampa -G jampa

# Copiar dependências instaladas + código-fonte
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./

# Permissões
RUN chown -R jampa:jampa /app
USER jampa

# Porta padrão (Railway sobrescreve via $PORT)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3001}/health || exit 1

# Iniciar
CMD ["node", "src/server.js"]
