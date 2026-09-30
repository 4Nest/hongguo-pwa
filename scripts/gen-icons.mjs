// 生成 PWA 图标：红底 + 白色播放三角（纯 SVG 形状，不依赖系统字体）
import sharp from "sharp";
import fs from "node:fs";

fs.mkdirSync("public/icons", { recursive: true });

function svg(size, paddingRatio) {
  const pad = size * paddingRatio;
  // 居中播放三角
  const w = size - pad * 2;
  const x1 = size / 2 - w * 0.28;
  const x2 = size / 2 + w * 0.42;
  const y1 = size / 2 - w * 0.38;
  const y2 = size / 2 + w * 0.38;
  const radius = size * 0.18;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#dc2626"/>
  <polygon points="${x1},${y1} ${x1},${y2} ${x2},${(y1 + y2) / 2}" fill="#ffffff"/>
</svg>`;
}

const tasks = [
  ["public/icons/icon-192.png", 192, 0.16],
  ["public/icons/icon-512.png", 512, 0.16],
  // maskable：安全区内留白更多，且背景铺满（无圆角）
  ["public/icons/icon-512-maskable.png", 512, 0.3],
];

for (const [file, size, pad] of tasks) {
  let markup = svg(size, pad);
  if (file.includes("maskable")) markup = markup.replace(/ rx="[^"]*"/, "");
  await sharp(Buffer.from(markup)).png().toFile(file);
  console.log("generated", file);
}
