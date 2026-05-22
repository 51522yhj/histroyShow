# 事件图片素材

国内部署版本优先使用本目录下的本地图片，避免 Wikimedia、海外 CDN 或第三方图床在国内访问不稳定。

推荐规则：

- 使用已授权、可公开展示的图片素材。
- 文件名建议与事件 `id` 保持一致，例如 `qin-unification.webp`、`cpc-first-congress.jpg`。
- 放入图片后，在 `src/data/eventImages.ts` 中把对应事件改成 `/images/events/文件名`。
- 优先使用 `webp` 或压缩后的 `jpg`，单张建议控制在 800KB 以内。

当前项目先使用两张本地兜底图：

- `/images/history-fallback.svg`
- `/images/cpc-fallback.svg`
