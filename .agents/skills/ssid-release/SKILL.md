---
name: ssid-release
description: "SSiD（思灵）发版流程：版本决策、内置插件对齐（vendor/npm/pin 陷阱）、release notes、版本号四处同步、prepare-runtime 归档重建（3-5 分钟）、归档抽查清单、NSIS 打包、本机 dev 验证、GitHub tag/Release 交付。用户说“发版/发布思灵/SSiD 版本升级收尾”时使用。依据 docs/发版流程规范.md（v0.1.12 复盘），实操细节见本文档末尾的已验证经验。"
---

# SSiD 发版流程（v0.1.12 起固化）

> 发版 = 版本号 + 内置插件对齐 + 归档 + 更新日志 + tag/Release **五件事一次做完**，漏一项即未完成。
> 仓库：`H:\MaxNull\WorkStation\seek-soul-in-darkness`（远端 `Max-Null/seek-soul-in-darkness`）。

## 0. 版本决策

- 未外发版本（无 GitHub Release）合并重打，不单独发版（v0.1.10/0.1.11 先例）。
- patch = 修复+攒小改；minor = 功能增强；破坏性/大重构 = major。
- 定版日期写进发布说明；「更新说明」节必须含老用户升级行为（自动重部署 ~30s 等）。

## 1. 内置插件对齐（发版前必做）

- **vendor 定制插件**（dsh-capture / open-sea-skin tgz / dsh-genui / dsh-context-doctor 等）：
  - 源码 bump 后必须同步 vendor：`lib/*`（构建产物）+ **package.json 版本号**（漏了 = 插件中心持续误报更新）；
  - `git diff --no-index <源>/lib <vendor>/lib` 一致；源仓库 git 干净。
- **npm 预置插件**（profile-template/package.json）：`^0.x.y` **不跨 minor**——要新 minor 必须显式改 pin；插件 npm 发布必须在归档重建之前（归档按 pin 解析）。
- **peers**：`pnpm peers check` 失败项若为宿主官方 peer（@deepseek-ai/dsh-*），hoisted 布局下为既有特征，运行时由 cordis loader 注入，`prepare-runtime.mjs` 的 MISSING_PEERS 无需补；新引入第三方插件的 peer 先 semver 判定再下结论。

## 2. 更新日志

- `docs/release-notes-vX.Y.Z.md`，格式沿用惯例（内置升级 / 新增 / 调整 / 修复 / 更新说明）。
- 分组依据 `git log --oneline v上版本..HEAD` 提炼，不凭记忆。

## 3. 版本号同步（四处）

`shell/package.json` version（bump，prepare-runtime 的 ssidVer 来源）· `.runtime-version`（归档内，自动生成勿手改）· profile 内 `.runtime-version`（deploy 自动对齐）· GitHub tag `vX.Y.Z`（与 package.json 严格一致）。

## 4. 归档重建

```powershell
cd shell
node scripts/prepare-runtime.mjs   # 约 3-5 分钟
```

- **运行约束**：完成前不要在 ssid profile 上做任何 pnpm 操作（扰动 lockfile）。
- 完成后完整性检查：归档约 **163-190 MB**（明显偏小 = 中断/损坏，必须重跑）；`tar -tzf` 可列出。
- 产物不入库（`.gitignore`），由安装包内嵌。

## 5. 归档内容抽查（解包验证，发布前必须全过）

```powershell
tar -xzf dsh-runtime.tar.gz -C dsh-runtime   # 注意必须 -C 解到独立目录
# 1) .runtime-version == <ssidVer>-<dshVer>-<指纹>
# 2) open-sea-skin/plugin/client.js 含 "enabled: false"
# 3) @max-null/dsh-plugin-center version == npm 最新
# 4) dsh-better-sidebar version == pin 预期
# 5) @max-null/dsh-capture/lib/client.js 含最新功能标记
# 6) package.json dependencies 含本轮新增（逐项核对本版本 release notes）
# 7) vendor 包 package.json 版本号与源仓库一致
```

## 6. 打包与发布

1. `npm run bundle-kernel` + `npm run pack`（electron-builder NSIS）：
   - 日志 `[after-pack] dsh-runtime.tar.gz OK (185.0 MB)` = 归档已内嵌；
   - 产物 `dist-electron/思灵 Setup <ver>.exe`（签名 + blockmap）。
2. 本机 dev 验证：重启思灵 → 日志 `runtime deploy needed (archive=<ver> proxy=<old>)` → deploy 成功 → boot 正常，抽查关键插件版本。
3. GitHub 交付：
   ```powershell
   git add -A; git commit -m "release: vX.Y.Z ..."; git push
   git tag vX.Y.Z; git push origin vX.Y.Z
   gh release create vX.Y.Z -R Max-Null/seek-soul-in-darkness --title "思灵 vX.Y.Z：..." --notes-file docs/release-notes-vX.Y.Z.md --latest
   gh release upload vX.Y.Z "shell/dist-electron/思灵 Setup X.Y.Z.exe" -R Max-Null/seek-soul-in-darkness
   ```

## 常见坑（累积）

- vendor package.json 版本号漏同步 → 安装版首启误报「可更新」。
- `^0.x.y` 不跨 minor → 显式改 pin。
- 插件 npm 发布晚于归档重建 → 归档旧版（重打归档 + 重打安装包，两趟）。
- 归档被进程/电源中断 → 体积异常必重跑；tar 有 partial 列表仍可能损坏。
- SSiD 内 pnpm add 可能静默 no-op → plugin-center 有版本核对防护，升级说明提示手动命令兜底。
- cordis.patch.yml insert 子条目必须带显式 `id`（无 id = 随机 id，插件中心禁用失效 + 垃圾行累积）。
- 绿屏/断电后：先检查归档与后台任务，不要直接复用疑似半成品。

## 已验证经验（2026-08-26 v0.1.13 收货）

- prepare-runtime 的 node/pnpm 自动发现：node 命中 PATH（v26.2.0）、pnpm 命中 %APPDATA% 全局 cjs，无需 DSH_NODE/PNPM_CMD（缺失时才显式设置）。
- 第三方插件 vendor 化：复制 npm/git 的 package.json + lib + cordis.patch.yml（+ LICENSE/README）；genui 这类含按需 assets 的包必须带 lib/assets/；`src/` 不复制。
- 面板修复类 vendor 固化（dsh-genui 0.9.2 + PR #58 修复）在上游合并并 npm 发布后，应切回 npm 声明并删除 vendor 与临时补丁脚本。
- 发版前置检查：`git status` 干净 + `git log v上版本..HEAD` 分组 + 安装目录归档备份（替换前 `.bak`）。
- dev profile（`~/.dsh/profiles/ssid`）与发布模板两处同步（依赖/bundles/vendor）；git 只提交模板侧。
