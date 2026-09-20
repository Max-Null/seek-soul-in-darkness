---
name: ssid-release
description: "SSiD（思灵）发版流程：版本决策、内置插件对齐（vendor/npm/pin 陷阱）、release notes、版本号四处同步、prepare-runtime 归档重建（约 25 分钟）、npm run verify:release 归档抽查、npm run pack 打包与 verify:shipped 三层校验、打包产物实机冒烟、GitHub tag/Release 交付。触发词：用户说『发版/发布思灵/SSiD 发版/ssid 收尾/SSiD 版本升级收尾/思灵打包/发布安装包』或提到 vX.Y.Z 版本发布时使用。依据 docs/发版流程规范.md（v0.1.12 复盘），实操细节见本文档末尾的已验证经验。"
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
- **`check-profile-sync` 报版本失配时，先判方向再动手**（同名不同版；判据详见手册 §7 坑 #37）：
  - **B 落后于 A**（运行时 pin 旧于 template）= 可预期的稳态，部署时会按 template 补上，通常不必动；要立刻拉平就 `pnpm install`。
  - **B 超前于 A** ⚠（运行时 pin 新于 template）= 下次部署会被归档包覆盖，**必须补进 `profile-template`**（铁律 5 双处声明）；此时 `pnpm install` 是**反方向**动作，会把本机独有的版本静默降回。
  - `file:` / `git:` 这类非 semver 形态判不出方向，门给中性文案——须人工核对。
- **peers**：`pnpm peers check` 失败项若为宿主官方 peer（@deepseek-ai/dsh-*），hoisted 布局下为既有特征，运行时由 cordis loader 注入，`prepare-runtime.mjs` 的 MISSING_PEERS 无需补；新引入第三方插件的 peer 先 semver 判定再下结论。

## 2. 更新日志

- `docs/release-notes-vX.Y.Z.md`，格式沿用惯例（内置升级 / 新增 / 调整 / 修复 / 更新说明）。
- 分组依据 `git log --oneline v上版本..HEAD` 提炼，不凭记忆。
- **同步内置弹窗/关于页资源**（更新日志功能在 dsh-ssid-panels 插件内：启动弹窗 + 关于 SSiD「更新日志」区共用）：
  ```powershell
  Copy-Item docs/release-notes-vX.Y.Z.md plugins/dsh-ssid-panels/release-notes.md -Force
  # 守卫校验：首行 # vX.Y.Z 必须 == shell/package.json version（不一致不弹不显示）
  node --import tsx/esm --test plugins/dsh-ssid-panels/tests/release-notes.test.ts
  # 构建 + vendor 同步（发版链 1.1 的 vendor 步骤含本插件的 lib/src/release-notes.md）
  pnpm --dir plugins/dsh-ssid-panels exec tsdown
  ```
  - 弹窗规则：每版本只弹一次，已读状态记在壳的**共享状态文件** `~/.ssid/changelog-seen.json`（**不是** localStorage，也不随 profile 隔离——所以"全新隔离环境"未必会弹，别把它当必然事件）；条目版本 ≠ 壳版本不弹（守卫，防发版漏同步弹错）。
  - 关于 SSiD「更新日志」区离线展示当前版本（包内文件），「检查更新」仅补充在线历史版本。

## 3. 版本号同步（四处）

`shell/package.json` version（bump，prepare-runtime 的 ssidVer 来源）· `.runtime-version`（归档内，自动生成勿手改）· profile 内 `.runtime-version`（deploy 自动对齐）· GitHub tag `vX.Y.Z`（与 package.json 严格一致）。

## 3.5 发版前守卫（必须全绿的轻量环）

**七道检查门**（BOM / 旧名残留 / profile↔模板声明 / vendor 四份一致 / bundle 不内联 DSH / 插件 peerDeps 覆盖性 / DSH 源码只引用不改）：

```powershell
cd shell
npm run check:rules          # 7 门全跑，任一失败即 exit 1
```

**两条单测冒烟**：

```powershell
# 更新器纯逻辑（dev unavailable / 事件流 / install 守卫 / 错误翻译）
node --test shell/updater-core.test.mjs
# 更新日志解析（版本守卫 / 分节解析）
node --import tsx/esm --test plugins/dsh-ssid-panels/tests/release-notes.test.ts
```

## 4. 归档重建

```powershell
cd shell
node scripts/prepare-runtime.mjs   # 实测约 25 分钟（2026-09-14 v0.3.0）
```

- **运行约束**：完成前不要在 ssid profile 上做任何 pnpm 操作（扰动 lockfile）。
- **耗时构成**（据此安排时段）：`runtime-integrity.sha256` 生成 65,000+ 条约占 **291 秒**，随后 1018 MB 的 `tar -czf` 再 1-3 分钟。早期文档写的「3-5 分钟」是 sha256 清单引入之前的口径。
- 完成后完整性检查：归档约 **230 MB**（v0.3.0 实测 230.5 MB / 73,719 条目；明显偏小 = 中断/损坏，必须重跑）。
- 产物不入库（`.gitignore`），由安装包内嵌。

## 5. 归档内容抽查（发布前必须全过）

**首选机械化**——脚本自己解包核对，且刻意不做部署与 boot（那两步会改变运行环境）：

```powershell
cd shell
npm run verify:release        # 覆盖旧 §5-1…§5-8 的绝大部分
# 加 --npm-latest 才联网核对「plugin-center == npm 最新」（默认跳过，避免发布前意外联网）
```

- 输出 `✓ 通过：0 处违规` 即通过；它会打印 `.runtime-version`、清单条数与自洽性、plugin-center / better-sidebar 版本、capture 功能标记、顶层依赖数、四个 vendor 包一致性。
- **已知过时项（脚本待修，见手册待办 #12）**：§5-2 仍检查 `open-sea-skin/plugin/client.js`——该定制 v0.1.16 已移除，报「归档内无该文件」是**假提示**；同节体积上限 213 MB 已被依赖增长突破（v0.3.0 为 230.5 MB），脚本自己会提示「通常是依赖增多」。

**手工兜底**（脚本报可疑项、或需要眼见为实时）：

```powershell
New-Item -ItemType Directory dsh-runtime            # prepare-runtime 已删源目录，-C 目标必须先存在
tar -xzf dsh-runtime.tar.gz -C dsh-runtime
# 1) .runtime-version == <ssidVer>-<dshVer>-<指纹>
# 2) @max-null/dsh-plugin-center version == npm 最新
# 3) dsh-better-sidebar version == pin 预期
# 4) @max-null/dsh-capture/lib/client.js 含最新功能标记
# 5) package.json dependencies 含本轮新增（逐项核对本版本 release notes）
# 6) vendor 包 package.json 版本号与源仓库一致
# 7) release-notes.md 首行 `# vX.Y.Z` == 归档 ssid 版本（启动更新日志弹窗守卫）
```

## 6. 打包与发布

1. `npm run pack`（**已含** `bundle-kernel` + `bundle-kernel-child` + electron-builder NSIS/zip；不要再单独跑 `bundle-kernel`，否则漏掉子进程 bundle）：
   - 日志 `[after-pack] dsh-runtime.tar.gz OK (230.5 MB)` = 归档已内嵌；`[after-pack] node.exe -> resources/node/node.exe` = 子进程内核用的 node 已落位；
   - 产物（`artifactName` 早已是英文，**不需要**再复制中文名副本）：`dist-electron/ssid-shell-setup-<ver>.exe`（+ `.blockmap`）、`ssid-shell-<ver>-win.zip`、`latest.yml`；
   - 打包后立刻跑 **`npm run verify:shipped`**：核对仓库根 / `win-unpacked` / `setup.exe` 内层三层的内核哈希是否一致（回答「装进去的内核是不是本次构建的那一份」）。
2. **本机自动冒烟（推荐，替代人工开思灵核对）**——`.agents/skills/ssid-release/smoke-ui.cjs`：
   ```powershell
   # 存在性检查（骨架 / Context Doctor / 输入框），自动发现思灵 web 端口
   node .agents/skills/ssid-release/smoke-ui.cjs
   # 检查会话内 dsh-context 标签（对话/轨迹/上下文）
   node .agents/skills/ssid-release/smoke-ui.cjs --session "会话标题"
   # 全链路：发消息触发 genui fence/面板 + 宽度对齐断言（消耗一次模型调用）
   node .agents/skills/ssid-release/smoke-ui.cjs --send "把面板里的仪表盘换成线图并更新会话面板（panel:true）"
   ```
   - 依赖：ssid profile 的 playwright（`@playwright/mcp` 自带 chromium）；思灵已启动。
   - 端口自动发现：遍历 `ssid-shell` 路径进程找监听者（**只对安装版有效**；dev 与 `win-unpacked` 的进程路径不含该串，须显式 `--cdp <port>`，见文末 v0.1.16 条）。
   - 断言：composerSeat / 输入框 / Context Doctor（hero+会话）/ 会话标签 / genui 面板出现 / **面板宽 ≤800 且 < 座椅宽（非全宽）**。
   - 交互障碍：模型弹提问卡片时自动选首选项/跳过，然后继续等待面板。
   - 产物：`<outdir>/1-base.png`、`2-conversation.png`、`3-final.png` + PASS/FAIL 清单（人工核实截图后决定放行）。
   - **发布完成后清理验证产物**（会话 = 归档；DSH 无删除入口，只有"归档会话"菜单项）：
     ```powershell
     # 归档验证会话（逗号分隔标题；归档后从主列表消失，可在归档里恢复）
     node .agents/skills/ssid-release/smoke-ui.cjs --clean-sessions "验证会话A,验证会话B"
     # 删除本次冒烟截图目录
     node .agents/skills/ssid-release/smoke-ui.cjs --clean --outdir H:/MaxNull/WorkStation/.dsh-tmp/ssid-smoke/<时间戳>
     ```
   - **用打包产物自检时必须隔离**（否则打包版会把归档部署进真实 profile）：`--user-data-dir` 给临时目录，并把 `DSH_HOME` / `SSID_LOG_FILE` / `SSID_MCP_CG_WS`（指向空目录，跳过 CodeGraph 首次引导弹窗）指到隔离目录内再启动 `win-unpacked\思灵.exe`。**Windows PowerShell 5.1 的 `Start-Process` 没有 `-Environment` 参数**——先 `$env:DSH_HOME=...` 再 `Start-Process`（子进程继承当前进程环境）。通过判据：日志出现 `runtime deploy needed (archive=<新指纹>)` → `runtime deployed` → `upgrade report: lostPlugins=0` → `bootKernel ok` → `phase start() completed`。
   - **全新隔离环境的断言会「假 FAIL」**：没有工作区也没有 API Key，页面停在工作区选择 + 密钥引导，`输入框` / `Context Doctor` 必然取不到——`bodyHead` 文本即可判定；此时以「骨架座位 + 部署链路 + 启动阶段」为放行依据（v0.3.0 实测）。
   - **更新日志弹窗会盖住骨架断言**：脚本已自带 `dismissChangelog()`（识别「思灵已更新」再点「知道了」），输出里的 `changelog=dismissed | not-shown` 即其结果；弹不弹取决于壳的共享状态 `~/.ssid/changelog-seen.json`，**隔离环境不一定弹**（v0.3.1 实测：同一份包首跑弹、删状态后二次跑仍不弹），`not-shown` 不是异常。
   - 手动兜底：重启思灵 → 日志 `runtime deploy needed (archive=<ver> proxy=<old>)` → deploy 成功 → boot 正常。
3. GitHub 交付：
   ```powershell
   git add -A; git commit -m "release: vX.Y.Z ..."; git push
   git tag vX.Y.Z; git push origin vX.Y.Z
   gh release create vX.Y.Z -R Max-Null/seek-soul-in-darkness --title "思灵 vX.Y.Z：..." --notes-file docs/release-notes-vX.Y.Z.md --latest
   # 四个资产（名称均为英文，直接传；v0.3.0 实测 359.8 MB exe / 409.7 MB zip 各 1-2 分钟）
   gh release upload vX.Y.Z "shell/dist-electron/ssid-shell-setup-X.Y.Z.exe" -R Max-Null/seek-soul-in-darkness
   gh release upload vX.Y.Z "shell/dist-electron/ssid-shell-X.Y.Z-win.zip" -R Max-Null/seek-soul-in-darkness
   # 在线增量更新（electron-updater）必须的元数据与差分：
   gh release upload vX.Y.Z "shell/dist-electron/latest.yml" -R Max-Null/seek-soul-in-darkness
   gh release upload vX.Y.Z "shell/dist-electron/ssid-shell-setup-X.Y.Z.exe.blockmap" -R Max-Null/seek-soul-in-darkness
   # 传完核对：资产名必须与 latest.yml 的 url 字段完全一致（不一致 = 增量更新 404）
   ```
   - latest.yml 由 electron-builder 生成（build.publish: github provider 已配置）；上传后老用户点「检查更新」即可增量下载（只下变化块）。
   - 更新链路：electron-updater（shell/updater.mjs）→ dsh-ssid-panels 关于页「检查更新/下载/安装并重启」（/ssid/api/update.* 桥）；dev（未打包）全部返回 unavailable。
   - **在线更新诊断信息**（实测失败时收集，用户可提供）：
     - `~/.ssid/updater.log` —— 主进程更新器全程日志（init/状态事件/check/download/installer spawn+exit 码/错误堆栈，同步落盘）
     - `~/.ssid/ssid.log` —— 壳层日志（启动/阶段）
     - 思灵 devtools console —— 插件侧 `[ssid-update]` 日志（状态流/API 响应/异常）
     - DSH 日志（`~/.dsh/logs/`）—— 插件 host `[ssid-update]` 桥接口记录

## 常见坑（累积）

- vendor package.json 版本号漏同步 → 安装版首启误报「可更新」。
- `^0.x.y` 不跨 minor → 显式改 pin。
- 插件 npm 发布晚于归档重建 → 归档旧版（重打归档 + 重打安装包，两趟）。
- 归档被进程/电源中断 → 体积异常必重跑；tar 有 partial 列表仍可能损坏。
- SSiD 内 pnpm add 可能静默 no-op → plugin-center 有版本核对防护，升级说明提示手动命令兜底。
- cordis.patch.yml insert 子条目必须带显式 `id`（无 id = 随机 id，插件中心禁用失效 + 垃圾行累积）。
- 绿屏/断电后：先检查归档与后台任务，不要直接复用疑似半成品。
- **gh 上传大文件**：早期（v0.1.14/mac）实测 256MB+ 会挂，但 **2026-09-14 v0.3.0 实测 359.8 MB 的 exe 与 409.7 MB 的 zip 经 `gh release upload` 各 1-2 分钟正常传完**——先直接试 gh，失败再回退 `curl -F` 直传 uploads API（见文末 v0.2.0 条）。
- **归档里的 release-notes 是发版时快照**：发布后再改 `docs/release-notes-*.md`（例如回填 hash、把「待发布」改成「已发布」）不会同步进归档内那份——对外以 GitHub Release 页与 `docs/` 为准，或接受「下次归档自然带上」。v0.3.0 即如此。
- **改完 release notes 要重走弹窗同步链**（§2）：Copy 到 panels → 单测 → tsdown → `sync-vendor --apply --web`，否则 `check-vendor-sync` 会报 vendor 三处漂移。

## 已验证经验（2026-08-26 v0.1.13 收货）

- prepare-runtime 的 node/pnpm 自动发现：node 命中 PATH（v26.2.0）、pnpm 命中 %APPDATA% 全局 cjs，无需 DSH_NODE/PNPM_CMD（缺失时才显式设置）。
- 第三方插件 vendor 化：复制 npm/git 的 package.json + lib + cordis.patch.yml（+ LICENSE/README）；genui 这类含按需 assets 的包必须带 lib/assets/；`src/` 不复制。
- 面板修复类 vendor 固化（dsh-genui 0.9.2 + PR #58 修复）在上游合并并 npm 发布后，应切回 npm 声明并删除 vendor 与临时补丁脚本。
- 发版前置检查：`git status` 干净 + `git log v上版本..HEAD` 分组 + 安装目录归档备份（替换前 `.bak`）。
- dev profile（`~/.dsh/profiles/ssid`）与发布模板两处同步（依赖/bundles/vendor）；git 只提交模板侧。

## 已验证经验（2026-08-27 v0.1.14 收货）

- **gh release upload 中文文件名坑**：默认上传带中文/空格本地文件名会被 GitHub 规范化（「思灵 Setup x.y.z.exe」→「Setup.x.y.z.exe」），而 latest.yml 的 url: 引用 electron-builder 的 artifactName（如 ssid-shell-setup-x.y.z.exe）——不一致 = 增量更新 404。规避：打包后复制英文名副本（ssid-shell-setup-<ver>.exe + .blockmap）再上传，上传后 gh release view --json assets 核对资产名与 latest.yml 完全一致。
- prepare-runtime 输出 200 MB 级归档（0.1.14 为 200.2 MB，新预置增多属正常）；抽查 vendor 路径区分 @max-null（capture/panels）与 @changfenhuang（genui）。

## 已验证经验（2026-08-27 v0.1.14 hotfix 收货）

- **不可 spread 有原型的宿主对象**：对象展开只拷贝自身可枚举属性——EventEmitter 实例的 on/checkForUpdates 在原型上，展开后会丢，packaged 首启即崩（v0.1.14 启动失败根因）。绑定注入用 Proxy 委托（get 拦截注入自定义方法，其余 Reflect.get）。此坑同样适用事件/拦截器类对象的绑定。
- **发版前「打包版自检」缺口**：dev 模式跑不到 packaged 分支（isPackaged=false 跳过）——凡有 isPackaged 分支的代码，发布前必须用打包产物（win-unpacked）实际跑一遍启动；发版守卫应加「打包产物启动」环节。

## 已验证经验（2026-08-28 v0.1.15 收货）

- **第三方升级规则（用户拍板）**：第三方插件更新到 npm 最新；本地版本超前 NPM 则以本地为准（vendor/魔改优先）。大跳版本（如 dream-skin 0.4.14→8.28.0）先核实 author/发布时间/peer 范围，pnpm install 实测无 ERR_PNPM 即安全；普通跳级（0.1.1→0.1.4）直接升。
- **vendor 定制被作者采纳的判定法（genui 案例）**：本地 vendor 魔改（模板中心/成就/dock 对齐）是否已入上游 npm 版——下载 npm tarball（npm pack → tar -xzf），对比定制标记（搜「模板中心/探索成就/面板/dock」）+ `lib/index.js` 字节一致 + `client.js` 仅 minifier 微调（byte-level diff 定位）→ 判定采纳，可切回 `^x.y.z` 并（保留 vendor 作参考即可，不必删除）。
- **版本决策时核查「未 bump 的源码 commit」**：`git log v上版本..HEAD -- <插件>` 与插件 package.json 版本比对——若源码有改动但版本没 bump（panels 0.1.8 后 3 个优化 commit 未升版），发版前补 bump（否则安装版首启误报/插件中心版本混乱）。
- **发版变更一次收齐再跑归档**：本次同批含 session-manager 新增 + panels 补版本 + 第三方升级 + genui 切 npm，若分批改动每批都跑一遍 prepare-runtime 耗时大——列出全部变更→一次改完→跑一次归档（改 plan 前先确认变更全集，避免 kill 重跑）。
- **git log v上版本..HEAD 分组要含非插件 commit**：CI 流程（如 build-mac workflow）、文档/临时脚本删除、skill 更新也计入 release notes 分组（用户惯例：改了就升、变动即说明）。
- **打包版自检的「单实例锁」误判**：打包版自检时若已有实例运行，新进程会 `single-instance lock FAILED -> quit`（正常退出非崩溃）——判断标准看 `~/.ssid/ssid.log` 的 `phase start() completed` 与 bootKernel ok，而非进程存活。
- **release-notes 单测的 cwd**：`node --import tsx/esm --test plugins/dsh-ssid-panels/tests/release-notes.test.ts` 必须在仓库根或有本地 tsx 的目录跑，绝对路径 + 错误 cwd 会 ERR_MODULE_NOT_FOUND（tsx 从 cwd 解析）——在 panels 目录内跑即可。

## 已验证经验（2026-08-30 v0.1.16 收货）

- **master 内核 web 认证 → 冒烟脚本裸 URL 失效**：0.1.2-alpha.1 起 web 服务带 token（`kernel.url` = authenticatedUrl，仅存在壳进程内存）。smoke-ui.cjs 裸 `http://127.0.0.1:<port>/` 拿到认证页 → 骨架断言全 FAIL（非产品问题）。**解法：打包版带 `--remote-debugging-port=9334` 启动 → Playwright `connectOverCDP` → 找 `http://127.0.0.1:<port>/` 主视图页（自带 token）**，在真实页面上跑骨架断言（composerSeat/textarea/Context Doctor，v0.1.16 实测 PASS）。smoke-ui.cjs 的裸 URL 路径与端口自动发现（按 `*ssid-shell*` 进程匹配）同样对打包版（win-unpacked 路径）失效——CDP 方案两者兼得。
- **@deepseek-ai/dsh-* 未上 npm → 归档用 SSID_REGISTRY 私有源**：`0.1.2-alpha.1` 是 master 源码版，npm 各子包 E404（dsh-bash-local 等）。本地已搭 verdaccio（127.0.0.1:4873，本地存储 + 代理 npmjs）+ `pnpm -r publish` 253 包（见 2026-08-29 执行记录 L1 节）→ `SSID_REGISTRY=http://127.0.0.1:4873 node scripts/prepare-runtime.mjs`。官方 npm 发布后去掉 SSID_REGISTRY 即切官方源。
- **归档 vendor 残留 tgz 混入**：profile-template/vendor 的旧物料（dsh-session-manager-0.2.2.tgz，v0.1.15 时代声明残留）会被 vendor 修复循环（4.5 步）当 vendor 条目复制进闭包 node_modules——发版前核对 vendor 目录只含当前声明条目，残留删除后重跑归档（指纹变化确认）。
- **prepare-runtime 会删除 dsh-runtime 源目录**（[7/7]）——归档抽查前先 `New-Item -ItemType Directory dsh-runtime` 再 `tar -xzf dsh-runtime.tar.gz -C dsh-runtime`（-C 目标不存在即失败）。

## 已验证经验（2026-09-06 v0.2.0 收货）

- **build-mac 全链落位与十轮排雷**：workflow 在 main（`build-mac.yml` 双 job→单 arm64）；关键修复：DSH clone 必须完整 checkout 到 `$GITHUB_WORKSPACE/../deepseek-harness`（tsconfig paths 编译期解析 dsh-* 源码，sparse/runner.temp 均失败）+ `--branch <dsh-tag>` 防漂移；prepare-runtime 的 pnpm 只收 `.cjs` 入口（CI shim 是 shell 脚本）；esbuild / resolve.exports 显式 devDep + `--alias`；mac artifactName 全英文（GH 中文剥离坑），zip 的 artifactName 放 mac 层（build.zip 非法）。
- **大文件 gh 上传**：256MB+ 会挂死/404——`curl --proxy http://127.0.0.1:7897 -F "file=@..." https://uploads.github.com/repos/<o>/<r>/releases/<数字id>/assets?name=...`（release id 用 REST 数字 id，不是 node_id）；删除多余资产 `gh api -X DELETE .../releases/assets/<id>`。
- **未分发合并重打**（v0.1.18 教训）：发布 <24h 无用户流量→删除 release+tag 合并重打（gh release delete --yes + push origin :refs/tags/<tag> + force tag 新 commit 触发 CI），不浪费版本号；本次升级直接进位 v0.2.0。
- **插件更新不进 SSiD 版本**：插件作者新发布走插件中心一键更新；SSiD 模板 pin 同步（下次发版归档自然最新）；「刚归档却提示更新」= 归档是发版时刻 pin 快照，属正常。
- **smoke-ui 已支持 `--cdp <port>` 模式**（connectOverCDP 找 http://127.0.0.1:<port>/ 主视图页，自带 token）。
- **deploy EPERM**：杀实例后清理 profile 运行时残骸（node_modules 残骸/old/old2/.upgrade-backup）走首装路径即成功。
