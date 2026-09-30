# 红果短剧 PWA

红果短剧 Web 应用：搜索、播放、榜单/分类推荐、最近观看、收藏，支持 PWA 安装与应用内连续播放。

## 技术栈

- 前端：Vite + React + TypeScript + Tailwind v4 + shadcn/ui + vite-plugin-pwa
- 后端：Express + better-sqlite3（`tsx` 直接跑 TS），JWT httpOnly cookie 认证
- 数据源：局域网 Capy Backend（默认 `http://192.168.2.110:8788`），全部经本站 `/api/hongguo/*` 代理（视频流 Range 透传）

## 开发

```bash
pnpm install
pnpm dev        # tsx watch 后端 :8789 + vite 前端 :5173（/api 代理到 8789）
```

## 生产

```bash
pnpm build      # 生成 dist/ 与 PWA 图标
NODE_ENV=production pnpm start   # :8789，托管 dist/ + API
```

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8789` | 服务端口 |
| `UPSTREAM_URL` | `http://192.168.2.110:8788` | Capy Backend 地址 |
| `DATA_DIR` | `./data` | SQLite 与凭证文件目录 |
| `JWT_SECRET` | 自动生成并持久化到 `data/jwt-secret` | JWT 签名密钥 |

## Docker 部署（搭配 cs920/happy-capy）

```bash
docker compose up -d   # 先构建：docker compose build；capy 的 config.toml 放 ./capy-config/
```

或单独运行（上游用局域网已有实例）：

```bash
docker run -d --name hongguo -p 8789:8789 \
  -e UPSTREAM_URL=http://192.168.2.110:8788 \
  -v hongguo-data:/app/data \
  ghcr.io/4nest/hongguo-pwa:latest
```

`/app/data` 卷保存 SQLite、JWT 密钥与 admin 初始凭证（`docker exec hongguo cat /app/data/admin-credentials.txt`）。

## 管理员

首次启动自动创建 `admin`，随机密码打印在启动日志并写入 `data/admin-credentials.txt`（0600，仅写一次）。忘记密码：删除 `data/app.db` 重启即可重建（会清空全部用户数据）。管理面板 `/admin` 可生成邀请码、管理用户；注册必须提供有效邀请码。
