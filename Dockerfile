# Stage 1: Build
FROM node:24-slim AS builder
WORKDIR /app

# Copy workspace config files for dependency resolution
COPY package.json package-lock.json ./

# All workspace package.json files are needed for npm ci to validate
# the lockfile against the full workspace topology — even though only
# core is installed. No source code is copied for the other packages.
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/web/package.json packages/web/

# Install only core workspace deps
RUN npm ci --workspace=packages/core

# Copy core source and build
COPY packages/core/tsconfig.json packages/core/
COPY packages/core/src/ packages/core/src/
COPY packages/core/scripts/ packages/core/scripts/
RUN npm run build --workspace=packages/core

# Stage 2: Runtime
FROM node:24-slim
RUN apt-get update && \
    apt-get install -y --no-install-recommends git jq curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/web/package.json packages/web/
RUN npm ci --workspace=packages/core --omit=dev

COPY --from=builder /app/packages/core/dist/ packages/core/dist/
COPY entrypoint.sh /entrypoint.sh
COPY entrypoint-gitlab.sh /entrypoint-gitlab.sh
RUN chmod +x /entrypoint.sh /entrypoint-gitlab.sh
ENTRYPOINT ["/entrypoint.sh"]
