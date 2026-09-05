# ssid-plugin-adapt-tests — SSiD 插件实机适配回归测试

> 方案：`docs/决策/2026-09-04-SSiD内核升级-0.1.2-rc.1插件适配与测试体系方案.md`
> 模式延伸自 shell 目录的 CDP 验证脚本（.tmp-verify-polish.mjs 系列）。

## 断言分层

| 层 | 检查 | 手段 |
|---|---|---|
| L1 Boot 健康 | 页面就绪、无 `Failed to load plugins`、console 0 error/exception | `page.on('console'/'pageerror')` |
| L2 界面契约 | `data-slot` / `aria-label` 锚点、`style[data-plugin]` 注入、布局顺序 | DOM + 横向 bbox 比较 |
| L3 功能可用 | 真实交互闭环（点击→toast/结果） | Playwright 交互 |
| L4 样式契约回归 | 按钮行 computed style 快照 vs 基线 JSON | `getComputedStyle` 快照（跨机器稳定、失败可读） |

> L4 说明：像素截图路线在本环境判定不可行（Playwright 截图栈在 Electron dev 上 fonts loaded 后仍超时；
> 原生 CDP `Page.captureScreenshot` 带 clip 参数报 Invalid parameters），故 v1 用 computed style 契约快照。
> 像素级视觉回归列为 v2 可选（需图像 diff 库，另评估）。

## 运行

```sh
cd shell/tests/plugin-adapt
pnpm install            # 首次（@playwright/test，已纳入 shell workspace）
pnpm test               # 连运行中的 SSiD dev（默认 CDP 127.0.0.1:9222）
pnpm baseline           # 生成/更新 L4 样式基线（内部设置 UPDATE_SNAPSHOTS=1）
```

环境变量：`SSID_CDP`（默认 `http://127.0.0.1:9222`）。

## 用例约定

- 一个插件 = `cases/<plugin>.spec.ts`；文件头注释标明：适配版本、断言层覆盖、失败判定。
- 数据驱动：涉及多版本/多插件时按 `describe` 参数化（后续插件矩阵扩展为外部清单）。
- 基线截图入库（baselines/）；签名变化需人工确认后 `pnpm baseline` 重生成。
- 跑之前确保 SSiD dev 已启动且至少打开一个会话页（composer 可用）。

## 已知坑（失败先查）

1. **`data-slot` 是 `display:contents`**：无渲染盒——Playwright 的元素截图/`boundingBox`/`toHaveScreenshot` 对它**不可用**
   （报 `Node is either not visible or not an HTMLElement` 或永不稳定）。L4 视觉断言必须以真实渲染子元素
   （如按钮）为锚点 + 页级 `clip` 截图；且 zone 内按钮（plugin 插槽）与发送按钮**不是兄弟**，布局断言用横向 bbox 比较。
2. 431 Request Header Fields Too Large → 浏览器 cookie 累积（dsh-auth-*），清 cookie 后刷新（见记忆/08-31 复盘）。
3. 页面 URL 是随机端口（如 52221），断言勿硬编码端口；用 `findDshPage` 按 `http://` + 非 file: 匹配。
4. `console` 捕获要在导航前注册，否则丢早期错误；boot 错误以 `Failed to load plugins` 子串判定。
5. 截图基线受光标/Toast 影响：用 `caret: 'hide'`；把截图用例排在会触发 toast 的交互用例**之前**。
