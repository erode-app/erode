# Stage 1: Build
FROM node:24-slim AS builder
WORKDIR /app

# Copy workspace config files for dependency resolution
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/web/package.json packages/web/

# Install only core workspace deps
RUN npm ci -w @erode/core

# Copy core source and build
COPY packages/core/tsconfig.json packages/core/
COPY packages/core/src/ packages/core/src/
COPY packages/core/scripts/ packages/core/scripts/
RUN npm run build -w @erode/core

# Stage 2: Runtime
FROM node:24-slim
RUN apt-get update && \
    apt-get install -y --no-install-recommends git jq curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/web/package.json packages/web/
RUN npm ci -w @erode/core --omit=dev

COPY --from=builder /app/packages/core/dist/ packages/core/dist/
COPY entrypoint.sh /entrypoint.sh
COPY entrypoint-gitlab.sh /entrypoint-gitlab.sh
RUN chmod +x /entrypoint.sh /entrypoint-gitlab.sh
RUN useradd -r -s /bin/false erode && chown -R erode:erode /app
USER erode
ENTRYPOINT ["/entrypoint.sh"]
