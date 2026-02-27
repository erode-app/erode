# syntax=docker/dockerfile:1

# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:24-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/architecture/package.json packages/architecture/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/web/package.json packages/web/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=packages/core

COPY packages/core/tsconfig.json packages/core/
COPY packages/core/src/ packages/core/src/
COPY packages/core/scripts/ packages/core/scripts/
RUN npm run build --workspace=packages/core

# ── Stage 2: JRE ───────────────────────────────────────────────
FROM eclipse-temurin:21-jre-noble AS jre

# ── Stage 3: Structurizr WAR (runs parallel with Stage 1) ──────
FROM node:24-slim AS structurizr
ARG STRUCTURIZR_VERSION=2026.02.01
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fSL -o /structurizr.war \
      "https://download.structurizr.com/structurizr-${STRUCTURIZR_VERSION}.war" && \
    rm -rf /var/lib/apt/lists/*

# ── Stage 4: Runtime ───────────────────────────────────────────
FROM node:24-slim
WORKDIR /app

COPY --from=jre /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"

COPY --from=structurizr /structurizr.war /opt/structurizr.war
ENV STRUCTURIZR_CLI_PATH=/opt/structurizr.war

RUN apt-get update && \
    apt-get install -y --no-install-recommends git jq ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/architecture/package.json packages/architecture/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/web/package.json packages/web/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=packages/core --omit=dev && \
    npm cache clean --force

COPY --from=builder /app/packages/core/dist/ packages/core/dist/

COPY --chmod=755 entrypoint.sh entrypoint-gitlab.sh entrypoint-bitbucket.sh /

ENTRYPOINT ["/entrypoint.sh"]
