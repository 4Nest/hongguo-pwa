# syntax=docker/dockerfile:1

# npm 源可切换：国内默认 npmmirror，CI 用 --build-arg NPM_REGISTRY=https://registry.npmjs.org
ARG NPM_REGISTRY=https://registry.npmmirror.com
FROM node:22-bookworm-slim AS base
ARG NPM_REGISTRY
RUN npm config set registry ${NPM_REGISTRY} \
  && npm i -g pnpm@10.18.3 \
  && pnpm config set registry ${NPM_REGISTRY} \
  && apt-get update -qq && apt-get install -y -qq --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
ENV npm_config_disturl=https://npmmirror.com/mirrors/node/

# ---- 构建阶段：安装全部依赖并构建前端（含 PWA 图标生成） ----
FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---- 生产依赖阶段：只装生产依赖 ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ---- 运行镜像 ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=8789 \
    DATA_DIR=/app/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY --from=build /app/dist ./dist
EXPOSE 8789
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8789)+'/api/auth/me').then(r=>process.exit([200,401].includes(r.status)?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "server/index.ts"]
