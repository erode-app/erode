# Stage 1: Build
FROM node:24-slim AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./

RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ src/

RUN npm run build

# Stage 2: Runtime
FROM node:24-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends git jq curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built output from builder
COPY --from=builder /app/dist/ dist/

# Copy entrypoints
COPY entrypoint.sh /entrypoint.sh
COPY entrypoint-gitlab.sh /entrypoint-gitlab.sh

RUN chmod +x /entrypoint.sh /entrypoint-gitlab.sh

ENTRYPOINT ["/entrypoint.sh"]
