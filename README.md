# 红果短剧 PWA

[![Docker 构建](https://github.com/4Nest/hongguo-pwa/actions/workflows/docker.yml/badge.svg)](https://github.com/4Nest/hongguo-pwa/actions/workflows/docker.yml)
[![镜像](https://img.shields.io/badge/GHCR-4nest%2Fhongguo--pwa-blue)](https://github.com/4Nest/hongguo-pwa/pkgs/container/hongguo-pwa)

红果短剧 Web 应用，搭配 [Capy Backend](https://hub.docker.com/r/cs920/happy-capy) 使用。PWA 可安装到手机主屏，体验接近原生 App。

## 功能

- 🔍 搜索、分类浏览（短剧/漫剧）、6 个榜单
- ▶️ 应用内播放器：自动连播、进度记忆、断点续播、Media Session
- 🏠 首页：最近观看、猜你喜欢（基于观看/收藏的推荐）
- ❤️ 收藏与最近观看（服务端存储，跨设备同步）
- 👥 多用户：邀请码注册、修改密码、管理面板（邀请码/添加用户/重置密码/删除用户）
- 📦 视频流服务端代理（Range 透传），海报本站代理缓存

## 快速开始（Docker）

镜像已发布到 GHCR（amd64 + arm64），无需克隆仓库：

```yaml
# docker-compose.yml
services:

  capy:
    image: cs920/happy-capy:latest
    restart: unless-stopped
    volumes:
      - capy-data:/data

  hongguo:
    image: ghcr.io/4nest/hongguo-pwa:latest
    restart: unless-stopped
    ports:
      - "8789:8789"
    environment:
      UPSTREAM_URL: http://capy:8788
    volumes:
      - hongguo-data:/app/data
    depends_on:
      - capy

volumes:
  capy-data:
  hongguo-data:
```

```bash
docker compose up -d
# 访问 http://localhost:8789
# 取 admin 初始密码：
docker exec hongguo cat /app/data/admin-credentials.txt
```

已有运行中的 Capy Backend 则只需单容器：

```bash
docker run -d --name hongguo -p 8789:8789 \
  -e UPSTREAM_URL=http://<capy地址>:8788 \
  -v hongguo-data:/app/data \
  ghcr.io/4nest/hongguo-pwa:latest
```

## 数据源

默认红果短剧。管理员可在「管理面板 → 设置」开启**黄果源**（成人内容，通过 capy 的 `huangguo.js` widget 提供服务，媒体为 HLS，经本站代理转发）；开启后用户在「设置」页可自由切换红果/黄果，浏览记录与收藏按源独立。

## 账号体系

| 事项 | 说明 |
| --- | --- |
| admin 初始化 | 首次启动自动创建，随机密码写入 `/app/data/admin-credentials.txt`（0600，仅写一次）并打印启动日志 |
| 注册 | 需要邀请码（管理面板生成）或由 admin 直接创建用户 |
| 忘记密码 | admin 可在面板重置任意用户密码；admin 密码丢失则删除 `data/app.db` 重启重建（会清空全部用户数据） |

## 配置

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8789` | 服务端口 |
| `UPSTREAM_URL` | `http://192.168.2.110:8788` | Capy Backend 地址（compose 内为 `http://capy:8788`） |
| `DATA_DIR` | `./data`（容器内 `/app/data`） | SQLite、JWT 密钥、admin 凭证所在目录 |
| `JWT_SECRET` | 自动生成并持久化 | JWT 签名密钥，一般无需设置 |

## 本地开发

```bash
pnpm install
pnpm dev        # 后端 :8789（tsx watch）+ 前端 :5173（/api 代理到 8789）
```

生产模式（不经过 Docker）：

```bash
pnpm build                      # 生成 dist/ 与 PWA 图标
NODE_ENV=production pnpm start  # :8789 托管 dist/ + API
```

## 技术栈

- **前端**：Vite · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · vite-plugin-pwa
- **后端**：Express 4 · better-sqlite3 · tsx（免编译直跑 TS）· JWT httpOnly Cookie
- **CI/CD**：GitHub Actions 双架构构建推送 GHCR（push 到 `main` 自动触发）

## 仓库结构

```
server/          Express 后端（auth / admin / me / 上游代理）
src/             React 前端（pages / components / hooks）
public/icons/    PWA 图标（scripts/gen-icons.mjs 生成）
Dockerfile       多阶段构建（国内默认 npmmirror，CI 走 npmjs）
docker-compose.yml  capy + 红果组合编排示例
```
