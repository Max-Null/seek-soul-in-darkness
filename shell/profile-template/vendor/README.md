# vendor 目录说明（SSiD 内置定制）

profile-template 的依赖清单通过本目录引用 SSiD 侧定制/固化的包源。任何条目
都是「安装版首装即生效」的内容，改动后必须重新生成运行时归档：

```sh
node scripts/prepare-runtime.mjs   # 重建 dsh-runtime.tar.gz（归档带 vendor 指纹）
```

## 条目

### dsh-capture / dsh-ssid-panels / dsh-ssid-zh-ui / dsh-quick-toolbar

Max-Null 自有 @max-null/* 插件（`file:./vendor/<name>` 引用）：SSiD 集成版本直接随
归档发布，不依赖 npm 发布节奏。更新方式为替换目录内容后重建归档。

比对面按包区分：`dsh-ssid-panels` / `dsh-ssid-zh-ui` 的源头是 SSiD 仓 `plugins/<pkg>/`，
与 vendor 为**全等副本**（连 `src/`、`tests/`、`docs/` 都同步）；`dsh-capture` 与
`dsh-quick-toolbar` 的源头在上游仓库（`max-null-plugins/`），vendor 只收运行所需文件
（`lib/` + `cordis.patch.yml` + `package.json`），按"整目录相等"核会报大量假差异。

### dsh-genui（来源仓库 omdsh-dev/dsh-genui；npm 发布名 @changfenhuang/dsh-genui）

当前经 npm 声明（`package.json` 写 `"@changfenhuang/dsh-genui": "0.9.8"`），本 vendor
目录下不再保留该包。历史上的 vendor 固化基线 = 上游 v0.9.2 + **SSiD 面板样式修复**：
会话面板 dock 对齐宿主 composer 宽度轴、头部/body 分隔线、badge 间距（--dsl-g-* token
作用域修复）、chevron 换宿主图标——修复已提上游 PR
[omdsh-dev/dsh-genui#58](https://github.com/omdsh-dev/dsh-genui/pull/58)。
本地开发/重构建：
`H:\MaxNull\WorkStation\dsh-genui`（Windows 构建绕过 `rm -rf`：`Remove-Item lib -Recurse;
pnpm exec tsc -p tsconfig.json; pnpm exec tsdown`）。
`genui` skill 教学（`SKILL.md`）预置在 `profile-template/skills/genui/`。

### dsh-context-doctor

第三方上下文审计插件（git 产物，无 npm 发布）的 vendor 固化
（`file:./vendor/dsh-context-doctor`）。基线 = `github:Zhenyu98/dsh-context-doctor#main`
v0.6.1（构建产物已入库，无需本地构建）。已知局限见上游
[issue #8](https://github.com/Zhenyu98/dsh-context-doctor/issues/8)（symlink 指令链
双算、技能目录 scope 语义）；日常诊断请显式传 `cwd=<会话工作目录>`。

### dsh-better-sidebar

第三方侧边栏底座（上游 `omdsh-dev/DSH-better-sidebar`）的 vendor 固化
（`file:./vendor/dsh-better-sidebar`）。基线 = npm `dsh-better-sidebar@0.24.1`，
**外加两处本地修复**：WebSocket 路由改用壳注入的 transport base，以及信任栅栏接受
桌面壳页面的 origin。**两处缺一不可。**

**为什么需要 vendor**：桌面壳把页面放在 `dsh-app://app/` 下，插件的 WebSocket 要走两道关，
原版两道都过不了。

1. **URL base**：插件拿 `location.origin` 当 base，而它的 `host` 是字面量 `app`，拼出的
   `ws://app/sidebar/ws/…` 永远解析不了。修复 = `src/client/desktop-env.ts` 新增
   `sidebarWebSocketBase()`（读 `__DSH_TRANSPORT__.streamBaseUrl`、回退 `document.baseURI`）。
2. **信任栅栏**：URL 修好之后握手仍然失败 —— 壳的 `protocol.handle` 只转 HTTP、不承载
   upgrade，这条 socket 直连 loopback，Chromium 因此带上 `Origin: dsh-app://app`，而栅栏按
   hostname 比较（`app` ≠ `127.0.0.1`），socket 在 `handleUpgrade` 之前就被 `destroy()`。
   修复 = `src/trust-fence.ts` 在 Host 检查通过之后接受精确字符串 `dsh-app://app`（与壳自身
   转发器的信任集合一致）。

HTTP 路由一直正常，是因为壳转发前会删掉 `origin` 头 —— 同一个栅栏只在 WebSocket 路径上
暴露，所以症状看起来像「侧栏基本能用，只是几个功能没反应」。修复**无法走 npm** —— 包不是
我们的，发布权在上游。所以按 genui 的先例走厂商魔改：产物进本目录随安装包分发，同时向上游
提 PR。

- 上游 PR：[omdsh-dev/DSH-better-sidebar#797](https://github.com/omdsh-dev/DSH-better-sidebar/pull/797)
  （在 `v0.24.1` 基线上重放，现已含第二处修复；更早的 #768 因基线过旧已关闭）。
  **作者采纳发版后，本目录应撤掉、切回 npm 版本号。**
- 第二处修复的来源：上游 PR 评论中 @davidshilr8 的独立报告（在 0.2.0-rc.2 的安装上抓到
  真实握手）。该结论先在本地壳代码里坐实 —— `.ssid-build/checkout/apps/desktop/src/web-document.ts`
  的 `forwardWebRequest` 校验 origin 后删掉该头再转发，正是「HTTP 全好、WS 全坏」的原因。
- 本地产物来源：`third-party-plugins/DSH-better-sidebar` 的分支 `fix/ws-base-0241`
  （提交 `e1c7ac3`），用 `pnpm build` 构建后 `npm pack --ignore-scripts` 解包得到。
- 验证判据（版本号与实际装版同为 0.24.1，只能看内容）：本目录 `lib/client.js` 含
  `sidebarWebSocketBase` 3 处、`streamBaseUrl` 2 处；`lib/index.js` 含 `dsh-app` 2 处、
  `SHELL_APP_ORIGIN` 2 处（**改前那份的真值是 `dsh-app` 0 处** —— 只比对 client 半会把
  「半截修复」判成已完成）。
- **行为验证（2026-10-01 真机，判据是握手拿到 101）**：用 `.ssid-iso-test/fence-probe.mjs`
  对真实 Host 发 raw WebSocket upgrade —— 同一脚本、同一台机器，只换产物内容：修复前打
  **运行中的装版 Host**（`Origin: dsh-app://app`）得 `ECONNRESET`（socket 被 `destroy()`），
  修复后打**隔离实例**（隔离集里换成新产物）得 **`101 UPGRADED`**；跨站 origin 的两组、
  无 Origin、loopback origin 在修复前后**结果完全一致**（跨站恒被拒），即本次只多了
  carrier origin 这一格。
  **排查提示**：`Origin: dsh-app://app` 配上 `sec-fetch-site: same-origin` 在修复前**同样被拒**
  —— 拒绝来自 Origin 比较，不是 fetch-site 标记，别被这个组合误导。想看真实页面里的行为，
  用同目录的 `cdp-ws-verify.mjs`（需要一个带 `--remote-debugging-port` 的壳实例）。
- **构建噪声（别整体覆盖 client bundle）**：同一分支两次 `pnpm build` 得到的 `lib/client*.js`
  字节不同 —— CSS module 类名映射的键顺序会漂移（键集合、值与行数一致）。同步 vendor 时只
  替换真实改动的文件（本次是 `lib/index.js`、`lib/types/trust-fence.d.ts`、`src/trust-fence.ts`），
  逐文件比 SHA256 收尾。
- **vendor 化的一个必要改造**：从 npm 包解包得到的 `package.json` 带着安装期脚本
  （`prepare` / `prepublishOnly`），而 vendor 目录没有 devDependencies —— 这些脚本会在
  pnpm 处理该 `file:` 依赖时被触发，装包直接失败（实测 `npm pack --dry-run` 报
  `'tsdown' is not recognized`）。**只保留非安装期脚本**，与 `dsh-capture` /
  `dsh-quick-toolbar` 一致（两者都保留 build/typecheck/test/watch、都没有 `prepare`）。


