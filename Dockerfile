# syntax=docker/dockerfile:1.6
#
# Production-Image für ace, gedacht für Azure Container Apps in
# Germany West Central. Multi-Stage: Builder installiert dev-deps und ruft
# `pnpm build`, Runtime enthält nur das self-contained Nitro-Bundle und die
# Drizzle-Migrationen.
#
# Image-Größe runtime ~150 MB. Build-Zeit ~3-5 min lokal (cold), 20-40 s wenn
# pnpm-Layer-Cache greift.

# ---- Builder ----------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# pnpm via Corepack, gepinnt auf 10 (kompatibel mit Lockfile-Version 9.0)
RUN corepack enable && corepack prepare pnpm@10 --activate

# Native-Build-Tools für better-sqlite3
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 build-essential ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Dependencies-Layer separat von Source — bessere Cache-Hit-Rate beim Re-Build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Source kopieren und bauen
COPY . .
RUN pnpm build

# ---- Runtime ----------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Self-contained Nitro-Bundle inkl. better-sqlite3-Native-Binary. Nitro packt
# alle Runtime-Dependencies in .output/server/node_modules/, daher kein
# zusätzliches `node_modules`-Copy nötig.
COPY --from=builder /app/.output ./.output

# Drizzle-Migration-SQL-Files. Werden vom Nitro-Plugin
# server/plugins/db-migrate.ts beim Server-Start gelesen — idempotent dank
# Drizzle's __drizzle_migrations-Tabelle.
COPY --from=builder /app/server/db/migrations ./server/db/migrations

# Data-Mount-Punkt für die SQLite-Datei. In Azure Container Apps wird /data
# beim Container-Start via Azure-Files-Volume überlagert (siehe
# docs/operations/azure-container-apps.md). Vor dem ersten Mount ist das
# Verzeichnis nur leer.
RUN mkdir -p /data

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    NUXT_DB_PATH=/data/ace.db

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
