import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { PORT, IS_PROD } from "./config.ts";
import "./db.ts";
import { authRouter } from "./routes/auth.ts";
import { adminRouter } from "./routes/admin.ts";
import { meRouter } from "./routes/me.ts";
import { hongguoRouter } from "./hongguo.ts";
import { huangguoRouter } from "./routes/huangguo.ts";
import { warmupWidget } from "./widget.ts";

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/me", meRouter);
app.use("/api/hongguo", hongguoRouter);
app.use("/api/huangguo", huangguoRouter);

// 生产模式：静态托管 + SPA fallback（必须在 API 路由之后）
const dist = path.resolve("dist");
if (IS_PROD && fs.existsSync(dist)) {
  app.use(express.static(dist));

  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

warmupWidget();

app.listen(PORT, () => {
  console.log(`[server] 红果短剧服务已启动: http://localhost:${PORT} (${IS_PROD ? "production" : "development"})`);
});
