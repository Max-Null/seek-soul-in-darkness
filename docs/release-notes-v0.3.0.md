# v0.3.0 思灵（SSiD）

> 状态：待发布（2026-09-07 起草，2026-09-13 补「内核与运行架构」一节，2026-09-14 按
> `git log v0.2.1..HEAD` 的全部 67 个提交补齐分组）。「下载与校验」节的 hash 与体积
> 于打包后填入。
>
> 版本号由原计划的 0.2.2 改为 **0.3.0**（用户判定，2026-09-13）：内核移出 Electron
> 主进程属架构级变更，叠加内核自身 0.1.2-rc.1 → 0.1.5-rc.2 的大版本跨越。

## 内核与运行架构

- **内核移出 Electron 主进程**（本版最大的变更）：DSH 内核改跑在独立 Node 子进程里，
  经 Node IPC 与壳通信。三个收益：不再需要 `module-resolution.ts` 的 `registerHooks`
  绕 `ctx.loader.internal`（Electron 内 native addon 探测不到标准 Node 的 V8 embedder）；
  内核崩溃不再拖死界面；**重启 DSH 只需换内核**——窗口/托盘/标题栏都不重建，
  比整壳重启快得多。设 `SSID_KERNEL_CHILD=0` 可退回同进程模式。
- **打包链路随之调整**：`kernel-child.bundle.mjs` 由 esbuild 自包含产出，经
  `extraResources` 落到 `resources/` —— 子进程是纯 `node.exe`，没有 Electron 的
  asar 补丁，读不到 asar 虚拟文件系统。打包形态显式传 `preferBundled`，
  防 `$DSH_CHECKOUT` 残留变量劫持运行时。
- **新增纯净模式（故障恢复）**：托盘「以纯净模式重启（只留官方插件）」或命令行
  `--ssid-safe-mode`。只加载官方 bundle 的插件行，**不碰任何数据**（会话/设置/记忆/
  storage 一律不动），用于救「第三方插件把 boot 弄坏、设置页进不去」的环境；
  同一位置可切回正常模式。
- **内核升级 0.1.2-rc.1 → 0.1.5-rc.2**：适配 `dsh-pocket`（2.10.3 → 2.10.6）与
  `dsh-persona` 的字段变更（`text` → `prefix`）；标题栏改为显示**实际加载**的内核
  版本（原先读部署闭包，dev 下与实际不符）。
- **「AI 提问」通知在子进程模式下恢复**：改由子进程内包装 `userQuestions.ask`
  并上报事件。

## 内置升级

- **升级部署「用户层保留」子条目级修复**：用户自装 MCP 作为既有 `- insert:` 列表
  追加子条目时，升级部署不再丢弃（v0.2.1 只覆盖了「独立顶层 insert 块」形态）；
  另修复 UTF-8 BOM 开头文件整块丢弃风险。配套单测 18 例。
- **用户对出厂 MCP 条目的改动不再被升级打回**：patch 合并升级为**三方合并**
  （以「上次部署的模板」为基线）——用户在 MCP 管理页改过的 cwd / 启停等改动会
  跨升级保留，同时模板自身的升级（如新增保护参数）对未改动的条目照常生效。
  升级报告的 `patchMerged.overridden` 会列出被保留的用户改动。
- **CodeGraph MCP 预制修正**：出厂关闭匿名遥测（`CODEGRAPH_TELEMETRY=off`）；
  引擎由 postinstall 下载（升级链允许 build scripts，见 archive 修正）。
- **CodeGraph 索引目录不再默认用户主目录**（用户反馈修复）：此前出厂默认把索引
  目录设为用户主目录，而主目录没有代码仓库——首次调用会扫描 `AppData` 等无关目录、
  撞 `--max-files` 上限后长时间卡死（8 分钟+、内存 900MB+），恢复响应后查询结果也
  与项目无关。现在改为 **boot 前解析**：`SSID_MCP_CG_WS` 环境变量 →
  `~/.ssid/codegraph.json` → **最近会话的工作目录**（自动适配）；都取不到时该 MCP
  **保持停用**（不再扫描主目录）。首次启动会弹一次引导（可跳过，随时可在
  「设置 → MCP」里改）；出厂 args 另加 `--exclude node_modules/.git/AppData/target/dist/build/.venv/__pycache__`
  保护清单。详见 `docs/决策/2026-09-09-CodeGraph-MCP-默认索引目录修复.md`。
- **dsh-wechat pin 修正**：`^0.9.1` → 精确 `0.9.1`（归档确定性）。
- **归档新增逐文件 sha256 清单**：`runtime-integrity.sha256`（65,388 条），
  发版校验脚本据此核对解压结果，回答「解压出来的文件对不对」。
- **dsh-chat-rail 0.6.1 → 0.6.2**（导航条四项改造）：hover tip 里的「提问&回答」
  改用 SVG 图标标示（不再用字符当图标，且与文字垂直居中对齐）；「只显示收藏」开关
  成为面板的**通栏 header**（折叠与展开同构、贴顶、不再压住条目）；导航条右缘
  **改锚会话区右列**——官方右侧边栏 push 展开时会话列左移，导航条跟随移动，不再被
  压在文件面板下面；样式标签补 `data-plugin` 归属标记。
- **dsh-quick-toolbar（vendor 0.8.6）**：样式标签补 `data-plugin` 归属标记（避免被
  其它模块的 HMR 重载连带删除）；样式注入改为幂等 + 内容比对，并提到防重守卫之前。
- **ds-harness-remote 0.4.10 → 0.4.13**：上游修复了同类缺陷（样式标签缺
  `data-plugin` 归属，会被别的模块认领后随其 HMR 重载删除，issue #52 已关闭）；
  本机两个 profile 与模板同步升级。

## 调整

- 免安装版（zip）交付形态延续（v0.2.1 起）——Win10 64 位家庭版等安装器受阻场景
  的正解：解压即用，见「下载与校验」。
- 发版归档不再带调试截图与临时脚本：`build.files` 增加 `!.tmp-*` / `!*.png` /
  `!*.bak*` / `!*.pre-*` 排除——electron-builder 不读 `.gitignore`，此前被忽略的
  本地调试产物仍会被打进包。

## 修复

- 打包版子进程启动失败：`spawn` 的 `cwd` 曾指向 `app.asar`（那是文件不是目录），
  报错却是 `spawn ...node.exe ENOENT`（而该 exe 明明存在），极具误导性。已改为
  打包版取 `process.resourcesPath`。
- 部署失败/取消且旧环境无闭包锚点 → 明确阻断提示（不再「无法定位 DeepSeek
  Harness 运行时」崩溃）——v0.2.1 已含，本版回归确认。
- **插件中心「检查更新 / 安装」通道 405**（用户报告）：DSH 0.1.5 起
  `dsh-client-connection` 的 inject 收缩为 `[credentials, webRuntime]`，而 `rpc.handle`
  仍从 connection 自己的 ctx 取 `webServer`，于是抛
  `cannot get property "webServer" without inject`，请求落到 frontend-static 兜底 →
  405（同路径 GET 为 404）。**在配置层修复**：模板给 `connection` 行补回 `webServer`
  注入，不改 DSH 源码。根因、替代方案与给第三方作者的说明见
  `docs/决策/2026-09-14-插件中心405诊断记录.md` 与同日的持久化决策。

## 工程与门禁

- **七道检查门**并入 `npm run check:rules`：BOM 扫描、旧名残留、profile↔模板声明对比、
  vendor 各份一致性、bundle 不得内联 DSH、插件 peerDeps 覆盖性，以及**DSH 源码只引用
  不改**（`dsh-clean`）。
- **「DSH 源码只引用不改」升为工作区铁律 2.0**：`deepseek-harness/` 与
  `dsh-web-runtime/` 的源码一律不改，需要适配时只改我们自己的东西（profile 的 patch
  条目、自制插件源码、壳代码），由 `check-dsh-checkout-clean.mjs` 机械检查。
- **交付链三层校验**：仓库根、`dist-electron/win-unpacked`、`setup.exe` 内层三处的
  内核哈希必须一致（`npm run verify:shipped`）——回答「装进去的内核是不是本次构建的
  那一份」。
- **决策记录知识库化**：`docs/决策/` 的 83 篇编译为自包含单页（构建器 + 验证器 +
  三份同源的库验证器），可按状态/月份/标签浏览、全文检索。
- **新增两条坑条目**（手册 §7）：手动注入的 `<style>` 必须带 `data-plugin`（否则会被
  任意模块认领、随其 HMR 重载被删，元素留存而样式消失）；CDP 几何测量前先开焦点模拟
  （未聚焦窗口会冻结过渡时钟，读到的是过渡起始值）。

## 更新说明

- 老用户安装 v0.3.0：启动时版本指纹不一致 → 自动重部署运行环境（约 30 秒，
  可取消）；重部署后 profile 与本版预置一致，此前已被覆盖的用户 MCP 可从
  `~/.ssid/profile-backups/` 快照对照找回（2026-09-07 实例）。

## 下载与校验

- 优先使用免安装版（zip）：解压即用，绕过安装器/签名拦截；NSIS 安装版报
  「不支持的 16 位应用程序」= 下载文件损坏（非兼容问题），删后重下或换 zip。
- 资产（GitHub Release 页）：
  - `ssid-shell-0.3.0-win.zip`（约 4XX MB）
  - `ssid-shell-setup-0.3.0.exe`（约 3XX MB）
- SHA256（`certutil -hashfile <文件> SHA256`）：
  - zip：`<打包后填入>`
  - exe：`<打包后填入>`
