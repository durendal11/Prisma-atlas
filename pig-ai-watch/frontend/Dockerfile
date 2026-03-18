# ── Frontend Dockerfile ─────────────────────────────────────────
# Multi-stage build for Pig AI Watch React frontend
# Works on macOS, Windows (Docker Desktop), and Linux

# ── Stage 1: Build ─────────────────────────────────────────────
FROM node:18-alpine AS build

WORKDIR /app

# Enable pnpm via corepack (ships with Node 18+)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependency manifests and postinstall script (needed during install)
COPY package.json pnpm-lock.yaml ./
COPY scripts/ ./scripts/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build-time env: in Docker the nginx proxy handles /api → backend,
# so the frontend should use a relative URL (empty string).
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

# Build the production bundle
RUN pnpm run build

# ── Stage 2: Serve with nginx ──────────────────────────────────
FROM nginx:alpine

# Copy built assets and ensure nginx worker can read them
COPY --from=build /app/dist /usr/share/nginx/html
RUN chmod -R 755 /usr/share/nginx/html

# Copy nginx config (already proxies /api → backend:8000)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
