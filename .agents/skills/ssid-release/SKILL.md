---
name: ssid-release
description: "SSiD（思灵）发版流程（fork 版 / v1.0.0 起）：版本决策、插件集与 vendor 对齐、更新日志、打包（package-target 阶段链）、冒烟、GitHub tag/Release 交付。触发词：用户说『发版/发布思灵/SSiD 发版/ssid 收尾/SSiD 版本升级收尾/思灵打包/发布安装包』或提到 vX.Y.Z 版本发布时使用。注意：自建壳（≤0.4.0）的 bundle-kernel + dsh-runtime.tar.gz 归档流程已归档，不要照搬。"
---

# SSiD 发版流程（fork 版 · v1.0.0 起）

> **换代提示**：壳已从自建壳（≤0.4.0）换成官方 `dsh-desktop-host` 基座。本文写 **fork 版**流程；自建壳那套（`bundle-kernel`、`dsh-runtime.tar.gz` 归档、`verify:shipped`）**已随运行时归档**，只在文末附录留作历史。
>
> **⚠️ 1.0.0 已于 2026-09-28 发布**（tag `v1.0.0`，GitHub Release 为该仓 latest）：打包链与 GitHub 交付**已按本文实跑过一次** —— §5 的阶段耗时表与 §5 的产物大小都是那次的实测值。**仍标【待验证】的，是那一次没覆盖到的步骤**：未签名包能否通过 `electron-updater` 的 NSIS 校验、以及「打包 → 发布 → 旧版检测到新版 → 下载 → 安装」的完整更新闭环。这两条不要当成既成事实。
>
> **两个根，别混**：**构建与打包**在开发主轴 `H:\MaxNull\WorkStation\.ssid-build\checkout`（分支 `ssid-desktop-fork`，带 DSH 全历史）——§5 的相对路径相对它；**发版基准与资产**（`shell/`、`plugins/`、`docs/`）在 `H:\MaxNull\WorkStation\seek-soul-in-darkness\`——§2、§3、§4 的相对路径相对它。`seek-soul-in-darkness/ssid-desktop/` 是**对外快照**，不是构建处。
>
> **正本与生效副本**：正本在 `seek-soul-in-darkness/.agents/skills/ssid-release/`（受 git 管），**实际生效的是用户级副本 `~/.dsh/skills/ssid-release/`**——发版常在 WorkStation 根的会话里做，那里扫不到仓库的 `.agents/skills/`。**改完正本必须同步过去**（`Copy-Item .agents/skills/ssid-release/* ~/.dsh/skills/ssid-release/ -Force`），否则改了不生效且没有任何提示。

## 0. 版本决策

- 未外发版本（无 GitHub Release）合并重打，不单独发版。
- patch = 修复 + 攒小改；minor = 功能增强；破坏性 / 大重构 = major。**判据是「有没有新的用户可见能力」，不是「改了多少行」**：一次改几十个文件但全是内部整理（门禁、文档、pin 对齐）不该进位；三层修复加三块新功能则 patch 装不下。
- 定版日期写进发布说明；「更新说明」节必须含老用户升级行为。

## 1. 版本号：先问「这个号是谁的」

换底座后**产品版本与内核版本是两条线**：产品版本在 `apps/desktop/package.json`，内核版本在**仓库根** `package.json`（`prepare-dsh.ts` 的 `desktopRelease()` 读它，作为 `release.version`）。代码里有**三处**把这个 `release.version` 当作 **dsh 版本**用，跟着产品版本改就会炸：

- `prepare-dsh.ts` → `readDesktopCorePackageSet(BUILD_ROOT, release.version)`——拿它解析核心包集。**最容易漏的一处**：跟着产品版本改，内核会去 npm 找一个不存在的 `@deepseek-ai/dsh@1.0.0`。
- `development-project.ts:127`——断言 `apps/cli` 的版本等于 `release.version`，不符即抛错。
- `development-project.ts:137`——断言 `apps/desktop-host` 的版本等于 `release.version`，不符即抛错。

速记判据——**逐个问「这个版本号是谁的」**：

| 描述谁 | 载体 | 跟谁 |
|---|---|---|
| **运行时**（内嵌内核、node/pnpm） | `prepare-dsh.ts` 的 `desktopRelease` | **DSH 版本** |
| **产品**（安装包名、`latest.yml`、发版记录、GitHub tag） | `apps/desktop/package.json` 的 `version` | **思灵自己** |

- 构建版本可选：`DSH_DESKTOP_BUILD_VERSION`（测试构建用，形如 `1.0.0-test.20260928.1`）——**不进 manifests**，只进 electron-builder、更新 feed 与上传校验。生产发布不发它。
- **`artifactName` 与更新源要一起改**：`electron-builder-config.mjs` 的 `artifactName` 同时决定安装包文件名**与 `latest.yml` 里的 `url`/`path`**，只改一个会让自动更新指向不存在的文件。
- **验证要在打包链真正跑的那条命令下做**：链上用的是**根级 `tsconfig.host.json`**（开了 `TS6133`「声明但未读取」），而 `apps/desktop` 自己的 `tsc -b` 不会报——不然会跑到打包第 7 分钟才失败，白跑一轮。

## 2. 内置插件与 vendor 对齐（发版前必做）

- **vendor 定制插件**：**别照抄列表，先 `ls shell/profile-template/vendor` 看实际**。当前 8 个：`dsh-better-sidebar`、`dsh-capture`、`dsh-context-doctor`、`dsh-quick-toolbar`、`dsh-ssid-env`、`dsh-ssid-panels`、`dsh-ssid-pwsh-retry`、`dsh-ssid-zh-ui`。其中 `dsh-better-sidebar` 是**第三方**的厂商魔改 —— 上游 PR 尚未合并时的临时形态，采纳发版后撤掉（处置与基线见 `vendor/README.md`）。
  - 源码 bump 后必须同步 vendor：`lib/*`（构建产物）+ **package.json 版本号**（漏了 = 插件中心持续误报更新）。
  - `git diff --no-index <源>/lib <vendor>/lib` 一致；源仓库 git 干净。
  - `dsh-quick-toolbar` 是**精简副本**（只收 `lib/` + `cordis.patch.yml` + `package.json`），别按「整目录相等」比。
  - `npm run sync:vendor`（默认 dry-run，`--apply` 才写盘）与 `check-vendor-sync` 共用同一份指纹实现。
- **出厂插件的声明源只有一个**：`shell/profile-template/package.json` 的 `dependencies` + `dsh.profile.bundles`。打包时 `prepare:ssid-plugins` 把它变成「随包插件集」；**运行时 profile 的依赖是 `link:` 指向插件集，由首启 seed 自动维护，不要手改**（链路详见手册 §4）。
- 声明是**精确 pin（无 `^`）**，要新版本必须显式改那一行。
- `check-profile-sync` 报失配时先判方向：**B 落后于 A** 是可预期稳态；**B 超前于 A** 才是下次部署会被覆盖的坑。**注意**：fork 形态下 B 侧的出厂插件本就是 `link:`（不是版本号），门已把这种形态认成预期、降级为 info——若它仍报「非 semver 形态」，先确认那条不是插件集来源。

## 3. 更新日志

- `docs/release-notes-vX.Y.Z.md`，格式沿用惯例（内置升级 / 新增 / 调整 / 修复 / 更新说明）。
- 分组依据 `git log --oneline v上版本..HEAD` 提炼，**不凭记忆**。
- **同步内置弹窗/关于页资源**（更新日志功能在 `dsh-ssid-panels` 内：启动弹窗 + 关于 SSiD「更新日志」区共用）：

  ```powershell
  Copy-Item docs/release-notes-vX.Y.Z.md plugins/dsh-ssid-panels/release-notes.md -Force
  # 守卫校验：首行 # vX.Y.Z 必须 == 产品版本（不一致不弹不显示）
  # cwd 是仓库根；tsx 装在 shell/ 下，故显式指向（写 tsx/esm 会 ERR_MODULE_NOT_FOUND）
  node --import ./shell/node_modules/tsx/dist/esm/index.mjs --test plugins/dsh-ssid-panels/tests/release-notes.test.ts
  # 构建 + vendor 同步（含本插件的 lib/src/release-notes.md）
  pnpm --dir plugins/dsh-ssid-panels exec tsdown
  ```

  - 弹窗每版本只弹一次，已读状态记在 `~/.ssid/changelog-seen.json`（**不是** localStorage，也不随 profile 隔离——所以「全新隔离环境」未必会弹）。
- **发版回填 notes 别把哈希同步进包内**：安装包的 SHA256 取决于内嵌内容，而包里又装着更新日志，把最终哈希写进包内会**再次改变**哈希。发包**前**走上面的同步链；发包**后**回填只改 `docs/` 与 GitHub Release 页。

## 4. 发版前守卫（必须全绿）

```powershell
cd H:\MaxNull\WorkStation\seek-soul-in-darkness\shell
npm run check:rules          # 六门全跑，任一失败即 exit 1
```

六门 = BOM / 旧名残留（硬域）/ profile↔模板声明 / vendor 四份一致 / 插件 peerDeps 覆盖性 / DSH 源码只引用不改。（第 7 门 `loader-external` 已随自建壳下架，脚本仍在，需要时可单独跑。）

两条单测冒烟（**cwd 是仓库根，不是 `shell/`**：仓库根没有 `node_modules`，`tsx` 装在 `shell/` 下，
所以显式指向它 —— 直接写 `--import tsx/esm` 会 `ERR_MODULE_NOT_FOUND`）：

```powershell
cd H:\MaxNull\WorkStation\seek-soul-in-darkness
node --import ./shell/node_modules/tsx/dist/esm/index.mjs --test plugins/dsh-ssid-panels/tests/release-notes.test.ts
```

## 5. 打包

**开工前先读一遍手册 §7 的坑清单**（`seek-soul-in-darkness/docs/SSiD开发手册.md`）—— 打包链上的坑多数记在那里，踩一次就是 20 分钟。两个必设项：

```powershell
cd H:\MaxNull\WorkStation\.ssid-build\checkout
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"   # 直连 GitHub 拉 Electron 会挂死且不报错
# 坑 #61：prepare:dsh 在 %TEMP% 下建 pnpm store 会 EPERM（子进程写 C:\ 受限，写工作区内可以）
$env:TEMP = 'H:\MaxNull\WorkStation\.ssid-build\tmp'; $env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
# 输出重定向到文件；否则 job 完成后读输出会撞几十万行
pnpm --filter "./apps/desktop" run package:win:x64:unsigned *> <某个日志文件>
```

**不设 TEMP 的症状**（认出来就别再往别处查）：`prepare:dsh` 的 `runtime:lockfile` 阶段**约 1 秒即失败**，
报 `Error: desktop runtime: pnpm exited with 4294963248`，而 pnpm 自己**一条输出都没有**
（2026-09-29 与 2026-09-30 各踩一次）。

**一条命令跑完 19 个阶段（实测 1142.6 s ≈ 19 分钟）**，编排在 `scripts/package-target.ts`，阶段与耗时（2026-09-28 实测）：

| 阶段 | 耗时 |
|---|---|
| `build:official`（tsdown 构建整个 monorepo）+ `release:pack --family dsh` | 59.6 s + 121 s |
| `prepare:primary-runtime` + `prepare:runtime`（含 runtime:\* 子阶段，最长的 `write-descriptor` 65 s、`smoke` 18 s） | 38.4 s + 44.2 s（子阶段合计约 2 分钟） |
| `prepare:dsh` | **141.3 s** |
| `prepare:ssid-plugins` | 53.0 s |
| `electron-builder --win --x64 --publish never` | **656.5 s（≈11 分钟，LZMA 压缩是大头）** |
| `smoke-packaged-runtime.ts --unsigned`（**打包后自动冒烟**） | 56.1 s |

- **产物**：`apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/`
  - `ssid-<产品版本>-win-x64-unsigned.exe`（实测 1.0.0 为 **427.6 MB**）
  - 同名 `.blockmap`（增量更新的差分）
  - **`latest.yml`**（更新 feed；provider 见下）
- **交付落点**：产物必须复制到 `H:\MaxNull\WorkStation\ssid-releases\`——那是用户取包的地方，留在 `.desktop-build` 里不算交付（2026-09-27 用户追问过「你怎么不输出到 H:\MaxNull\WorkStation 了？」）。**2026-09-29 起用 `ssid-releases\` 这个子目录**：此前几个版本直接堆在工作区根，用户嫌乱。可交付的那几件（exe / `.blockmap` / `latest.yml`）集中放这里，别的东西不要落到工作区根。
- **`--publish never`**：electron-builder 不发布，发布是独立步骤（见 §7）。
- **日志与结果**：`.desktop-build/packaging-runs/<时间戳>/` 下的 `stdout.log`（**真因在这里，不是 `events.jsonl`**）与 `result.json`（逐阶段耗时与成败）。**排查打包失败别用 `Select-Object -Last N` 截断输出**——warning 与编码错误会被切掉，只剩调用栈。
- **更新源**（`electron-builder-config.mjs`）：没配 COS 凭据时写 **`provider: github, owner: Max-Null, repo: seek-soul-in-darkness`**；配了 COS 则保持官方的 `generic`（那是官方自身流程）。
- **签名**：用户已拍板**不买证书**，接受 SmartScreen 拦截。`publisherName` 无证书时为 `undefined`。**【待验证】未签名包能否通过 `electron-updater` 的 NSIS 校验**——代码上应当跳过校验，但没有实测证据。

### macOS（arm64，未签名）：只能走 GitHub Actions

本机是 Windows，mac 包出不了；构建入口是 `.github/workflows/build-mac.yml`。2026-09-29 实测跑通（15 分 50 秒），产物 `ssid-<产品版本>-mac-arm64-unsigned.{dmg,zip}` 与 `.zip.blockmap`，落在 `.desktop-build/targets/mac-arm64/unsigned-artifacts/`，并上传为 Actions artifact（约 1.13 GB）。

```powershell
gh workflow run build-mac.yml --ref main -R Max-Null/seek-soul-in-darkness
gh run list --workflow=build-mac.yml -R Max-Null/seek-soul-in-darkness --limit 1
```

- **改了 workflow 不能用「Re-run failed jobs」验证**：rerun 沿用该 run 所属 ref（通常是 tag）上的 workflow 定义，改动不在那个 commit 上就不生效，只会原样再失败一次。验证新 workflow 一律走 `workflow_dispatch --ref main`；该路径下 `github.ref_type == 'branch'`，上传 Release 的步骤自带守卫，不会污染已发布的 Release。
- **CI 从 GitHub 的 fork 分支取代码**，不是本地 `.ssid-build/checkout`。壳代码改动必须走完整推送链，否则 CI 跑的是旧代码：`.ssid-build/checkout` → `origin`（本地镜像 `deepseek-harness`）→ `fork`（GitHub）。改了 workflow 却只见旧行为时，先查这条链。
- **CI 只证明打包链跑通**，不证明产物能在 mac 上双击运行：打包后的冒烟只校验产物路径、不启动应用，而 ad-hoc 签名的包会被 Gatekeeper 拦。这条边界不要对外说成「mac 版可用」。

mac 侧只在真机上暴露的四个坑（2026-09-29 实测，逐层剥出来）：

| 现象 | 根因 | 处置 |
|---|---|---|
| 打包一开始就报读不到 `apps/desktop/.env.macos` | `package-target.ts` 无条件加载该文件 | workflow 在打包前生成它（App ID、强更策略、并发）。`--unsigned` 跳过的是 Apple 凭据校验，不是这个文件 |
| `prepare:dsh` 报 `DSH_DESKTOP_MACOS_SIGNING_IDENTITY must be set` | `prepare-dsh.ts` 在 `darwin` 下无条件解析签名身份 | `DSH_DESKTOP_UNSIGNED` 会传进子进程，未签名时跳过内核与 primary-runtime 的原生 Mach-O 预签名 |
| `EMFILE: too many open files` | 随包插件集有 43099 个文件，而 mac runner 的 `kern.maxfilesperproc` 只有 10240；只抬 `ulimit` 无用 | 打包步骤内 `sudo sysctl -w kern.maxfiles=400000 kern.maxfilesperproc=200000`，再 `ulimit -n 200000`（必须同一步骤的同一 shell） |
| `codesign --verify --deep` 失败，事后重跑同一条命令却必过 | `@electron/osx-sign` 签完固定跑该验证且关不掉（`mac.strictVerify` 只管 `--strict`，`mac.timestamp` 被 `customSignOptions.timestamp \|\| undefined` 吞回默认） | 未签名通道让 electron-builder 整个跳过签名（`identity: null` + `forceCodeSigning: false`），由 `afterPack` 用 ad-hoc 身份自签 |

## 6. 冒烟

打包链**自带一步**（`smoke-packaged-runtime.ts`，约 56 秒）——它跑完才写 `windows-package` 阶段结果，若那一步失败就是打包失败。

**用打包产物手工自检时必须隔离**（否则打包版会把改动写进真实 profile）：

```powershell
$env:DSH_HOME = "<隔离目录>"
$env:SSID_MCP_CG_WS = "<空目录>"      # 跳过 CodeGraph 首次引导
# 启动 <隔离目录>/.../win-unpacked/思灵.exe
```

> Windows PowerShell 5.1 的 `Start-Process` **没有 `-Environment` 参数**——先设 `$env:` 再 `Start-Process`（子进程继承当前进程环境）。
>
> **全新隔离环境的断言会「假 FAIL」**：没有工作区也没有 API Key，页面停在工作区选择 + 密钥引导，输入框一类断言必然取不到——此时以「骨架 + 启动阶段」为放行依据。
>
> **单实例锁**：若已有实例在跑，新进程会 `single-instance lock FAILED -> quit`（正常退出，非崩溃）。

**NSIS 冒烟**（改过安装器脚本时先跑它，别等打包）：

```powershell
pwsh -NoProfile -File apps\desktop\scripts\smoke-installer-directories.ps1 `
  -Makensis "<...>\nsis-3.0.4.1\Bin\makensis.exe" `
  -SevenZip "<...>\unsigned-artifacts\.nsis-directory-installer\7za.exe" `
  -FrameLibrary "<...>\installer-ui\window-frame.dll"
```

**必须用 pwsh**（PS 5.1 缺 `CreateTempSubdirectory`）。**五个**场景：`first` / `upgrade` / `locked` / `broken` / `cancelled`——只有前两个期望 exit 0（新资产、不 obsolete），其余三个期望 exit 2（旧资产、obsolete）。五个场景 2026-09-28 实测全绿。

## 7. GitHub 交付

```powershell
git status                                   # 先看清单：确认只有本版该进的东西
git add <具名路径>…                          # **不要 `-A`**：会把未提交的实验代码一起卷进 release commit
git commit -m "release: vX.Y.Z ..."; git push
git tag vX.Y.Z; git push origin vX.Y.Z
gh release create vX.Y.Z -R Max-Null/seek-soul-in-darkness --title "思灵 vX.Y.Z：..." --notes-file docs/release-notes-vX.Y.Z.md --latest
```

上传资产（**名称必须与 `latest.yml` 的 `url` 字段完全一致，否则增量更新 404**）：

小资产（`latest.yml`、`.blockmap`，< 1 MB）用 gh 即可：

```powershell
$A = ".ssid-build\checkout\apps\desktop\.desktop-build\targets\win-x64\unsigned-artifacts"
gh release upload vX.Y.Z "$A\ssid-X.Y.Z-win-x64-unsigned.exe.blockmap" -R Max-Null/seek-soul-in-darkness
gh release upload vX.Y.Z "$A\latest.yml"                               -R Max-Null/seek-soul-in-darkness
```

**安装包（数百 MB）必须直连、且用流式 `-T`**（2026-09-29 v1.1.1 实测，429 MB / 94 秒）：

```powershell
$R = 'Max-Null/seek-soul-in-darkness'
$relId = gh release view vX.Y.Z -R $R --json databaseId --jq '.databaseId'   # 要 databaseId，不是 id
curl.exe --fail --show-error -X POST --noproxy '*' `
  -H "Authorization: token $(gh auth token)" `
  -H "Content-Type: application/octet-stream" `
  -T "$A\ssid-X.Y.Z-win-x64-unsigned.exe" `
  "https://uploads.github.com/repos/$R/releases/$relId/assets?name=ssid-X.Y.Z-win-x64-unsigned.exe"
gh release view vX.Y.Z -R $R --json assets   # 传完核对：size 与 digest 必须与本地一致
```

- **为什么不能走代理**：环境里设了 `HTTP_PROXY`（本机 `127.0.0.1:7897`）时，`gh release upload` 25 分钟零进展。**`--noproxy '*'` 直连**即可（本机直连 GitHub 反而更快：api.github.com 直连 0.35 s / 代理 1.03 s）。
- **`--data-binary` 对数百 MB 资产不可用**：它把整个文件读进内存——2026-09-29 实测 429 MB 的包让 curl 常驻 438 MB 工作集、25 分钟零进度；换成流式 `-T` 后同一条命令 94 秒传完。v1.0.0 记的「83 秒」是 `--data-binary` 在当时那次的数值，不适用于这个量级。
- **`curl -F` 是错的**：它发 multipart，GitHub 会把包装字节原样存下——实测返回的 `size` 比本地多 236 字节、`digest` 与本地 SHA256 不符。要用 `-T` + `Content-Type: application/octet-stream`。
- **chunked 也不行**：加 `Transfer-Encoding: chunked` 被拒（400），uploads API 要 `Content-Length`。
- **判据**：上传响应里的 `size` 与 `digest`（`sha256:…`）必须与本地一致——这是唯一能发现「内容被包装过」的检查；不一致就 `gh release delete-asset` 删掉重传。
- **git 提交 / 打标 / push / `gh release` 都归开发会话**；**只有 `npm publish` 由用户手动**（铁律 9）。
- **【待验证】完整的更新闭环**（打包 → 发布 → 旧版检测到新版 → 下载 → 安装）需要真实发一版并装旧版，成本高，**尚未走过**。

## 常见坑

- vendor 的 `package.json` 版本号漏同步 → 安装版首启误报「可更新」。
- 插件 npm 发布晚于打包 → 包里的插件是旧版（要重打）。
- `cordis.patch.yml` 的 `insert` 子条目必须带显式 `id`（无 id = 随机 id，插件中心禁用失效 + 垃圾行累积）。
- **`splitPatchFile` 的子条目判据必须只认 mapping 起始**（`- 键:`），不认任意 `- \S`：`args:` 下的标量项 `- '--exclude'` 会被误当子条目，拼出非法 YAML，内核 boot 直接报 `bad indentation of a mapping entry`（2026-09-28 真实事故，见手册坑 #30 的新形态注记）。
- **`npx tsc --noEmit -p apps/desktop/tsconfig.json` 会假绿**——一律以 `tsc -b` 为准，且以**打包链真正跑的那条命令**（根级 `tsconfig.host.json`）为准。
- **NSIS 脚本（含非 ASCII）必须 UTF-8 带 BOM**，否则 makensis 报 `Bad text encoding`；用 write 或 edit 工具改这类文件**都会**丢 BOM，改完必须复查前 3 字节是不是 `EF BB BF`。
- **electron-builder 把 makensis 的 warning 当 error**——宏里引用尚未定义的 define 时，用 `!ifdef` 包住。
- **pnpm 11 的 `allowBuilds` 占位符**：`pnpm-workspace.yaml` 里若还写着 `esbuild: set this to true or false`，那是没填完的模板，构建会以 `ERR_PNPM_IGNORED_BUILDS` 失败。
- **semver 的预发布陷阱**：`^0.1.1-rc.1` 只匹配 `0.1.1-*`，**不会**升到 `0.1.7-rc.2`——依赖声明必须显式改。
- **未分发合并重打**：发布 <24h、无用户流量时，删 release + tag 合并重打（`gh release delete --yes` + `git push origin :refs/tags/<tag>`），不浪费版本号。
- **插件更新不进 SSiD 版本**：插件作者新发布走插件中心一键更新；「刚打包却提示更新」= 包里是打包时刻的 pin 快照，属正常。

## 附：自建壳时代（≤0.4.0，已归档）

以下内容描述的是自建壳形态，**已随运行时归档**（tag `v0.4.0-selfbuilt` / 分支 `archive/selfbuilt-shell`）。留在这里是因为部分排查思路仍有参考价值，但**执行步骤不要照搬**：

- 归档重建 `node shell/scripts/prepare-runtime.mjs`（产出 `dsh-runtime.tar.gz`，有缓存约 9 分钟）——**fork 版不再产出该归档**（内核随包进 asar 的 `dsh/`）。`shell/scripts/prepare-runtime.mjs` 与 `verify-release.mjs` 都已无对象。
- 归档抽查 `npm run verify:release`、交付链三层校验 `npm run verify:shipped`、`npm run pack`（= `bundle-kernel` + `bundle-kernel-child` + electron-builder）——均随自建壳下架。
- 版本号「四处同步」（`shell/package.json` / `.runtime-version` / profile 内 `.runtime-version` / GitHub tag）——载体已变，见 §1。
- 值得保留的两条通用经验：①**发版前「打包版自检」不可省**——dev 模式跑不到 `isPackaged` 分支，凡有该分支的代码，发布前必须用打包产物实际跑一遍；②**「数出来的」描述会过时**——文档里写「四个 vendor 包」这类具体数字，改动集合时顺手核对。

更早各版本（v0.1.13–v0.4.0）的逐版收货记录已移出本文——它们在 git 历史里，需要时 `git log -p .agents/skills/ssid-release/SKILL.md` 取。
