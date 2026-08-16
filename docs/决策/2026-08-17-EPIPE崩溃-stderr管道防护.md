# EPIPE 崩溃修复：stderr 管道防护

日期：2026-08-17
状态：✅ 已修复

## 现象

Electron 主进程弹出 `A JavaScript error occurred in the main process`：
`Uncaught Exception: Error: EPIPE: broken pipe, write`，栈顶指向
`shell/main.mjs:216`——`console-message` 转发回调里的 `process.stderr.write(...)`。

## 根因

- `main.mjs` 把官方 UI 渲染进程的每条 console 都转发到 `process.stderr`（216 行），
  另有多处启动/诊断日志写 stderr（143/161/264/281/283）。
- 启动方式决定 stderr 挂在哪：从终端启动时挂在终端管道上；终端关闭 / 管道断开后，
  再写入抛 **EPIPE**。Node 对 stderr 的 error 事件无人监听时会升级为未捕获异常，
  Electron 弹错误框并可能终止进程。
- 报错路径 `file:///H:/.../shell/main.mjs` 表明发生场景是 **dev 形态**（打包版是
  kernel.bundle.mjs），即启动终端断开或双击启动。

## 修复方案

1. `main.mjs` 顶部（任何写入发生前）注册全局防护：
   - `process.stderr.on('error', ...)` / `process.stdout.on('error', ...)` 吞掉 error，
     使 EPIPE 不再升级为未捕获异常；
   - `safeLog(text)` 封装：写失败一次后置 `stdioDead` 标志，后续日志静默，
     避免每条 console 都反复写死管道。
2. 6 处 `process.stderr.write` 全部改走 `safeLog`。
3. `kernel.bundle.mjs` 内的 `loadLayeredEnv` warn 写 stderr **不改**：它是编译产物，
   改 bundle 会被下次重建覆盖；全局 error 监听已兜底其写入失败。

## 验证

- [x] `node --check shell/main.mjs` 语法通过
- [x] dev 启动冒烟（2026-08-17 实测）：boot 正常（dsh web 64864）、`[main-ui]` 日志
      转发工作、theme-observer installed、关于页 11 插件全加载、无 EPIPE
- [x] 打包形态同样受防护：electron-builder 将 `main.mjs` 原样打进 asar，无编译差异

## 决策备查

- stderr/stdout 一律经 `safeLog`，禁止直接 `process.stderr.write`（新代码也守此约定）。
- 编译产物（`*.bundle.mjs`）不做手改，问题修在源码层。
