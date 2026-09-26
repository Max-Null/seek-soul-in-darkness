# SSiD（思灵）开发手册

> 适用范围：在 `seek-soul-in-darkness`（SSiD 库）内做开发、升级、验证的完整手册。
> 配套仓库与工作区布局见下方「工作区布局」。
> 事实来源：2026-08-29 SSiD 升级（rc.2 → master 0.1.2-alpha.1）全过程实测记录（见 `docs/决策/2026-08-29-SSiD升级执行记录.md`）。

## 铁律速查（一页纸，2026-08-30 定稿）

| # | 铁律 | 详见 |
|---|---|---|
| 1 | 放置规则：自制插件→`max-null-plugins/`；第三方→`third-party-plugins/`；参考/学习→`references/`；旧项目→`old-project/`；生态同级→顶层 | 工作区规范 |
| 2 | **不弑主体**：当前会话在 web(3080) 时禁启停任何 DSH 实例；重启前先判断会话宿主<br>**2.1 共享 checkout 是红线**：`deepseek-harness/` 同供 web 与 SSiD 作内核，切 tag／install／build 会连带影响运行中的 web 宿主，动前须经用户同意；隔离走独立副本 + 各自启动入口，**不用 `DSH_CHECKOUT` 用户级变量**；降级内核会永久损坏 v3 会话 | 环境与流转 5 / **§5.0 第 0 条** |
| 3 | 三环境流转：升级/测试谁，用另一半操作（医者不能自医） | 环境与流转 1–4 |
| 4 | dev 热更新，**发版才归档**；归档从模板（发版基准）构建 | §2 |
| 5 | 插件升级**双处声明**（profile + template）；JSON 一律 node 写（防 BOM） | §4 / §7 |
| 6 | **L1 门槛**：typecheck+test 全绿才能发版/进全家桶；新插件无测试不入库 | §9 |
| 7 | README **必须**有 `## 截图` 段 + `docs/shots/`（用户视角三覆盖） | §9 |
| 8 | 样式一致：DSH token + `data-slot`/aria-label 锚点；侧边栏插件耦合**不假设移除** | §9 |
| 9 | **npm 发版 F2A**：**只有 `npm publish` 由用户手动执行**；开发会话给指令（包名/版本/发布顺序/回滚预案）并负责**其余全部发版动作**——`git` 提交 / 打标 / push、`gh release create`、改三处 pin、装 profile 实体 | §9 / 流转 5 |

## 文档体系（层级）

- **手册**（本文件）= 规范权威（准则/流程/坑/待办）
- **`docs/决策/`** = 历史决策与执行记录（来龙去脉；规范的引用来源）
- **跨会话记忆** = 索引与速查（memory_search；与手册保持一致，过时即更新）

## 变更记录

| 日期 | 章节 | 变更 | 来源 |
|---|---|---|---|
| 2026-08-29 | §0–§8 | 初版（升级经验 8 节） | web 3080 会话 |
| 2026-08-29 | 工作区布局（初版） | 升级链路与目录关系 | web 3080 会话 |
| 2026-08-30 | 工作区规范（布局+放置规则） | 工作区整理定稿（目录/README 体系） | web 3080 会话 + 用户拍板 |
| 2026-08-30 | 开发环境与测试流转 | 三套 DSH 环境 + 医者不能自医流转 | 用户原话整理 |
| 2026-08-30 | §2 归档时机 | dev 热更新 vs 发版才归档（三原因） | 用户原话整理 |
| 2026-08-30 | 本表 + 待办清单 | 文档工程化（变更记录/待办） | 协作模式升级 |
| 2026-08-30 | §9 插件开发与测试规范 | 分级门槛 L1/L2/L3 + 反馈环纪律 | 用户提议（测试补齐后门槛化） |
| 2026-08-30 | §7 坑速查 | 新增 #10「DSH 页面状态持久化 = host 化，禁 localStorage」（动态端口 origin 隔离坑——quick-toolbar 状态/panels seen 两次实踩）| 用户拍板（localStorage 问题多次出现）|
| 2026-09-07 | §7 坑速查 / §2 | 新增 #12「部署零保留覆盖用户层」（用户插件/MCP 升级丢失 + pending 回滚雷；v0.2.1 修复：快照+patch 合并+升级报告+pending 护栏+失败兜底）| 用户报 0.2.0 重大 bug（见 `docs/决策/2026-09-07-升级部署覆盖用户层修复.md`）|
| 2026-09-09 | §7 坑速查 / §3 | 新增 #13「预制 MCP 是 profile 级单例，索引目录不能跟随会话」+ CodeGraph 索引目录适配（`SSID_MCP_CG_WS`/`SSID_MCP_CG_ENABLE`）+ 升级合并升级为三方合并（同 id 子条目用户改动保留）| 用户报 CodeGraph 默认扫用户主目录（见 `docs/决策/2026-09-09-CodeGraph-MCP-默认索引目录修复.md`）|
| 2026-09-12 | §5.0（新增） | **内核升级必须同步的三个口子**：①agent preset 手工部署（仓库 + `~/.dsh` 两副本，不进归档）②`dsh-persona` 字段名跨版本会变（`text` → `prefix` required）③`shell/tsconfig.json` paths 手写清单要随内核加包补条目 | 0.1.2-rc.1 → 0.1.5-rc.2 升级实测（见 `docs/决策/2026-09-12-SSiD内核升级-0.1.5-rc.2.md`）|
| 2026-09-12 | §7 坑速查 | 新增 #14「overrides 是 YAML block mapping 不能加尾逗号」#15「内核加包打断 typecheck 且错误指向 checkout」#16「prepare-runtime 第 4.5 步把 vendor 根 README.md 当插件复制」| 同上（本次实踩）|
| 2026-09-13 | §5.0 第 0 条（新增）/ 铁律 2.1 / §5.5（新增） | **共享 checkout 是红线**：`deepseek-harness/` 同供 web 与 SSiD 作内核，切 tag／install／build 会连带崩掉运行中的 web 宿主（2026-09-13 实际事故）；隔离改走 `dsh-web-runtime/` 独立副本 + `启动-DSH-Web.bat`。另新增 §5.5「dev 源码模式要求 checkout 自身完整」：paths 映射 / 完整 install / dist 型包 `lib/` 三个条件，以及「先确认单实例锁持有者」的排查纪律 | 用户报告 web 版被连带升级后崩溃；根因与隔离方案见工作区 `AGENTS.md` 铁律 2.1 |
| 2026-09-14 | §7 坑速查 / §8 | 新增 #17「手动注入的 `<style>` 必须带 `data-plugin` 且值不等于模块 id」（裸注入会被任意模块认领、随它的一次 HMR 重载被删 → 元素在样式没、刷新才恢复；已实测复现——连续两次重载 chat-rail 后 quick-toolbar 的两个样式标签消失、`#ssid-toolbar` 规则数归零）与 #18「CDP 几何测量前先开焦点模拟」（未聚焦窗口冻结过渡时钟，曾把展开态 280px 读成 36px） | 用户报悬浮球样式反复损坏（见 `docs/决策/2026-09-14-插件样式归属与HMR连带删除.md`）|
| 2026-09-14 | §7 坑速查 | 新增 #19「第三方插件的 DOM 锚点必须按运行态实测」——better-sidebar v0.19.0 适配时按源码/README 推断的三个锚点（`data-sidebar-right-expand`、`nArs4W_toggleButton`、`toggleCluster`）实测全部不命中；#20「`createToolbar` 里的壳标志是一次性快照」——`__SSID_SHELL__` 晚于 `apply` 注入，导致 `dsh-plugin-center` 按钮在 SSiD 壳里不渲染、「壳环境恒渲染」兜底失效 | better-sidebar v0.19.x 升级适配（`dsh-quick-toolbar` 8f41e12 / SSiD ab55900）|
| 2026-09-14 | §7 坑 #2 扩充 | 补入「读含中文的 `package.json` 必须用 node」：PS 5.1 按 ANSI 解码会吞掉中文后的引号 → JSON 解析失败，且赋值表达式内的变量**保留上一轮值**，静默把别的包版本号当成本包版本（`dsh-dream-skin` 升级校验时实踩） | dsh-dream-skin 9.14.0 → 9.14.1 升级（SSiD 72b5ce0）|
| 2026-09-14 | §7 坑 #20 + 待办 #13 | #20 的「壳标志一次性快照」已修并回填修法（`dsh-quick-toolbar` 6835abb：函数化 + 复用既有补渲染轮询，未加新钩子）；待办 #13 同条收口 | 用户拍板修「壳里缺插件中心按钮」|
| 2026-09-14 | §7 坑 #21（新增） | 新增「多入口构建会把双半共享模块拆成 chunk，DSH client 加载器不认」——症状是 client 半整体静默失效（工具栏全消失、页面无报错、host 路由却照常响应），处置为 tsdown 数组配置 + vendor 整目录镜像 | quick-toolbar 收藏会话（`dsh-quick-toolbar` 8c2657e）|
| 2026-09-14 | §7 坑 #22（新增） | 新增「排查期的模拟点击别留在启动路径上」——壳的 `[sidebar-diag]` 启动 8 秒后点底栏做开合验证，用户侧表现为「SSiD 启动后下方栏自动展开」；改为纯只读快照 | 用户报障「下侧栏为啥默认展开」|
| 2026-09-14 | §7 坑 #23（新增） | 新增「原生右侧栏的 tab 图标必须是返回 ReactNode 的函数」——传 JSX 元素会被静默忽略、回落占位图标；并记下排查陷阱：工作台卡片与「开始」页是两个不同的 DOM 列表，只看其中一个会误判为已生效 | 用户报「侧栏图标尺寸颜色都不对」|
| 2026-09-15 | §7 坑 #29（新增） | 新增「皮肤插件把 token 的 alpha 绑在滑杆上」——`dsh-dream-skin` 的 `shadeTokens2` 让 `--dsw-alias-bg-base` / `--dsw-specific-sidebar-fill` 的 alpha 跟「壁纸透明度」联动，直接取用的两处（壳标题栏、插件中心 `.pc-panel`）都跟着变；两类修法 =「剥离 alpha 只取色相」与「不带 alpha 的皮肤基色 × 弹窗权重」，并记下唯一不带 alpha 的皮肤基色 `--dsh-dream-skin-composer-base` | 用户报「插件中心弹窗和壳标题栏的透明度都错误取了壁纸透明度」|
| 2026-09-15 | §7 坑 #30（新增） | 新增「升级部署的 patch 合并会把下一个顶层条目整行吞掉」——`overridden` 替换区间越界（注释块归属 + `end` 多算一行）吃掉 `- id: connection`，症状是「先 boot 失败（bad indentation）、把 YAML 调合法后插件中心 405 复发」；修复为区间钳制 + 回归用例，并记下「恢复时只补缩进不解决 405」 | 用户报 0.3.1 安装版启动失败与 405 复发（见 `docs/决策/2026-09-15-patch合并越界吞条目.md`）|
| 2026-09-15 | §7 坑 #31（新增） | 新增「MCP 条目的 `args[0]` 来自环境变量时，CLI 缺失会让整棵插件树加载失败」——启停开关只看索引目录、不看 CLI，组合出「条目启用但 `args[0]=null`」；修复 = 壳层启停判定联动 + 模板 `disabled` 兜底 + 一键恢复脚本 `shell/fix-mcp-startup.ps1`（含四轮演练验证）| 用户新机 zip 版首次启动失败（见 `docs/决策/2026-09-15-MCP条目CLI缺失拖死启动修复.md`）|
| 2026-09-15 | §7 坑 #32（新增） | 新增「部署后的完整性校验不能只验浅层路径——归档尾部才是最容易缺的那一段」——校验点 `@max-null/dsh-memory` 位于归档 82% 处、codegraph CLI 在 97% 处，中断解压能通过校验并留下尾部缺失的环境；修复 = 校验改为清单式四项 + `verify-release` 补 codegraph | 用户新机 zip 版首次启动失败的上游成因（见 `docs/决策/2026-09-15-部署校验清单化与codegraph缺失.md`）|
| 2026-09-17 | §4 第 6 条 / §7 坑 #33 #34（新增） | **#33**「profile 的插件 pin 改完，重启不会自动安装」——首启判据 `profileReady()` 只看内核实体（`main.mjs:304`），必须手动把新版本装进 profile；**纯 JS 插件不必停机**（`pnpm install --lockfile-only` 重算 lock + tarball 解包覆盖实体，实测让 pin/lock/node_modules 三者对齐），「install 必须停机」只对含原生模块的整体重装成立。同批实测：手工同步进 profile 的构建产物恰与 npm 正式版**逐字节一致**（`dist/engine.js` 同 MD5），「手工同步过的是不是正式版」值得实测再下结论。**§4 补第 6 条**：插件在 web profile 也装时，pin 是**三处**（`profiles/ssid` + `profiles/web` + `profile-template`）。**#34**「工作区登记没有自愈能力」——`WorkspaceRegistry.bootstrap()` 只在 `global.initialized === false` 时跑一次（`packages/workspace/workspace/src/index.ts:127-130`），多实例覆盖丢掉登记后永久缺失；新增 `shell/scripts/heal-workspace-registry.mjs` 手动对账（默认 dry-run、`--apply` 才写并备份），**已实跑补入 165 条**（WorkStation 29→120、profiles-ssid 13→58、profiles-web 3→12、台本 1→9、deepseek-harness 42→43、新建 `seek-soul-in-darkness\shell` 工作区 11；首报 174，差的 9 条是同一会话躺在两个会话根导致的重复，已按 id 去重）；**运行中写回可行**（该文件只在工作区变动时才写，写回到重启之间不新建/移动会话即可），重启后登记原样保留、SSiD 正常启动——`validateStoredState` 在启动路径上，写坏了起不来；脚本另带写回前自检，`workspaceIds` 与条目不一致即拒绝写。另记排查纪律——**会话目录名带不带 `session-` 前缀不一致，认 header 里的 `id`** | dsh-memory 0.7.1→0.7.2 发版与多实例排查（`max-null-plugins/dsh-memory/docs/决策/2026-09-17-多实例写入协调.md`、`docs/排查/2026-09-17-多实例共用storages.md`）|
| 2026-09-18 | §7 坑 #34（补三条排查纪律） | 实跑与重启复验后补齐三条纪律：①会话目录名前缀不一致 → 认 header 的 `id`；②**日志文件名有两种**（`session.jsonl.zstd` / **v3 起 `session.v3.jsonl.zstd`**），只认前者漏掉 52 个会话、少补 33 条；③**登记 id 必须带 `session-` 前缀**（DSH 内部统一 `session-<uuid>`，可见性过滤逐字比较；v3 header 自带前缀而旧格式是裸 uuid）——第一版脚本去前缀，补入的 198 条里 **214 处 id 在侧栏不可见**（WorkStation 显示 8 条而非 145 条，且不报错）。同日的 0.7.3 发版复用「不停机装插件实体」那条链 | 用户报「侧栏分组与会话数对不上」并附截图；见 `docs/决策/2026-09-17-工作区登记对账.md` |
| 2026-09-17 | §10 定位（新增两条） | 新增内置插件 **`dsh-ssid-env`**（运行环境自述：让模型知道自己在 SSiD 而非裸 DSH web，判据可复核、非 SSiD 时沉默）+ 定下**分合判断**（一个适配面一个插件，不合并——合并能省的成本已被 manifest + `sync:vendor` + `check-vendor-sync` 吸收，代价却无法自动化）；同时指出 SSiD 启动路径**没有 patch watcher**，改 profile patch 或加插件都必须重启 | 用户要求「让模型直接知道当前不是裸 DSH web」；分合讨论见 `docs/决策/2026-09-17-内置插件分合与运行环境自述.md` |
| 2026-09-18 | §7 坑 #35（新增） | 新增「**配置写了不等于会生效**——在 `disabled: true` 的条目上写配置永远不加载」：判据只有 `dsh --profile <p> --dump-config`（看有没有被 `patched by ...` 标注、有没有躺在 `disabled` 下面）；**YAML 合法 + 字段名对 + 取值在合法域，三条都成立也证明不了会加载**。同条记下：压缩阈值这类参数实际由 **agent preset** 决定，`agent-presets.default` 只管**新建会话** | `docs/排查/2026-09-18-长会话输出退化.md` §五（处置部分的三层结构与判据） |
| 2026-09-18 | §3（新增 `SSID_PROFILE_NAME`） | **profile 名参数化**：profile 目录与隔离会话根都从 `shell/lib/profile-name.mjs` 派生（默认 `ssid`，与历史路径逐字一致），并行实例各有各的 profile 与 `sessions-<名>`；同条记下隔离三件套的完整用法与「无 GUI 冒烟」先行验证法 | 用户提议「profile 放 `profiles/ssid-dev`」→ 查证壳里 profile 名写死（`kernel.ts` / `main.mjs`），遂参数化（见 `docs/决策/2026-09-18-profile名参数化.md`） |
| 2026-09-18 | §7 坑 #36（新增） | 新增「**「vendor 四份逐文件一致」在 Windows 上必须对行尾码免疫**」：`check-vendor-sync` 按字节算指纹，而源/模板是 git 检出（CRLF）、profile 里的实体由 **pnpm 物化**（LF）——门稳定报 6 处「内容漂移」而四份内容全等，且每轮 `pnpm install` 都会把它造回来，属**结构性不可维持**的假信号。指纹改为只对可解码 UTF-8 文本归一 CRLF/孤立 CR（二进制逐字节），并补 `scripts/check-vendor-sync.spec.mjs` 四条自测；同批把 dev profile 的 `dsh-context` 0.53.1 拉平到 0.53.3 | v0.3.3 发版前置核查（用户要求「确认插件是否最新、SSiD 端修改是否都处理好了」） |
| 2026-09-21 | §7 坑 #37（新增） | 新增「**读者要据此挑动作时，「差异」的方向不是修饰、是判据本身**」——`check-profile-sync` 判定 3（同名不同版）原只报「声明不同」，而 B 落后于 A 是可预期的稳态、**B 超前于 A** 才是坑（部署会被归档包覆盖，必须补进 template）；不分方向会把读者推向 `pnpm install`，对后者**恰是错的**（静默降回、抹掉必须保住的声明）。处置 = 判定 3 引入 `compareVersions`（复用 `lib/profile-merge.mjs` 既有语义，`file:`/`git:` 等非 semver 退回中性文案）；同条记下验证纪律——**超前那一支必须用临时 `DSH_HOME` 造例**，真实 profile 只会给出落后 | 用户提议「升级 skill 和门」→ 查证发现该文件开头第 11 行的方向区分要求只落到了判定 2 |
| 2026-09-21 | §3（新增「壳侧配置文件」小节）/ §7 坑 #38（新增） | 新增**执行期间保持系统不唤醒**（`powerSaveBlocker('prevent-display-sleep')` + 现成的 `turn/start`/`turn/end` 事件：任意 `reasonKind` 都释放、并发计数、结束后留 60s 尾巴、内核退出兜底、遮罩持有正交）与**执行中遮罩**（只盖思灵窗口、托盘 + 全局快捷键双入口、遮罩上长按 2 秒解除以防随手点掉、开遮罩自动保活、文案可配）。判据陷阱记入坑 #38：保活与完成通知共用同一批事件但语义相反（**触发** vs **释放**），照抄通知的 `completed` 判定会让出错或手动停止之后永不释放。状态机抽到 `shell/lib/keep-awake.mjs` + `tests/keep-awake.spec.mjs` 九条单测（并发、尾巴撤换、多余 end、配置关闭）。**同批实测**：`Control+Alt+L` / `Control+Shift+L` / `Control+Shift+F12` 在本机均已被别的程序占用，默认快捷键取实测空闲的 `Control+Alt+M`；`applyGlobalHotkeys()` 收编为唯一注册入口（`unregisterAll()` 是全局动作），`mask` 嵌套配置按层合并 | 用户提出「有会话进行时保持电脑不息屏」+「设置了目标去吃饭时希望跑完而不是睡眠」+「点击后出现遮罩显示『程序执行中，勿动』，文案可自定义」 |
| 2026-09-21 | §3（新增 `mask.alpha` / `mask.blur`）/ §7 坑 #39（新增） | **执行中遮罩改为注入 DSH 页面实现**：初版独立窗口无论怎么调都做不出毛玻璃——Windows acrylic 的不透明度与半径被 DWM 定死（只剩均匀浅灰、连「有东西在动」都看不出），透明窗口 + 页面 `backdrop-filter` 又取不到窗口背后的 backdrop，三条路逐一实测（详见坑 #39）。改为注入页面内的全屏层后，同页面 backdrop-filter 半径完全可控，`alpha`（越小越透）与 `blur`（越大越糊）两个旋钮进 `notify.json`，默认 0.12 / 10px = 「布局轮廓看得出来、一个字读不出」。代价：遮罩依附页面（`dom-ready` 按状态补注）、解除信号改走 `console-message` 回传（主视图页无 preload，拿不到 `ipcRenderer`）；`mask.html` / `mask-preload.cjs` 随之删除 | 用户「不用全黑，做成个毛玻璃吧，这样还能隐约看到会话在进行」→ 三轮目视调参（「透明度拉高，模糊度高一点」→「模糊度降一降，透明度再高一点」）|
| 2026-09-21 | §3（补设置页入口）/ 插件 `dsh-ssid-panels` | **保活与遮罩进设置页**：设置 → 关于 SSiD → 「通知设置」区新增 6 行——保持唤醒开关、结束后的保持时长、遮罩文案、遮罩快捷键、遮罩观感（`alpha / blur`）；host 半 `notify.set` 改为**逐字段合并**（只提交改动项即可，`alpha` 夹 `[0,1]`、`blur` 夹 `[0,64]`），`NOTIFY_DEFAULTS` 与壳侧逐字对齐（两边读同一份文件，默认值与嵌套合并语义必须一致）。输入框抽了 `DraftInput`——受控 + 本地草稿，因为 `defaultValue` 只在挂载时取值，服务端回写后输入框会停在旧值；编辑期间不接受外部值，否则正在输入时会被一次回写覆盖 | 用户「我怎么做设置呢？这个得有个开关，和编辑文字的地方吧？」 |
| 2026-09-21 | §3（新增 `mask.passcode`）/ 壳 + 插件 | **遮罩解除口令**（用户选「三个入口都走它」）：留空 = 不设防（长按 2 秒直接解除，向后兼容）；非空时**托盘项、全局快捷键、长按按钮都只把口令输入框调出来**，比对通过才解除——只给按钮加口令是没用的，托盘一点就开了。设置页同区加「解除口令」输入框。实现上两处要点：① 密钥在注入脚本里被写成常量、页面对比后照旧用 `console.log('__SSID_MASK_RELEASE__')` 回传（不新增通道）；② 遮罩上那条 keydown 拦截必须**放行输入框**，否则口令根本打不进去。**它不是安全边界**——明文存 notify.json，能读文件的人就能读到；挡的是「知道要长按但不愿翻配置」的人，逃生通道就是改文件删掉它 | 用户「我们要不要设置密码？」→ 拆解威胁模型后给出三选项，用户选「加口令，三个入口都走它」 |
| 2026-09-21 | §9 截图规范第 5 条 | 豁免的「当前适用」补入 **dsh-tone-layer**、**dsh-allostasis**——两个纯提示注入类插件此前已在用豁免写法（README 引用 §9 并注明无界面元素），但没登记进清单；同条把 2026-08-30 的缺口快照标注为历史（该批已于 09-12 补齐，旧快照与待办表互相矛盾） | dsh-allostasis 发布前核对截图要求，用户裁决「接受这个豁免理由」 |
| 2026-09-23 | 铁律 9 / §9 配套 5 | **澄清 git 归属**：`npm publish` 由用户手动（原规矩不变）；**`git` 提交 / 打标 / push 归开发会话**。同日早些时候曾把它读反——用户的一句**反问**「发git也交给我啊」被当成「git 也归用户」的指令，于是写成「整个发版动作都由用户手动」、还从自己的工作清单里删掉了 git 步骤。教训是**纯文本读不出语气**：那是质问「你怎么把 git 也推给我」，不是分派。现已改回 | 用户澄清（2026-09-23）：「是反问，我的问题，我忘了你感受不到语气」 |

| 2026-09-21 | §7 坑 #40（新增）/ `check-profile-sync` 判定 6 / 决策记录补记 | **dev 不部署 ⇒ 模板的 patch 改动到不了运行时**：`6ef7dea`（Playwright 拆无头/有头两条目 + CLI 缺失护栏）只落到模板与**另一台机器**的 profile，本开发机运行时隔天仍是单条 `mcp-playwright` 且无护栏——凭印象发现，不是门报出来的。已手工同步（双条目 + 护栏 + 清掉一行被 YAML 并进 `insert` 块的历史残骸 `inject`），本机实测：并发探针用配置里的确切 args 各起一个真实 MCP，**新配置 2/2 通过、旧配置对照 1/2 失败**（复现冲突）。`check-profile-sync` 补**判定 6**（模板有的条目 id 运行时缺了要报；同 id 条目模板带 `disabled` 而运行时不带更要报——那是会让内核起不来的护栏），两条判据都用临时 `DSH_HOME` 造例反向验证过 | 用户「ssid 从远端拉取的代码应该是修改了内置 playwright mcp，拆成了有头无头两个，你看一下吧」→「这个 6ef7dea 提交不是在开发环境做的，所以很粗糙」 |

| 2026-09-21 | §7 坑 #41（新增）/ `ssid-release` skill 两条 | **发版回填 notes 别把哈希同步进包内**：v0.4.0 收尾时差点踩——包内那份 update notes 必须停在发版前那一版，因为安装包 SHA256 取决于内嵌归档、归档里又装着更新日志，写进去会**再次改变**哈希（v0.3.2 起的既有约定，但只写在各版 notes 里）。skill 原先把「归档 notes 是快照」与「改完 notes 要重走同步链」并排列出，两条各自都对、**连起来读却推向反方向**；已给两条补上适用时点（发包前走同步链，发包后回填只改 docs 与 Release 页）。同源的还有坑 #37——规则写在列表/注释里，不会自动扩散到相邻那条 | v0.4.0 发版收尾（已发布） |
| 2026-09-22 | §7 坑 #42 #43（新增） | **#42 往 profile 装第三方插件时，`link:` 指向的目录必须能沿真实路径向上找到 `node_modules`**——MerZlin 桌宠的 `install_bridge()` 把插件实体指向桌宠自己的安装目录，那条链路上没有 `node_modules`，Node 解析 `@deepseek-ai/dsh-llm` 失败 → 插件树加载失败、**内核起不来**、白屏「思灵启动失败」；处置 = 在插件实体目录建 `node_modules` junction，或把实体放进 profile 的 `vendor/`。两个误导点记牢：壳的「设置 `DSH_CHECKOUT`」提示是**通用兜底文案**、与本案无关；「link 建好了」不等于「能解析」，必须实测 import 能列出 exports。**#43 长期存活的外部程序不能用会话内 `Start-Process` 拉起**——DSH 的 local process-tree provider 会在内核重启时清理整棵进程树，父进程为会话内 `pwsh` 的进程会被一起收走，表现为「日志停在那一刻、无任何错误痕迹」，极易误判成程序自身崩溃；处置 = WMI / `explorer` 代理 / 计划任务 / 让用户双击。两条都不限于桌宠：前者适用于一切第三方插件装配，后者适用于一切需活过内核重启的外部程序 | 桌面宠物选型调查（用户报「思灵启动失败」与「桌宠莫名退出」；见 `docs/决策/2026-09-22-桌面宠物选型与自研评估.md` §7） |

| 2026-09-23 | §7 坑 #44（新增） | **文档里写裸的双左花括号会让 GitHub Pages 构建失败或静默吞内容**：本仓库 Pages 是 `legacy` 模式、从仓库根跑 Jekyll，所有 `.md` / `.html` 都过一遍 Liquid；**未闭合**即整个构建失败（本次被一篇新落的调研文档打红），**成对闭合**则不报错但静默渲染成空（另一处引官方 persona 原句的决策记录一直在被吞）。写法改用 `<code>&#123;&#123;</code>`；**行内代码里放 HTML 实体无效**，必须换成 `<code>` 标签。**这条坑与 dsh-memory 0.11.1 修的是同一个字形的两种宿主**（DSH 严格插值 → Liquid），结论一致：往渲染链里放可写文本就必须在出口中和 | 用户邮件报告 Pages 构建失败（run `35774788193`） |

| 2026-09-26 | §7 坑 #45 #46（新增）/ §8 | **fork 壳补齐四项缺口并实机验证**：① **截图服务跨进程接线**——此前后端 `/api/ssid/screenshot/get` 返回 `shellAvailable:false`、设置卡两行被 `return null`，看着像「设置项没了」；② **保活 keep-awake 跨进程接线**（`turn/start`/`turn/end` 在 Host 子进程、`powerSaveBlocker` 在主进程）；③ **预制 MCP 两半成对落地**（profile patch 条目 + 壳注入 env，只补一半等于没补）；④ **CodeGraph 索引目录适配**（移植时修掉「写死 `session.jsonl.zstd`」——dev 的会话是 `session.v4.jsonl.zstd`，探测恒失败、误弹首次引导窗）。**结论：`profile-merge` 不移植**（坑 #46）——前提在 fork 下不存在。**顺带发现一个真缺口**：fork 的打包链不带 profile 归档，新装机如何得到思灵的插件集尚无答案，需单独立项，不要当成这项的一部分做掉。四项均在 dev 壳取到实机证据（含进程、日志、模型回话三类），详见 `ssid-shell-fork/SSID-CHANGES.md` 改动 25–28 | 用户拍板「直接定为目标将这些问题全都处理」|

| 2026-09-26 | §7 坑 #47（新增）/ 变更记录外 | **思灵插件集交付链定形为 A′ 并落地壳侧**：fork 的打包链不带自建壳的 `dsh-runtime.tar.gz`，新装机拿不到插件集。先用四组对照实验**证伪**「放进随包闭包就行」——`resolveBundleDir` 的「安装锚点优先」**只覆盖 bundle 的 patch 文件**，插件本体与 client 半走运行时解析表（installAnchor 的**依赖图 BFS** + profile scope），而 installAnchor 是官方 npm 包，其依赖图里不会有 `@max-null/*`；实测把实体只放锚点、或只放 installAnchor 的解析链上，都是**静默不加载**（应用照常启动、`Failed to load plugins` 一次都不出现，只有渲染进程的 client 清单少一行）。**A′ = 实体随包一份 + profile 里放目录链接**，落在既有的 `RuntimeResolution.linkedRoots` 通道上。壳侧 `apps/desktop/src/ssid/profile-seed.ts` 已落地（幂等、用户优先、`link:` 声明防 pnpm 覆盖）。**实机**：全新 `DSH_HOME` 首启 `linked=30 kept=0 missing=0 bundlesAdded=30`，client 清单与 dev 基线**逐项相同**；第二次启动 `linked=0 kept=30`、`package.json` 哈希**逐字节未变**。同轮修掉一个自己埋的缺陷（见坑 #47）。**待做**：打包链（插件集进 `extraResources`）属发版链改动，需拍板 | 用户选定 A 交付形态并授权推进（A′ 是 A 的修正：原描述把 bundle 解析误当成了插件解析）|

| 2026-09-26 | §7 坑 #48 #49 #50（新增）/ 变更记录外 | **随包插件集（A′）落地**：`prepare-ssid-plugins.ts` 从发版基准产出 `32 bundles / 584 packages`（含 7 个不发 npm 的 vendor 包、MCP CLI 与 codegraph 引擎），首启由 `profile-seed.ts` 建 584 个目录链接、补 `dsh.profile.bundles`、写 `link:` 声明（幂等、用户层优先）。**三次崩溃逼出三个真问题**：① 包**必须放 `node_modules/` 下** —— 平铺会让传递依赖解析失败、插件树静默不加载（撞上坑 #42 同一条教训）；② 插件集**不能带内核包** —— 会盖掉安装锚点那份，内核自己的 26 个插件 `failed to import`；③ **不能把内核版本号套到所有 `@deepseek-ai/*`**（版本线不统一，见坑 #49）。修完 `pending` 从 3 降到 1，**MCP CLI 交付打通**（`playwright=true codegraph=true`，此前一直是 false）。**剩余 1 个是内容问题**（坑 #48：同名同版本不同内容）—— 根因是**发版基准落后于 dev 已验证状态**（vendor 7 vs 21 个包、13 个 `@max-null/*` 在 template 用 npm 版本），**回填清单已列**）→ 当日试做回填：复验**确实通过**（零崩溃零 pending），但 `check:rules` 三门报红，查清**形态错了** —— 发版基准的正规声明是「**不发 npm 的包**用 `file:./vendor/…`、**发 npm 的包用版本号**」（对照安装版运行时 profile 的 69 条声明），而我把 13 个发 npm 的包也改成了 `file:`，那是 dev profile 的手工形态；`plugin-peers` 另报 template 的目标内核仍是 **0.1.5-rc.2** 而 vendor 是给 0.1.7 编的。**已整目录回退**（备份 `.ssid-build/template-backup-20260926-225631/`；`git diff shell/profile-template` 只剩一行既有改动），`plugin-peers` 随即转绿。**正确路径待拍板**：这类包的 npm 版本是**旧适配**（要 0.1.5 的 `settingsScope`）、dev vendor 里的新适配**还没发布** → 需要 `npm publish`（F2A，用户手动）后再提 template 的版本号 | 用户选定 A 后授权推进打包链（template 回填是我判断可做、做错后已如实回退）|

## 工作区规范（布局 + 放置规则，2026-08-29 整理定稿）

### 布局（H:\MaxNull\WorkStation）

```
H:\MaxNull\WorkStation\
├── deepseek-harness                     ← DSH 官方库（upstream deepseek-ai；只引用不改）
├── seek-soul-in-darkness                ← SSiD 壳库（本手册主体）
├── max-null-plugins/                    ← ★插件全家桶★ SSiD 全家桶插件源码（每个插件一个独立 git 仓库 + README）
├── third-party-plugins/                 ← 预制/学习用第三方插件源码（含 fork，+ README 状态标注）
├── references/                          ← 参考项目与学习对象（上游项目/别家实现）
├── old-project/                         ← 旧项目归档（被替代/停更，可随时恢复）
├── awesome-dsh-plugin-pr                ← 插件市场项目（与 SSiD 同级的生态项目）
├── doc-edit                             ← 办公文档加工区（简历/PPT 等）
├── test                                 ← 测试区
└── .dsh / .playwright-mcp               ← 工作区记忆存储（隐藏）/ Playwright 数据
```

### 放置规则（新增东西放哪里 —— 判定流程）

| 新东西是什么 | 放哪 |
|---|---|
| **自制插件**（作者=Max-Null，含开发中） | `max-null-plugins/`（=「插件全家桶」，用户口头指代此处） |
| **第三方插件源码/fork**（非 Max-Null 原作，SSiD 预制或观察用） | `third-party-plugins/`（README 里标注「预制/研究对象」） |
| **参考项目/学习对象**（上游项目、别家实现、借鉴源码） | `references/` |
| **旧项目**（停更/被替代） | `old-project/` |
| **SSiD 生态同级项目**（如插件市场） | 顶层直挂（与 deepseek-harness、seek-soul-in-darkness 平级） |
| **办公文档** | `doc-edit/` |
| **DSH 官方内核相关** | 只用 `deepseek-harness`（不复制不 fork 到工作区别处） |

### 硬性约定

1. **每个目录保持独立 git 仓库**：移动=整目录搬移（git 元数据随迁）；不拆分/合并仓库。
2. **目录名 = 仓库名**（保持 git 仓库原名，不改名换皮）。
3. **每个分类目录维护 README**：新增成员必须更新该目录 README（名称/包名/版本/状态），删除成员同步移除。
4. **禁止**：顶层散落文件（归档到对应项目/doc-edit）；vendor 备份目录（`.bak-*` 放 profile 内或库外，防止进发版归档）。
5. **弃用**：本地删除即可（远端 GitHub 保留）；恢复用 `git clone` 拉回原位置。

> 注：`deepseek-harness-fork`（DSH 原生记忆官方化分支 feat/native-cross-session-memory）已于
> 2026-08-30 移除——官方不接受 PR（仅建议渠道），开发提交已归档至
> `https://github.com/Max-Null/deepseek-harness` 的 feat 分支。

## 开发环境与测试流转（三套 DSH 环境）

| 环境 | 位置 | 角色 |
|---|---|---|
| **DSH web 端**（原生 DSH） | 工作区 `deepseek-harness`（`bin.ts web`，3080；opencode 启动器管理） | 原生主环境：插件开发、生态演进验证 |
| **SSiD 开发环境** | 工作区 `seek-soul-in-darkness`（`shell` dev 裸跑） | **测试/操作副手**：验证他端变更，重启无痛 |
| **SSiD 安装版** | 工作区外（已安装的 NSIS 版） | 正式环境：发版验证/用户使用；变更只走发版流程 |

**核心原则——「医者不能自医」的推广：升级/测试谁，就用另一半操作**（被操作方重启/变更不影响操作者）：

1. **插件开发（在 web 端）**：开发完 → 用 **SSiD dev 测试**（web 端不重启；web 端自测会重启自身，医者不能自医）。
2. **DSH 大版本升级（web 端本体）**：由 **SSiD 开发环境操作**（第 1 阶段：SSiD 会话升级 web DSH + 插件适配测试）。
3. **SSiD 升级（回灌）**：web 端已达标后，由 **web 端会话操作**（第 2 阶段，2026-08-29 实测执行）。
4. **SSiD 安装版**：不做任何开发流变更；新版本通过发版流程（归档重建 → NSIS）到达。
5. **重启授权与防自杀（2026-08-30 用户拍板）**：开发会话**可自行重启 SSiD dev 自测**（不必等用户安排）；但**重启任何 DSH 前先判断当前会话宿主**——当前会话在 **web（3080）时禁止启停 web 实例**（宿主=自杀）；SSiD dev/安装版验证对象可操作。**npm 发版**已启用 F2A 验证：**`npm publish` 由用户手动执行**，开发会话只给出指令（包名/版本/发布顺序/回滚预案）；**`git` 提交 / 打标 / push 是开发会话的活**，照常做，不推给用户。

### 验证留痕（L2 证据链，2026-08-30）

L1 由测试留痕；**L2 环境实测必须留痕**（此前全凭口头确认，不可追溯）：

- **L2 checklist（一次实测）**：① 挂载点正确（按钮/面板出现位置）② 开关往返各一遍（无 no patch row）③ console 0 error ④ 实体版本 = 目标 ⑤ **顺手截图**（`docs/shots/`，README 用）⑥ 记一行（插件 release notes 或 `docs/验证记录.md`：日期/环境/结果/截图）。
- **追溯规则**：一次升级/适配 = 一份 L2 记录（进 release notes 即可）；未留痕视为未验证。

> 注意：web 端（3080）由 opencode 启动器管理（其生命周期/重启不在开发流控制内）；SSiD dev 的启动/关闭由用户手动执行，开发会话侧不启停任何 DSH 实例。

## 0. 快速开始（开发模式跑起来）

```powershell
# 前置：Node ≥22.13、pnpm 11.x、shell 目录已 npm install
cd H:\MaxNull\WorkStation\seek-soul-in-darkness\shell
npm start                # electron .（dev 裸跑，app.isPackaged=false）
```

- dev 裸跑 **不部署归档**（`devSkipDeploy`），启动即 boot；boot 日志在 `~/.ssid/ssid.log`。
- 无 electron 的内核冒烟验证：`npm run smoke`（`node --import tsx/esm boot-smoke.ts`）。

## 1. 架构与目录

```
seek-soul-in-darkness/
├── shell/                    # Electron 壳（main.mjs 主入口）
│   ├── kernel.ts             # DSH 内核启动（bootKernel；bundle 形态= kernel.bundle.mjs）
│   ├── main.mjs              # 窗口/BrowserView/托盘/IPC/归档部署（ensureProfile）
│   ├── titlebar.html/js      # 自绘标题栏（按钮组 → ssid:title:action IPC）
│   ├── prepare-runtime.mjs   # 归档构建（scripts/）：模板→pnpm install→tar → dsh-runtime.tar.gz
│   ├── profile-template/     # ★发版基准★：package.json(插件声明)/vendor/ 出厂技能
│   └── dsh-runtime.tar.gz    # 内置内核闭包（安装版部署源，~204MB @0.1.2-alpha.1）
├── plugins/                  # SSiD 自研插件源码（dsh-ssid-panels / dsh-ssid-zh-ui）
└── docs/决策/                # 执行记录与决策文档
```

- **插件同步链**：`plugins/<pkg>/`（源头，与 vendor 全等）→ 同步三处 vendor：`~/.dsh/profiles/{web,ssid}/vendor/<pkg>` + `shell/profile-template/vendor/<pkg>`（四份逐文件指纹一致是硬性要求，比对面按包声明；发版归档自动带模板 vendor）。dsh-quick-toolbar 是例外：源头在上游仓库、vendor 为精简副本，见 §10。
- **内核来源回退链**（`kernel.ts resolveDshRuntime` + `bootKernel`）：打包版强制闭包（preferBundled）→ dev：`DSH_CHECKOUT` 显式 → **并列源码 `../../deepseek-harness`** → 关闭时 profile `node_modules/@deepseek-ai/dsh`（部署锚点）优先于源码。
- **DSH 双实例**：DSH web 端（3080，opencode 启动器管理）与 SSiD 是不同类型（浏览器 web 进程 vs Electron 壳）；共享 `~/.dsh` 与源码 checkout——**验证 SSiD 时由用户手动启动/关闭；不要启停 web 实例**（opencode 管理其生命周期，轮换会让 web 会话工具调用显示 interrupted）。

## 2. 运行模式

| 维度 | dev 裸跑（开发/自测） | 安装版（正式） |
|---|---|---|
| 判定 | `app.isPackaged=false`（electron .） | NSIS 安装（app.isPackaged=true） |
| 归档 | 默认跳过部署（`devSkipDeploy`）；版本不一致时设 `SSID_DEV_DEPLOY=1` 强制部署（发版预演用） | 首启/升级自动部署（`.runtime-version` 对比驱动） |
| 内核 | 闭包锚点存在→闭包；否则并列源码（dev 常用） | 强制闭包 |
| 场景 | 改 kernel.ts/main.mjs/插件后即时验证 | 发版验证/用户使用 |

**发版预演**（常被误解为"dev 也要解压"）：`SSID_DEV_DEPLOY=1` 仅用于验证"归档部署→闭包 boot"这条安装版链路；日常 dev **不设**（秒级启动，无解压）。

### 归档时机 —— dev 热更新，发版才归档（2026-08-30 定稿）

- **dev 开发 = 热更新，绝不归档**：
  - 改壳代码（`main.mjs`/`kernel.ts`）→ 重启 dev 即生效（dev 直接加载源码）；
  - 改插件（vendor/plugins 源码）→ **同步运行时实体**（`node_modules/@max-null/<pkg>` 为 file: 拷贝物化，需手动拷贝或 `pnpm install`）→ 重启即生效；
  - 改内核源码（deepseek-harness）→ 源码模式（无锚点/DSH_CHECKOUT）直接生效。
- **只有 SSiD 版本收尾（发版）才统一归档**：`prepare-runtime.mjs` 重建 → 部署预演一次 → NSIS 打包。
- **三个原因**：
  1. 归档是**压缩**（安装包体积设计：204MB 归档 / 890MB 解压；安装版部署使用）；
  2. **命令行操作、慢、无进度可视化**（重建 2-5 分钟 + 部署解压更久，不便开发节奏）；
  3. 归档从 **`profile-template`（发版基准）** 构建——**反复归档会把 dev 中热更新的插件/配置整体回滚**（2026-08-29 实测：模板未同步时部署把 dsh-session-manager 等打回旧版）。**dev 改动 ≠ 归档内容**；要进归档的改动必须先同步模板（§4 双处声明）。

## 3. 环境变量与开关（shell 侧）

| 变量 | 作用 | 场景 |
|---|---|---|
| `SSID_DEV_DEPLOY=1` | 强制 dev 也部署归档（版本不一致时） | 发版预演（一次性） |
| `SSID_REGISTRY=http://127.0.0.1:4873` | prepare-runtime 闭包 install 用的 registry（写入闭包 .npmrc） | 本地发布（内核未上 npm）时构建；不设=官方源 |
| `SSID_LOG_FILE` | 覆盖日志路径（默认 `~/.ssid/ssid.log`） | 诊断 |
| `DSH_CHECKOUT` | 显式指定内核源码 | **用完即删**（pitfalls #5 幽灵依赖：User 级残留会劫持运行时） |
| `SSID_MCP_NODE`/`SSID_MCP_PW_CLI` | 预制 Playwright MCP 运行时 | main.mjs 自动注入；smoke 裸跑需手动设（否则 mcp 行 args 为 null 启动失败） |
| `SSID_MCP_CG_CLI`/`SSID_MCP_CG_WS`/`SSID_MCP_CG_ENABLE` | 预制 CodeGraph MCP：cli 路径 / 索引目录 / 是否启用 | main.mjs 自动解析注入（优先级：env → `~/.ssid/codegraph.json` → 最近会话探测 → 停用）；smoke 裸跑同样需手动设 `SSID_MCP_CG_CLI` |
| `DSH_HOME` | DSH 家目录（默认 `~/.dsh`） | 换机/测试隔离 |
| `SSID_PROFILE_NAME` | profile 名（默认 `ssid`）：同时决定 `$DSH_HOME/profiles/<名>` 与隔离会话根 `sessions-<名>` | 并行开隔离实例；非法值（含路径分隔符、或为 `.`/`..`/`node_modules`）启动即报错 |

**并行开第二个实例（隔离三件套，2026-09-13 首验 / 2026-09-18 参数化）**：`--user-data-dir=<独立目录>`（独立单实例锁）+ `DSH_HOME=<独立目录>`（独立 profile、storages、会话根）+ `SSID_LOG_FILE=<独立文件>`（独立日志），与运行中的实例零冲突。profile 目录用 junction 指回真实的那份即可零拷贝共用插件实体（`node_modules` 一个 junction 就够，配置文件拷副本，写入因此落副本）。`SSID_PROFILE_NAME` 让"第二个实例"有自己的名字与自己的会话根，不必再借用 `ssid`。

**无 GUI 的先行验证**：`DSH_HOME=<隔离> SSID_PROFILE_NAME=<名> npm run smoke`——不起 Electron、不占单实例锁，隔离 home 里会落下 `profiles/<名>`、`storages/`，而真实环境分毫不动（实测见 `docs/决策/2026-09-18-profile名参数化.md`）。

### 壳侧配置文件（`~/.ssid/*.json`）

| 文件 | 键（默认值） | 作用 |
|---|---|---|
| `notify.json` | `enabled`(true) / `replyDone` / `question` / `approval` | 窗口失焦时的 Windows 通知与音效；**文件不存在 = 全开** |
| 同上 | `keepAwake`(true) / `keepAwakeTailMs`(60000) | 执行期间保持系统不睡眠、屏幕不息（判据陷阱见 §7 坑 #38）。尾巴 = 「一轮结束之后仍保持多久」，用来覆盖目标模式的轮次空隙——没有它，连续轮次会在缝隙里释放又立刻重开 |
| 同上 | `mask.text`（「程序执行中，勿动」）/ `mask.hotkey`(`Control+Alt+M`) | 执行中遮罩的文案与切换快捷键。**快捷键改完要重启壳**（只在启动时注册一次）；文案与浓度下次开启即生效 |
| 同上 | `mask.alpha`(0.12) / `mask.blur`(10) | 遮罩的浓度与模糊半径：`alpha` 越小越透（看得见底下的动静），`blur` 越大越糊（越读不出内容）。默认值 = 「布局轮廓看得出来、一个字读不出」。文案自带**一圈黑晕**（白字 + 多层 `text-shadow`），亮背景靠这圈晕抠出轮廓、暗背景靠白字本身的对比，两种底色都读得清——**不要改成给文字加深色底板**：底板会挡住正中间那块内容，而「看得见动静」正是遮罩存在的意义 |
| `screenshot.json` | `hideWindow`(true) / `hotkey`(`Control+Shift+A`) | 截图引用 |

`mask` 是**嵌套对象**：读取时按「默认值 ← 用户值」逐层合并——浅合并在「用户只配了 `text`」时会把 `hotkey` 整条丢掉。

| 同上 | `mask.passcode`（空） | **解除口令**。留空 = 不设防（长按 2 秒直接解除）；非空时托盘项、全局快捷键、长按按钮**三个入口都只把口令输入框调出来**，比对通过才解除——只给按钮加口令是没用的，托盘一点就开了。**它不是安全边界**：明文存在这个文件里，能读文件的人就能读到，挡的是「知道要长按但不愿翻配置」的人。忘了口令的逃生通道就是改这个文件删掉它 |

**这些不用手写 JSON**：设置 → 关于 SSiD → 「通知设置」区（`dsh-ssid-panels` 的 `NotifySettings`）里就是通知 / 保活 / 遮罩的全部开关与输入框，写入走 host 半的 `/ssid/api/notify.set`（**逐字段合并**，只提交改动的那一项；`alpha` 夹在 `[0,1]`、`blur` 夹在 `[0,64]`）。手写文件同样有效——壳与插件读的是同一份，**两边的默认值与嵌套合并语义必须逐字一致**，否则设置页显示的值会和壳实际用的值分叉。

**全局快捷键集中注册**：`applyGlobalHotkeys()` 是唯一入口。`globalShortcut.unregisterAll()` 是全局动作，各自为政会让后注册的把先注册的**静默抹掉**（保存截图设置那一步就足以让遮罩快捷键失效）。注册失败只落日志、不阻断启动——被别的软件占用是常态，本机实测 `Control+Alt+L`、`Control+Shift+L`、`Control+Shift+F12` 均已被占，默认值因此取实测空闲的 `Control+Alt+M`。

## 4. 插件升级流程（本次教训：**双处声明**）

1. **改两处**：`~/.dsh/profiles/ssid/package.json`（运行时）+ **`shell/profile-template/package.json`（发版基准！）**——只改前者，归档会退回旧插件（2026-08-29 实测：部署后 profile 被归档包版本覆盖）。
2. **JSON 写入用 node**（`writeFileSync(p, JSON.stringify(o,null,2)+'\n','utf8')`）——PowerShell 5.1 `Set-Content -Encoding UTF8` 写 BOM，`readProfileManifest` 直接崩。
3. 版本**精确 pin（无 ^）**，与 web 端声明形态一致。
4. **原生/预编译 bundle 型插件**：master 的 client 模块表演进（`dsh-client-runtime`→`dsh-client-modules`）——旧 bundle 的裸 require 会挂 → 源码型插件重建；预编译型等上游发适配版（参见测试报告：context-doctor 0.6.2-master 本地构建、dream-skin PR#42 采纳后 npm 版）。
5. 升级验证：实体校验（读 node_modules/<pkg>/package.json version 对比目标表）。
6. **npm 发版后的完整链路（2026-09-17 补，同日修正）**：改 pin → 让 profile 拿到新版本 → 重启。三处 pin 而不是两处——插件在 **web profile 也装**时（`dsh-memory` 就是），`~/.dsh/profiles/web/package.json` 同样要改，否则 web 侧停在旧版。
   **拿到新版本不必停机**（同日实测）：`pnpm install --lockfile-only`（只重算 lock、不碰 node_modules，pnpm 11.21 实测 11 秒、输出 `added 0`）+ 从 npm 拉 tarball 解包后覆盖 `profiles/*/node_modules/@max-null/<pkg>/`——运行中的 Node 不锁已加载的 `.js`，跑完 pin/lock/node_modules 三者一起对齐，以后任何 `install` 都不会退版。
   **覆盖必须「先删目录再复制」，不要用 `robocopy /MIR`**（同日踩到）：`npm pack` 把包内所有文件的 mtime 规范成 `1985-10-26 16:15:00`，而 robocopy 的跳过判据是「时间戳 + 大小」——**大小恰好与上一版相同的文件会被静默跳过**（`package.json` 在 0.7.2 与 0.7.3 都是 2305 字节，只有 version 那行不同），加 `/IS` 也无效。症状是「pin/lock 已是新版、`engine.js` 也换了，`package.json` 还写着旧版本号」这种半成品。正确做法：`Remove-Item <dst> -Recurse -Force` 后 `Copy-Item <src> <dst> -Recurse -Force`，**最后逐文件比一次哈希**收尾（30 个文件全比对才发现问题）。
   **「install 必须停机」只对含原生模块（`node-pty` 的 `.node` 被进程锁定 → EPERM）的整体重装成立**，别当通用规则套（这么套过一次，白等一个停机窗口）。`file:`/vendor 依赖是另一回事——pnpm 不感知其内容变化，必须删包重装。
   重启不会替你装（首启判据见 §7 坑 #33）。

## 5. 内核与归档升级

> **跨系列升级先看核对清单**：如 0.1.2 → 0.1.5 这类跨系列升级，先读 `docs/决策/2026-09-10-升级前置差异清单-0.1.2-rc.1到0.1.5-rc.1.md`（破坏性变更表 + 前置 checklist + 回滚要点）；同系列升级（如 alpha.2 → rc.1）套 `2026-09-06-SSiD内核升级执行指南-rc.1通用范本.md` 即可。

> **当前内核**：`0.1.5-rc.2`（2026-09-12 升，执行记录见 `docs/决策/2026-09-12-SSiD内核升级-0.1.5-rc.2.md`；归档指纹 `0.2.1-0.1.5-rc.2-d5876b8a`）。

### 5.0 内核升级必须同步的口子（2026-09-12 rc.2 升级定稿）

内核换版时，**版本号切换只是其中一步**。下面几处不在任何自动化链路上，漏了不会报「升级失败」，只会安静地坏或安静地失效：

**0. 先看第 0 条：共享 checkout 是红线（2026-09-13 事故后补，优先级高于下面各条）。**

`deepseek-harness/` **同时**是 web 版与 SSiD 的内核来源——web profile **不带内核闭包**，直接用这个 checkout。所以对它做任何变更——`git checkout <tag>`、`pnpm install`、`pnpm run build`——都会**连带影响正在运行的 web 会话宿主**（也就是用户正在用的那个界面）。

- 动之前**必须先告知用户并取得同意**。2026-09-13 的实际事故：为升级 SSiD 把该 checkout 切到 `0.1.5-rc.2` 并 rebuild，web 版被连带升级后崩溃。
- 需要独立内核**不要切主 checkout**：web 版已有独立副本 `dsh-web-runtime/`，用工作区根的 `启动-DSH-Web.bat` 启动（它设 `DSH_CHECKOUT` 指向副本）；SSiD 侧同理另建副本或 `git worktree`。
- **不要用用户级环境变量 `DSH_CHECKOUT` 做隔离**——那会同时改变 SSiD 的内核解析，更乱。隔离只走各自的启动入口。
- **降级内核不是可用选项**：DSH 会话格式已到 **v3 且无降级路径**（源码只有 v0→v1→v2→v3 迁移器），旧内核读 v3 日志会直接抛「older than the supported vN, and this build ships no upgrade path for it」，已有会话**永久打不开**。
- 改这个 checkout 的后续代价还没完：SSiD 的 **dev 源码模式**需要该 checkout 自身完整可用（见 §5.5）。

1. **agent preset 是手工部署的，仓库副本与 `~/.dsh` 读取副本要同时改。**
   `prepare-runtime.mjs` 只把 `skills/` 纳入归档与指纹，`kernel.ts` 的 `syncPresetSkills` 也只同步技能；`agentPresetsRoot` 指向的 `apps/cli/config/agent-presets` 在各版本里都只有 `examples/`（`scanRoot` 对不存在的根返回 `[]`，静默忽略）。所以 `presets/ssid-double-star/` **不进归档、不进升级流程**：
   - 仓库副本 `presets/ssid-double-star/agent.cordis.yml`（版本管理）
   - 运行时副本 `~/.dsh/.agent-presets/ssid-double-star/agent.cordis.yml`（DSH 实际读取）
   改完用 SHA256 核对两处一致。**任何 preset 字段变更漏掉其中一处 = 该处静默不生效**。
2. **`dsh-persona` 的配置字段名跨版本会变，preset 会因此挂载失败。**
   `0.1.2-rc.1` 是 `config.text`；`0.1.5-rc.1`/`rc.2` 改为 **`config.prefix`（required）** + `suffix`（默认 `''`），段名也从 `deployment:persona` 拆为 `deployment:persona-prefix`/`-suffix`。字段不对就是 `$.prefix missing required value` 硬失败。**升级后必须用新版 `dsh-persona` 实体 + 真 schemastery 校验一遍真实 preset 文件**，不要只读 release notes。
3. **`shell/tsconfig.json` 的 paths 是手写清单，内核加包就要补条目。**
   （见 §7 坑 15）本次补了 `@deepseek-ai/dsh-package-manifest`。
4. **用 `ctx.connection.rpc.handle` 注册通道的插件，会在 0.1.5 上崩（与宿主有无 webServer 无关）。**
   `client-connection` 在 0.1.5 把 inject 由 `['webServer','credentials']` 收缩为只 `['credentials']`。而 `rpc.handle` 的 owner 是 **connection 自己的 ctx**（`rpc-host.ts` 的 `get rpc()` 里 `const owner = this.ctx`），不是调用方插件的 ctx；owner 只声明了 `credentials`，于是 `owner.webServer.register(route)` 必抛 `cannot get property "webServer" without inject`。
   **注意归因**：报错说的是 connection 实例的 ctx 没有 webServer 权限，**不是**「宿主没提供 webServer」。SSiD **有** webServer（`webserver` 行在组合树里启用——实测内核端口在监听、HTTP 401；profile patch 只 insert 了 MCP，没有禁用该行）。已知没有 webServer 的宿主是 DSH 官方桌面壳（`desktop.cordis.patch.yml` 显式 `webserver: disabled: true`）；那种宿主会让 connection 的 `/api` 路由整体不挂载（走 `createSharedFetchHandler` 的另一条路）。
   判定宿主有没有 webServer：`node --import tsx/esm apps/cli/src/bin.ts --profile <名> --dump-config`，看 `webserver` 行有没有 `disabled`。
   适配写法（`dsh-pocket@2.10.6` 是范例）：插件自己 `inject: ['connection','webServer']`，优先自行把路由挂到 webServer，失败才回退 `rpc.handle`。
   **每次升内核都要扫一遍**：`grep -rn 'connection.rpc.handle\|connection.fetch.register' max-null-plugins third-party-plugins`。

> 另有一条不属于「升级口子」但每次升级都要过：**升 rc 一律精确 pin，不用 `^`**——rc 版本常只挂在 npm 的 `next` 通道上（如 `0.1.5-rc.2`），`^0.x.y` 语义下不跨 minor，会静默装回旧版。

### 5.1 dev 源码模式（日常，不等 npm）
- 移出部署锚点即可回退并列源码：`node_modules/@deepseek-ai` → `.upgrade-backup/`（回滚=移回）。
- 源码模式下 profile 声明**不包含** `@deepseek-ai/dsh*` 内核族（从 checkout 解析；web 端同构）。

### 5.2 闭包归档（正式形态）
- **内核 npm 未发布时**（如 0.1.2-alpha.1）：本地构建 + 私有 registry 链路——
  1. `git worktree add <temp> HEAD`（**用干净 HEAD**：原工作区可能有调试残留探针/未提交改动）
  2. `pnpm install && pnpm run build`（tsc + tsdown，218+ 产物）
  3. verdaccio（本地 4873）+ `pnpm -r publish --registry=http://127.0.0.1:4873 --no-git-checks`（`pnpm publish` 自动把 `workspace:*` 转版本号；private 包自动跳过）
  4. `SSID_REGISTRY=http://127.0.0.1:4873 node scripts/prepare-runtime.mjs`（DSH_VERSION 自动读 DSH_CHECKOUT=deepseek-harness）
- **MISSING_PEERS 维护**（`prepare-runtime.mjs`）：master 把若干服务定义包改成了 **peer-only**（全树无 dependencies 提供者；`autoInstallPeers=false` 不自动装）：`dsh-settings`/`dsh-attachment`/`dsh-brand`/`dsh-credentials`/`dsh-jobs`/`dsh-session-persistence`/`dsh-session-query` + 20 个官方 core peer。**已删包不要加**（`dsh-client-runtime`/`dsh-host-apiproxy` 已在 master 移除，加了就 404）。
- **本地 registry 链路是临时能力**：verdaccio 存储默认在 `%LocalAppData%\Temp\verdaccio-storage`（**重启/清 Temp 即丢**）；构建 worktree（`dsh-build-clean`）为临时物（2026-08-30 已清）。需要重走本地构建时：`git worktree add` 干净 HEAD → install/build → verdaccio（**存到非 Temp 路径**，如 `H:\MaxNull\WorkStation\.build\verdaccio-storage`）→ publish → prepare-runtime。官方 npm 发布后此链路不再需要。
- 归档抽查（发版清单）：`.runtime-version = <SSiD>-<dsh>-<锁定指纹>`、`@deepseek-ai/dsh` 实体版本、插件实体、无 `.bak`/`open-sea-skin`/诊断探针污染、vendor 三处指纹。

### 5.3 部署验证
```
$env:SSID_DEV_DEPLOY='1'; npm start    # 发版预演：强制部署 → boot
# 成功链路（~/.ssid/ssid.log）：
#   runtime deploy needed (archive=... profile=...) → runtime deployed → initResult=bundled
#   → bootKernel ok port=<port> → loadURL ok → start() completed → [theme-observer] installed
# .runtime-version 应变为归档指纹；端口 HTTP / 返回 401（auth required = 服务就绪）
```

### 5.4 dev 源码模式构建正确姿势（2026-09-05 rc.1 适配实踩）

- **dev 的 web 壳 serve 根 = 源码树 `apps/web/dist`**：`@deepseek-ai/dsh-web-app` 经 tsconfig paths 映射到
  checkout 源码 → `require.resolve('@deepseek-ai/dsh-web-frontend/package.json')` 命中 monorepo workspace
  链接 → `apps/web`。**改 profile 的 `dsh-web-frontend/dist` 无效**（不读它）。
- **checkout 切换 tag 后必做 `pnpm run clean` 再全量 `pnpm run build`**：client 包 main 指向预编译 `lib/`，
  单跑 apps/web 的 `vite build` 会复用旧 lib；且 tsc 增量缓存（tsbuildinfo）在 tag 切换后产出与 src
  撕裂的 lib（报 `MISSING_EXPORT …`）。全量构建 ≈8 分钟。
- **判缺陷先 SHA256 对齐 serve 根**：先确认「服务端实际服务的是哪份 dist」（页面同源 fetch 资产对比
  磁盘 hash），再判 npm 包 / 源码树 / 构建链——不要先入为主（2026-09-05 曾误判 npm dist）。
- **alpha.1（及相邻 alpha）常见**：`apps/web/dist` 产物缺函数级导出（`FISH_LOGO_VIEWBOX` 等 7 项，
  seed.ts 静态表被 tree-shake）→ 页面 `#130 (sidebar.settings)` + `conversation: …reading 'height'`；
  **rc.1 源码全量构建产物完整**（与 npm 包 hash 一致），遇此现象优先对齐版本（alpha→rc.1）。

### 5.5 dev 源码模式要求 checkout 自身完整（2026-09-13 实测）

`kernel.ts:374` 的规则是：dev 裸跑时若 `$DSH_CHECKOUT` 未设且 profile 有部署闭包，**理应走闭包**。但 SSiD 用 `node --import tsx/esm` 启动，tsx 会读 `shell/tsconfig.json` 的 `paths` 把内核包解析到 checkout 源码——于是**实际加载的是源码，闭包被旁路**。源码模式因此要求那个 checkout 自身完整可用，三个条件缺一不可：

1. **`shell/tsconfig.json` 的 paths 跟得上内核加包**（见 §7 坑 15）。rc.2 实测缺 57 条 → 补到 347 条。
2. **checkout 必须完整 `pnpm install` 过**。它此前从未装过：`zod`、`mime-types`、`@deepseek-ai/node-addon-system` 全缺，表现是 boot 时 `Cannot find package ... imported from <checkout>/packages/...`。
3. **dist 型包必须有 `lib/` 构建产物**。rc.2 实测 22 个包缺（`pnpm run build` 补齐；`native/system/packages/entry` 是其中之一，可单独 `pnpm run build:js`）。

排查顺序就是上面 1→2→3：报 `Cannot find package` 先看 paths 映射，映射补了再看 install，install 好了再看 `lib/`。**错误信息里出现的路径是 checkout 源码路径时，先怀疑这三个，不要怀疑 SSiD 自己的代码。**

> 顺带：判断「启动失败」前**先确认单实例锁的持有者**。思灵有 single-instance 锁，打包版与 dev 版会互相抢占，被拒绝启动时日志只有 `single-instance lock FAILED -> quit`，看起来像崩溃但其实是「根本没轮到它跑」。

## 6. 壳-内核兼容契约（master 升级后重点）

| 契约点 | master（0.1.2-alpha.1）要求 | SSiD 侧实现 |
|---|---|---|
| `healProfilesModuleFallback` | **options 对象 + async**（旧双参签名失效） | `kernel.ts` 已适配（await + {installAnchor, home}） |
| `loadProfile`/`boot`/`provideCmdline`/`webServer` | 签名兼容（webServer 键名不变） | 无需改动 |
| **浏览器认证** | web 服务带 token（`connection.authenticatedUrl`）；裸 URL 401 | `kernel.ts` 产出 `kernel.url`（authenticated）/ main.mjs `loadURL(kernel.url)`——**无 token 则 splash 不替换**（2026-08-29 实测） |
| 壳标志注入 | `window.__SSID_SHELL__`（dsh-quick-toolbar 分支依据） | main.mjs 在 **dom-ready** 注入——**晚于插件 apply**！插件侧必须**兜底**（load 时复查/重算，见 quick-toolbar client.js） |
| `patchReload` | web=live；默认 live | profile/模板显式声明 `"live"` |
| `dsh-sidebar-qa ≥0.5.0` | 依赖 `remote.session`（master 提供；rc.2 无） | 升级到 0.5.0 需随 master |
| server 认证 401 | smoke 断言需接受 401 | `boot-smoke.ts` 已更新 |

## 7. 常见坑速查（全部来自实测）

1. **BOM**：改任何 profile/模板 JSON 用 node；PowerShell 写文件（Out-File utf8/patch）都带 BOM → git apply 失败、DSH 崩溃。
2. **PowerShell 5.1**：无 `??`/`?:`（PS7 语法）；管道传 git 输出会转码破坏字节流（用 node 中转）；`@playwright` MCP 等 `.cjs` 必须 node 显式执行（ShellExecute 假执行）。**读含中文的 `package.json` 必须用 node，不能用 `Get-Content -Raw | ConvertFrom-Json`**（2026-09-14 实踩）：PS 5.1 按 ANSI/GBK 解码 UTF-8，中文字符会**吞掉紧随其后的引号** → JSON 语法坏掉、`ConvertFrom-Json` 抛异常；而赋值语句写在 `(...)` 里时**变量保留上一轮的值**，于是循环里静默打印出**别的包的版本号**当成这个包的版本（实测把 `dsh-dream-skin 9.14.1` 显示成 `dsh-pocket`/`dsh-session-manager` 的残留值，差点据此误判升级失败）。清单类校验统一走 node 脚本（`.build/verify-profile-deps.mjs` 即为此写）。
3. **dev 模式部署**：默认 skip；只有 `SSID_DEV_DEPLOY=1` 才强制（发版预演；预演完恢复正常 dev 启动）。
4. **旧实例占锁**：boot 失败实例挂住（splash 等待）→ 占 single-instance 锁 → 新实例假退出；**先清进程再重启**。
5. **worktree 构建**：原 checkout 可能有进行中的调试（探针/修复/未提交改动）——构建/发布用 `git worktree add` 干净 HEAD + 有意合入的补丁。
6. **vendor 污染**：模板 vendor 下不要放备份目录（`.bak-*` 会被归档卷进且触发 vendor 副本修复）——备份放 profile 侧或库外。
7. **verify 校验脚本的基线**：web（源码模式）无内核族依赖；**部署后的 profile 含 28 内核族声明**——实体对比时内核族按 `@deepseek-ai/*@<内核版本>` 判定，勿按 web 基线误报。
8. **smoke 环境变量**：`SSID_MCP_NODE`/`SSID_MCP_PW_CLI` 缺失 → mcp-playwright 行 args=[null,…] 校验失败。
9. **插件改名（五处联动）**：① 声明 `dependencies` 的**键和 file: 路径值都要改**（2026-08-30 实踩：只改键 → pnpm `ERR_PNPM_LINKED_PKG_DIR_NOT_FOUND`）② `bundles` 数组 ③ plugins 源 + 三处 vendor（目录+内容）④ main.mjs/kernel.ts 注释引用 ⑤ pnpm 状态文件（`pnpm-lock.yaml`/`node_modules/.modules.yaml`/`.package-map.json`）在 install 报旧路径时逐层替换，最后 `pnpm install` 重物化（否则下次 boot bundle 解析失败）。
10. **DSH 页面状态持久化 = host 化，禁 localStorage**（2026-08-30 用户拍板规则）：思灵内核 web 端口**动态**（每次重启变化）→ 页面 localStorage 按 origin（host:port）隔离，**跨重启必丢**（quick-toolbar 位置/钉住/折叠/壳开关、panels 更新日志 seen 均踩过同坑，2026-08-30/2026-08-28 两次实踩）。**任何需要跨重启的状态一律 host 化**：存 `~/.dsh/<pkg>.json`（host 半读写 + 客户端 API 桥——panels seen 标记先例）；页面 localStorage 只允许会话瞬时态。
11. **`#130 (sidebar.settings)` / `conversation: …reading 'height'`**（2026-09-05 rc.1 适配实踩）：**先对齐 serve 根与版本**——大概率是**源码树 `apps/web/dist` 的旧版本构建产物缺函数级导出**（alpha.1 树必现；rc.1 全量构建完整）。处置：`git -C deepseek-harness checkout dsh-v0.1.2-rc.1` → `pnpm run clean && pnpm run build` → 页面 reload。**不要**改 profile dist（serve 根不在 profile）。
12. **部署零保留覆盖用户层（v0.2.0 重大事故，2026-09-07 修复）**：`deployRuntime` 部署 = 归档模板**整体覆盖** profile 根的 package.json / cordis.patch.yml / pnpm-lock.yaml / node_modules——用户**自装插件声明与自装 MCP 注册（cordis.patch.yml insert 条目）零保留**（dev 与安装版共用 `~/.dsh/profiles/ssid` 更放大了它）；叠加 `~/.ssid/pending-plugin-updates/index.json` 陈旧条目（如 dsh-sidebar-qa@0.4.2）会在每次 boot 前把兼容插件**回滚**到不兼容旧版 → `Failed to load plugins` 白屏「无法启动」；部署失败（EPERM .deploy.old）且旧环境无闭包锚点时走「无法定位 DeepSeek Harness 运行时」崩溃。**v0.2.1 修复链**：部署前快照用户配置（`~/.ssid/profile-backups/`）→ 部署后 patch 条目级合并回写（MCP 自动保留；插件只进升级报告不自动重装——旧版插件×新内核会白屏）→ pending 消费护栏（版本 < 当前声明/声明缺失/非 registry 一律丢弃）→ 失败或取消时无闭包锚点则 splash 阻断提示。相关：`docs/决策/2026-09-07-升级部署覆盖用户层修复.md`；**发版预演（L2）需覆盖「用户插件+MCP 预置后部署」场景**（SSID_DEV_DEPLOY=1 或真机）。

13. **预制 MCP 是 profile 级单例，cwd 不能跟随会话**（2026-09-09 实踩，CodeGraph 扫用户主目录）：
    `dsh-mcp-client` 条目一个进程服务所有会话，`cwd` 在 spawn 时固定
    （`packages/mcp/mcp-client/src/transport.ts` 直传 `StdioClientTransport`）——
    「默认取当前会话工作目录」这类需求在架构上不成立；改成 agent-preset 级挂载则变成
    每会话一个引擎（700–900MB/索引，内存不可接受）。且 **`cwd: ''` 会让 spawn ENOENT**
    （空字符串不能当「不设」用），所以 MCP 条目的 cwd 必须有非空值。
    处置范式：**boot 前由壳解析一次**（`shell/lib/codegraph-adapt.mjs`），解析不到就
    `disabled: !!js` 停用条目（`!!js` 求值见 `vendor/loader/src/config/entry.ts:104`，
    insert 子条目同样适用），而不是给个「看起来能用」的错误默认值。
    相关：`docs/决策/2026-09-09-CodeGraph-MCP-默认索引目录修复.md`。

14. **改 `pnpm-workspace.yaml` 的 overrides 不能加尾逗号**（2026-09-12 实踩）：该文件用的是 **YAML block mapping**，条目写 `'pkg': 'ver'`，**没有尾逗号**（逗号属 flow style）。用脚本批量切版本时惯性写 `'pkg': 'ver',` → `pnpm install` 立刻 `[ERROR] bad indentation of a mapping entry (47:39)`。且**改完必须用真解析器验语法**（`yaml` 包，或直接让 pnpm 解析），正则自检挡不住这类错误。
15. **内核加包会打断 `npm run typecheck`，且错误指向 checkout 不是 SSiD**（2026-09-12 rc.2 实踩）：`shell/tsconfig.json` 的 `paths` 是**手写清单**（289 条）用于把内核包解析到 `../../deepseek-harness/packages/...` 源码；内核新版新增一个被 `app-boot` 引用的包，就会报 `TS2307: Cannot find module '@deepseek-ai/dsh-<新包>'`，位置显示在 checkout 的源码文件里。**处置：补一条 paths 映射**（本次是 `@deepseek-ai/dsh-package-manifest` → `packages/util/package-manifest/src`）。这是**每次内核升级都要过的门**，别误判成 SSiD 代码问题。
16. **`prepare-runtime.mjs` 第 4.5 步会把 vendor 根的 `README.md` 当插件复制**（2026-09-12 实踩）：日志出现「修复 vendor 副本 README.md」，产物里 `node_modules/@max-null/README.md` 是个 **0 文件**条目。第 2.1 步过滤了非目录条目，**第 4.5 步没过滤**。当前无害（不参与解析），属待修噪声。

17. **手动注入的 `<style>` 必须带 `data-plugin`，且值不等于模块 id**（2026-09-14 实踩，悬浮球样式事故）：DSH 的 client 模块系统在**任何模块 materialize 时**做一次认领——`packages/client/modules/src/client/system.ts:42-52` 的 `claimStyles(id)` 对 `document.querySelectorAll('style:not([data-plugin])')` 逐个 `setAttribute('data-plugin', id)`；那个模块被 HMR 重载时，`packages/client/hmr/src/client/index.ts:86-91` 的 `removeOwnedStyles(id)` 在 `entry.refresh()` 之前按 `data-plugin === id` 逐字匹配删除。于是**裸注入的样式会被任意模块认领、随它的一次重载被物理删除**，而元素（div）既不被认领也不被删 → 表现为「元素在、样式全没、刷新才恢复」；插件的防重守卫又让重建的 fiber 直接 return、不再补注。修法：`data-plugin` 取一个**独立于模块 id** 的稳定值（如 `dsh-quick-toolbar-styles`、`dsh-chat-rail-hide-official`）。**排查线索**：用户说「你操作 ssid dev 之后就这样」——每次把插件 bundle 同步进 profile 都会触发该插件的 HMR 重载；web 端同源受害（共用同一批 profile 插件文件）。复现/复测：改 profile 里某个插件的 `lib/client.js` 内容触发重载，连续两次即可看到「第一次认领、第二次删除」。相关：`docs/决策/2026-09-14-插件样式归属与HMR连带删除.md`。

18. **CDP 几何测量前先开焦点模拟**（2026-09-14 实踩）：CDP 所连的 Electron 窗口未聚焦/未绘制时，Chromium **冻结 CSS 过渡与 rAF**——`getComputedStyle().width` 恒返回过渡的**起始值**（实测把 rail 展开态 280px 读成 36px 并据此误判），`el.getAnimations()` 里 `CSSTransition` 永远处于 `running`，连 `style.setProperty('width','280px','important')` 都读不回新值。先 `Emulation.setFocusEmulationEnabled({ enabled: true })` 再测；但开启后 `Input.dispatchMouseEvent` 的 hover 可能不再触发 React 的 mouseenter → **先在未开启时 hover 展开、再开焦点模拟让过渡跑完**。判据：过渡恒为 `running` 即时钟已冻结。同类现象：`behavior:'smooth'` 滚动不推进（需 `'auto'` 兜底）。

19. **第三方插件的 DOM 锚点必须按运行态实测，不能按源码/README 推断**（2026-09-14 better-sidebar v0.19.0 适配实踩）：按 `ui-sidebar-right/src/client/shell/ExpandButton.tsx` 与 README 推断出的三个锚点**全部不命中**——`button[data-sidebar-right-expand]`（该版未渲染）、`button[class*="nArs4W_toggleButton"]`（开关按钮根本没这个类）、`[class*="toggleCluster"]`（v0.19.0 已删）。dev 实测的实况：**侧栏**开合由常驻按钮承担（类名 `P3OORG_iconButton`，`aria-label`「收起右侧边栏」，**开、合两态都存在且位置不变**——不是「收起态换成 expand 按钮」的互斥模型）；`[data-sidebar-right-open]` 的宿主是 `DIV.P3OORG_panel`（右侧栏根，不是外层容器）；**底栏**开关只有 `aria-label`（本版中文恒为「折叠底部面板」，两态同文案），面板容器仍是 `nArs4W_bottomPanel`（折叠态带 `bottomPanelHidden`）。处置：**`aria-label`/文本作主锚**（语义稳定、随 locale 双写），推断来的哈希类名子句保留作跨版本兜底；注释一律写实测结论，不写推断。流程：改锚点前先在 dev 里对**每个子句单独** `document.querySelector` 验命中，再落代码；适配包一层判别函数（`panelButtons()`）比散落选择器好改。相关提交：`dsh-quick-toolbar` 8f41e12。

20. **`createToolbar` 里的壳标志是「一次性快照」——晚到的 `__SSID_SHELL__` 会让壳专属分支永不生效**（2026-09-14 实踩，quick-toolbar 悬浮球）：`win.__SSID_SHELL__` 由 main.mjs 在 **dom-ready** 注入，晚于插件 `apply`；而 `client.ts` 的 `createToolbar()` 内 `var ssidShellEnv = win.__SSID_SHELL__ === true` 只求值一次，且该函数**不会二次进入**（`__dshQuickToolbarInstalled` 守卫 + `hideIfShell` 只在壳标志为真且 `shellVisible` 为假时移除工具栏）。于是首遍走**探测路径**：`dsh-plugin-center`（`[class*="pc-headerbtn"]` 已被 BASE_CSS 隐藏、文本兜底又匹配不到侧栏导航项）**永远探测失败 → 该按钮在 SSiD 壳里根本不渲染**（实测 `#ssid-toolbar` 面板只有会话管理/设置/侧栏/底栏 4 个内置 + 用户适配器；`__SSID_SHELL__ === true` 却仍走探测分支）。影响可控（壳标题栏已有「插件中心」入口），但**「壳环境恒渲染」的兜底形同虚设**；侧栏/底栏能出来纯靠探测后来命中。修法方向：标志改为**每次读取**（函数化）或让 `hideIfShell` 在标志到达时补一次 `renderBuiltins()`。**2026-09-14 已修**（`dsh-quick-toolbar` 6835abb）：`ssidShellEnv` 快照改为 `isShellEnv()` 每次读取 —— 既有的 1s 补渲染轮询随即在标志到达后的下一个 tick 按壳语义补渲染，无需新增钩子（dev 实测面板 4 → 5 个内置；点击「插件中心」按钮 `pc-` 元素 0 → 1858 = 面板打开，再点归 0 = 收起）。**同类风险**：任何在 `apply` 期读取 main.mjs 注入标志的分支都要按「标志可能晚到」设计。

21. **多入口构建会把「双半共享模块」拆成 chunk，而 DSH 的 client 加载器不认**（2026-09-14 实踩，quick-toolbar 收藏会话）：插件的 client 半与 host 半共用一个模块（如 `src/favorites.ts`）时，tsdown/rolldown 在**多入口单次构建**下会把它提成 `xxx-<hash>.js` 共享 chunk，`lib/client.js` 顶部随之多出一条 `import ... from './xxx-<hash>.js'`；而 DSH 的 client 模块加载器按**单文件**取 `/plugins/<pkg>/client.js`（合并 bundle 的 `??pkg/client.js,...` 协议），不会去拉那个相对 chunk → **client 半整体静默失效**。实测现象极具误导性：**工具栏连同所有功能按钮一起消失、页面无任何报错，而 host 半的路由照常响应**（很容易误判成服务端/数据问题）。处置：`tsdown.config.ts` 改**数组配置**（两次独立构建、每次单入口，各自内联共享模块；注意 `clean` 只开在第一次，第二次会删掉前一次的产物），host 半的 `platform: 'node'` 会默认输出 `.mjs`，需 `outExtensions` 钉死 `.js` 以匹配 `package.json` 的 `main`/`exports`——**并且同步 vendor 时整目录镜像 + 清掉旧 hash 文件**，别只复制 `client.js`/`index.js`（产物文件数不固定）。详述见 `dsh-quick-toolbar` README 的构建段。

22. **排查期的「模拟点击」别留在启动路径上——诊断代码会有副作用**（2026-09-14 用户报障）：壳的 `[sidebar-diag]` 原本在启动 8 秒后 `bottom.click()` 做「开合验证」，于是**每次启动都把底栏点开**；用户侧看到的现象是「SSiD 启动后下方栏自动展开」，并会合理地怀疑是 better-sidebar 的行为或配置问题（查错了方向）。实测判据：轮询面板状态，0–8 秒 `collapsed`、**10 秒起 `EXPANDED`**，与该 `setTimeout(..., 8000)` 的时间点完全吻合。处置：改为**纯只读**快照（探测按钮存在性与面板状态，不点击）。**同类自查**：启动路径里任何 `.click()` / `dispatchEvent` / `setProperty` 都要问一句「它替用户改了什么状态」——需要交互验证时用 `.build/` 下的 CDP 脚本，临时脚本不进驻启动路径。

23. **DSH 原生右侧栏的 tab 图标：必须传「返回 ReactNode 的函数」，尺寸按 22px**（2026-09-14 实踩，三个插件的侧栏图标）：`ctx.betterSidebar.registerTab({ icon })` 在 **better-sidebar 自绘的底部工作台**里两种形式都能渲染，但 **DSH 原生右侧栏的「开始」页只认函数**——传 `<svg …/>` 元素（或 `tabIcon(...)` 的**调用结果**）会被忽略，回落到它的占位图标（`geFEbW_placeholder`，22px 灰圆）。**排查时务必看对列表**：两处渲染的不是同一个 DOM 节点（工作台卡片 `nArs4W_paneCard` vs 开始页 `geFEbW_entry`），只测前者会得出「已生效」的错误结论——本次就这样绕了两轮，最后靠「同一份 icon 在工作台正常、在开始页是占位符」才定位到形式差异。**尺寸基准是 22**：开始页的图标容器 `.geFEbW_entryIcon { width:26px; height:26px; display:flex; align-items:center }`、自带占位图标 22px，内置那批（侧边对话/浏览器/追问记录）也都是 22（终端 19）——而同一批内置在**工作台卡片**里是 12–14px，**两档基准不同**；icon 是同一个节点、无法按场景分支，以用户日常看到的开始页为准取 22（用户 2026-09-14 直接指出「14 不太对，其他都在 22 左右」）。颜色按内置风格**各自硬编码**（内置也不跟随主题，`currentColor` 反而显得比内置"素"）。

24. **要显示官方「丢弃掉的数据」，接管的不是样式而是那个 keyed slot**（2026-09-15 实踩，node-appearance 提问卡）：DSH 官方提问卡（`packages/client/ui-tool/src/client/tool/toolviews/ask-question-row.tsx`）的 `questionEntries()` 只取 `id`/`question`，**把调用参数里的 `options` 丢掉了**——所以提问一旦结算，「当时还有哪些选项」在客户端管线上根本不存在，**纯 CSS 再怎么改也变不出来**（这一步必须先查清，否则会做成一个只有配色的空壳）。可行路径是接管 `tool.call.toolview` 这个 **keyed slot**：同 key 的注册**只在 priority 相同时才冲突报错**，不同 priority 是 shadow（`ui-slots/src/index.ts:834-849`，报错文案原文 "register at a different priority to shadow it (lowest renders)"），**最低者渲染**；ui-tool 的 slot 契约也写明 "a key the shipped composition already covers is replaced, not shared"——用 `priority: -1` 即可遮蔽官方卡片，并拿到 `block.call.argsRaw` 里的完整参数。代价是**行外壳要自己复刻**：折叠行（24px 行高、2px 分隔点、13px 次级摘要、running 扫光、hover 才现的 Inspect 胶囊）逐项对齐 `ToolRow.module.css`，组件复用共享的 `ui-primitives`（`DisclosureRow`/`StateDot`/图标都在 baseline externals 里，可直接值导入），文案复用官方字典（`register({ locale: 'conversation' })` 即拿到官方的 `t`，不必自造 locale）。**状态判定要对齐官方**：`ASK_CANCELLED` 是用户自己取消 → `state: 'ok'`，`ASK_ABORTED` 是回合中断 → `state: 'stopped'`（官方 `ask-question-row.tsx:142-179` 逐条如此），按通用 `isError` 处理会把两者显示成失败行。**部署注意**：`lib/client.js`（浏览器半）刷新页面即生效，但 `lib/index.js`（Host 半，比如新增的配置项默认值）**要重启内核**；且刷新必须 `Page.reload({ ignoreCache: true })` —— 内核静态路由有缓存，`location.reload()` 会继续跑旧 bundle（实测改了默认色却在页面上读到旧色，误判成"没生效"）。

25. **CDP 截会话流的元素图：滚动在内部容器，且会被"粘底"拉回去**（2026-09-15 实踩）：`window.scrollY` 恒为 0，滚动发生在会话流自己的容器里（实测 `wSkVaW_scrollBody`），所以 `scrollIntoView` 与文档坐标换算都压不住它；**切换会话后 DSH 的粘底逻辑还会在设置 `scrollTop` 之后把它拉回去**，于是"测量时还在视口内、截图时已经跑掉"。可靠姿势：找最近的可滚动祖先 → 手动 `scrollTop += rect.top - sr.top - 16` → **等到连续两次测量结果完全一致**再截图（粘底会体现在这两次之间），落在视口外就重来。另外三个坑同一次踩到：① 尺寸用 `offsetWidth/offsetHeight`，`getBoundingClientRect().height` 会被祖先 transform 影响而偏小（正好裁掉卡片最后几个选项）；② `Page.captureScreenshot` 的 clip 在元素不在视口内时会截到文档顶部，用 `captureBeyondViewport: false` + 视口坐标；③ 想用 `position: fixed` 把元素钉住再截**无效**——会话流容器带 transform，fixed 相对它定位而非视口。相关脚本：`.build/cdp-ask-shots.mjs`。

26. **改了插件的 `lib/client.js`，光刷新页面不生效 —— 内核把 combo bundle 当不可变产物缓存了**（2026-09-15 实踩，node-appearance 目标详情条）：DSH 把所有 client bundle 合成一个 URL 批量下发（`/plugins/??<pkg>/client.js,…&rev=<hash>`，见 `packages/client/modules/src/index.ts:241`），`rev` 是包体字节的哈希（同文件 `:385` 的 `framedHash('combo', [sourceBytes, sourceMap])`），而契约写明「Versioned code is immutable; mismatched revisions are rejected instead of serving newer bytes」（同文件 `:164`）——**内核在启动时构建这份产物并缓存，磁盘上的 `client.js` 改了它不会重建**。所以 `Page.reload({ ignoreCache: true })` 也没用，返回的仍是旧字节。**判据**：把那个合并 URL 抓回来搜新代码的特征串，`rev` 与内容都不变即命中此坑（`.build/cdp-bundle-check.mjs` 就是干这个的）。**处置**：重启内核（dev 侧重启 Electron 壳即可）。**为什么容易误判**：上一轮同样「build → 复制 lib → 强制刷新」是生效的——因为那次同时 bump 了 `package.json` 的 version，而版本是这套产物的输入之一；版本没动的那次就复现了缓存。**顺带**：`conversation.input.dock` 是 list 槽，同 id 才冲突、不同 id 各自成格（官方占 `todo` order 0 / `goal` order 10 / `queue` order 20），追加一条只要取没用过的 id 即可。

27. **托盘的「重启」要分清重到什么程度**（2026-09-15 用户反馈）：`restartDsh(safeMode)` 在**子进程模式且未指定模式**时走的是「只换内核」快路径（`respawnKernel()`，窗口/托盘/标题栏都不重建），只有 `safeMode` 有值或同进程模式才 `app.relaunch` 整壳。用户预期托盘那个「重启」是"重启思灵"（整壳），而快路径对「壳代码/插件文件改了」这类场景是无效的——壳没换，改了 `main.mjs` 也不生效。处置：托盘拆成两项 —— 「重启思灵」= 新增的 `relaunchShell()`（整壳 relaunch，与 `restartDsh` 的整壳分支同一套做法：过滤 `worker.cjs` + `kernel.shutdown(0)`），「重启 DSH 内核」= 原来的 `restartDsh()`。两个函数都**必须定义在 `try` 块外**（块内 `const` 会让托盘闭包 ReferenceError，2026-08-23 实锤）。

28. **换掉第三方插件的内嵌资源＝打一次会被重装覆盖的补丁**（2026-09-15，dsh-dream-skin 的工厂默认壁纸）：`dsh-dream-skin` 把出厂壁纸以 base64 内嵌在 `lib/client.js` 的 `FACTORY_DEFAULTS`（v9.14.2 在第 4164 行）。我们把那张真人写真换成了自制图，脚本 `node .build/patch-dream-skin-wallpaper.mjs`（同时改 `profiles/ssid` 与 `profiles/web`）。**这是临时补丁**：任何 `pnpm/npm install`、插件升级或运行时重部署都会覆盖回原图，需要重跑。核验它是否还在：`node .build/extract-dream-skin-wallpaper.mjs <client.js> <out.jpg>` 把内嵌图解出来比对。**两条边界**：①该图的官方来源是插件 issue #39（社区主动要求把预览图放进插件），所以"换图"不适合向上游提 PR；②但"每次启动闪一帧工厂默认"是另一个真实缺陷，已提 [issue #51](https://github.com/RevolutionLA/dsh-dream-skin/issues/51) —— 根因是工厂默认的「首次安装」判据完全基于 localStorage（哨兵键 + `factory-applied` 标记 + `factory-seeded` 快照，`lib/client.js:4182-4203`），而 Electron 壳的内核端口每次变化 → 页面 origin 变化 → localStorage 恒空 → 每次启动都被判成首次安装，于是先画工厂默认、再被 host 状态覆盖。

29. **皮肤插件把 token 的 alpha 绑在滑杆上——消费方直接取 token 就会「跟着滑杆变」**（2026-09-15 实踩，SSiD 标题栏 + 插件中心弹窗）：`dsh-dream-skin` 的 `shadeTokens2`（`lib/client.js:4097-4117`）把三个 token 的 alpha 绑到设置滑杆上——`--dsw-alias-bg-base` ←「壁纸透明度」（`canvasAlpha`）、`--dsw-specific-sidebar-fill` ←「侧边栏透明度」（`sidebarLink` 打开时就是 `canvasAlpha`）、`--dsh-dream-skin-composer-base` ←**三者中唯一不带 alpha 的皮肤基色**（它专为输入框玻璃而设，注释写明 "Mixing the washed --dsw-alias-bg-base instead would compound the alphas"——即不让壁纸滑杆偷偷改输入框）；另有一个只作用于官方提问卡 `.Mbwy4a_card` 的 `--dsh-dream-skin-modal-fill`（弹窗填充权重 %）。**受害点两处，都是把"带 alpha 的 token"直接当自己的底色**：① 壳标题栏（`main.mjs` 的 `syncTitlebarTheme` 取 `--dsw-specific-sidebar-fill`）跟着壁纸/侧边栏滑杆变透，而 `titlebar.html` 的 fallback（`#0f141d`）本是不透明——语义不一致；② 插件中心弹窗（`.pc-panel` 用 `--dsw-alias-bg-base`）跟着壁纸变透，而用户调「弹窗不透明度」对它完全无效。**两类修法要分开**：要求"恒定"的（标题栏）读 token 后**剥离 alpha、只取色相**（`rgba?()` 正则取前三通道；`#rrggbbaa` 截前六位）；要求"跟随某个滑杆"的（弹窗）用 `color-mix(in srgb, var(--dsh-dream-skin-composer-base, var(--dsw-alias-bg-base)) var(--dsh-dream-skin-modal-fill, 100%), transparent)`，**必须拿不带 alpha 的基色做 mix**，否则 `canvasAlpha × fill%` 两个 alpha 会复合（该插件自己修 composer 时踩过同一个坑）。无皮肤时变量缺省，公式退化为 `bg-base × 100%` = 原值，行为不变。**通用自查**：凡消费 `--dsw-alias-bg-base` / `--dsw-specific-sidebar-fill` 当底色的地方都问一句「这个 alpha 归谁管」；要皮肤的原始色请用 `--dsh-dream-skin-composer-base`，不要用被洗过的 active 值。**修复落点**：壳侧 `main.mjs` 的 `opaque()`（随 `7e3bb79` 一并提交；改的是主进程代码，**重启壳才生效**）+ 插件中心 `client/index.tsx` 的 `color-mix` 底色（`dsh-plugin-center` 仓库 `c780cdc`，client 半端 HMR 即生效）。

30. **升级部署的 patch 合并会把「下一个顶层条目」整行吞掉**（2026-09-15 实踩，`- id: connection` 被吃掉）：`mergeUserPatch` 的 overridden 分支（用户改过的出厂子条目 → 用用户版本替换模板的该子条目）按 `e.start + c.start .. e.start + c.end` 算替换区间，两处实现细节让它越界——① `splitPatchEntries` 判定顶层条目只看「行首 `- ` 且无前导空白」，注释行归入**当前**条目，于是模板里写在 insert 块之后、`- id: connection` 之前的 26 行缩进 0 注释被计入 insert 条目，条目范围一路延伸到注释块末尾；② `splitChildEntries` 的 `end` 因 `entryText` 尾部的 `join('\n') + '\n'` 多算一行。叠加后，insert 块**最后一个子条目**的替换区间末端正好落在下一个顶层条目那一行 → 整行被替换掉，只剩缩进 2 的 `inject: [webRuntime, webServer]` 被 YAML 解析成 insert 条目的兄弟键（与 `insert` 平级）。触发需第三条同时成立：用户在 MCP 管理页改过那个子条目——升级报告 `~/.ssid/upgrade-report-*.json` 的 `patchMerged.overridden` 会点名它。**症状组合极具误导性**：先 boot 失败（`kernel-child 启动失败 … bad indentation of a mapping entry`），手工把 YAML 调成合法后启动恢复正常，**但插件中心 405 复发**——真正缺的是 `connection` 的 `webServer` 注入（机制见 #12 与 `docs/决策/2026-09-14-插件中心405诊断记录.md`）。**处置**：区间钳制 `end: Math.min(e.start + c.end, e.end)`（`shell/lib/profile-merge.mjs`），配套回归用例在未修复版本上实测 `not ok`（`shell/tests/profile-merge.spec.ts`）。**恢复损坏 profile 的要点**：必须把 `- id: connection` 这条**顶层条目**补回（与 `insert:` 平级），只调缩进不解决 405；校验别靠肉眼——用 profile 自带的 `yaml` 包实解析，判据是「顶层条目数为 2 且其中一条 `id === 'connection'`」（`!!js` 标签先剥掉再解析）。相关：`docs/决策/2026-09-15-patch合并越界吞条目.md`。

31. **MCP 条目的 `args[0]` 来自环境变量时，CLI 缺失会让整棵插件树加载失败**（2026-09-15 新机 zip 版实测）：模板 `mcp-codegraph` 的 `args[0]` 取自壳注入的 `SSID_MCP_CG_CLI`，而壳只在 CLI 实体存在时才注入它（`main.mjs` 的 `existsSync` 分支，缺失时只写一行日志）；启停开关 `SSID_MCP_CG_ENABLE` 当时又只看「索引目录能否解析」——两条判定各管各的，于是「目录可用 + CLI 缺失」的组合会把条目置为启用，`args[0]` 求值为 `null`，而 `dsh-mcp-client` 的 schema 要求 `string[]` → `plugin tree failed to load`、**内核起不来**（报错里能看到 `"args":[null,…]`）。`mcp-playwright` 是同一形状（取自 `SSID_MCP_PW_CLI`），当时连 `disabled` 兜底都没有。**处置**：壳层把 CLI 存在性并入启停判定（`resolveCodeGraphEnable`，`shell/lib/codegraph-adapt.mjs`），模板给两个条目补 `disabled` 兜底（`… !== "1" || !process.env.SSID_MCP_CG_CLI` / `!process.env.SSID_MCP_PW_CLI`）。**降级方向要选对**：停用只牺牲那一个 MCP，远好过整树失败。已装 0.3.1 的机器用 `shell/fix-mcp-startup.ps1`（或同目录 `.cmd`，双击）自助恢复——它检查 CLI、缺则停用对应条目、备份并用思灵自带 node 实解析校验。**排查线索**：`~/.ssid/ssid.log` 里的 `prefab mcp codegraph cli missing`。相关：`docs/决策/2026-09-15-MCP条目CLI缺失拖死启动修复.md`。

32. **部署后的完整性校验不能只验浅层路径——归档尾部才是最容易缺的那一段**（2026-09-15 新机 zip 版实测）：`main.mjs` 原先只做一次 `existsSync(join(tmpDir,'node_modules','@max-null','dsh-memory'))`，而该路径在归档 73,775 条里的 **#60,793（82%）**，`@astudioplus/codegraph-mcp/bin/codegraph-mcp.js` 在 **#71,539（97%）**——中断发生在两者之间的解压**能通过校验**，留下「头部齐、尾部缺」的 profile：MCP 条目 `args[0]` 依赖的 CLI 不在，壳据此不注入 `SSID_MCP_CG_CLI`，接上坑 #31 的整树失败。**处置**：校验改为清单式（内核 / `dsh-memory` / playwright cli / codegraph cli 四项逐项 `existsSync`，缺任一项即报出缺了哪些并中止部署），`verify-release.mjs` 的 `EXPECT_PRESENT` 补上 `@astudioplus/codegraph-mcp`。**通用教训**：凡「用一个代表点校验整份产物」的写法，先问那个点位于产物的百分之几——校验点的价值由它身后剩余的体积决定，不由它自己是否重要决定。相关：`docs/决策/2026-09-15-部署校验清单化与codegraph缺失.md`。

33. **profile 的插件 pin 改完，重启不会自动安装**（2026-09-17 实测，dsh-memory 0.7.1 发版）：SSiD 启动时那段「铺 profile 模板 + 跑 `pnpm install`」只在**首启**触发，判据是 `profileReady()` = `existsSync(join(profileDir,'node_modules','@deepseek-ai','dsh'))`（`main.mjs:294-304`）——本机 profile 早已就绪，整段跳过。所以「改 pin → 重启 → 生效」这条链**是断的**，中间必须手动把新版本装进 profile（**纯 JS 插件不必停机**，见 §4 第 6 条；含原生模块的整体重装才要先停实例）。那个判据 2026-09-05 从「预设插件当探针」改成「内核实体当探针」，连带效果是清插件不再触发归档回灌——但也意味着**插件缺失不会被自愈**。**同批实测**：手工把构建产物同步进 `profiles/*/node_modules/@max-null/<pkg>/` 是临时手段（下次 install 会按 pin 覆盖），但这次它恰好与 npm 正式版**逐字节一致**（解包 tarball 比对 `dist/engine.js`，三处同 MD5）——所以「手工同步过的副本是不是正式版」值得实测一次，别默认它可疑、也别默认它可信。相关：`max-null-plugins/dsh-memory/docs/决策/2026-09-17-多实例写入协调.md`。

34. **工作区登记没有自愈能力——丢了就永久丢**（2026-09-17 定位）：`WorkspaceRegistry.bootstrap()` 会按 cwd 把历史会话归位、甚至自动新建工作区，但它**只在 `global.initialized === false` 时跑一次**（`packages/workspace/workspace/src/index.ts:127-130`）。本机 `workspace.json` 早已 `initialized: true`，于是平时那条「创建会话即登记」的写入一旦因多实例互相覆盖而丢失（机制见 `docs/排查/2026-09-17-多实例共用storages.md`），**再没有任何兜底**——侧栏分组里那些会话永久消失，而会话文件本身完好无损（所以「会话丢了」其实是「没被登记」）。**处置**：`shell/scripts/heal-workspace-registry.mjs` 按 `bootstrap()` 同一套规则补登记（按 cwd 分组、未登记者**前置**合并、只加不删、跳过已归档；`--new-workspaces` 时跳过临时目录与目录不存在的 cwd），默认 dry-run、`--apply` 才写并在同目录留备份。**必须在实例停止时跑**——运行中的实例持有内存态，会把整份登记写回、覆盖你的改动。**排查纪律（三条，都是实踩）**：①会话目录名有的带 `session-` 前缀、有的不带，**用目录名做键会大面积错配**（据此得出过一份错误的「142/235 未登记」统计，改用 header 里的 `id` 重扫后结论完全反转）；②会话日志文件名也有两种——旧版 `session.jsonl.zstd`、**v3 格式起 `session.v3.jsonl.zstd`**，只认前者会**静默漏掉所有 v3 会话**（实测漏 52 个、少补 33 条）；③**写进登记的 id 必须带 `session-` 前缀**——DSH 内部统一用 `session-<uuid>`，而可见性过滤是**逐字比较**（`entity.ts:102` 的 `sessionPath(id) === record.path`）；v3 日志的 `header.id` 自带前缀、旧格式是裸 uuid，第一版脚本 `bare()` 去掉了前缀，**补入的 198 条里 214 处 id 因此在侧栏不可见**（WorkStation 只显示 8 条而非 145 条，且不报错）——现由 `canonicalId` 统一补齐并在写回时规范化历史条目。另：上面那句「**必须在实例停止时跑**」应修正为「**工作区变动时才会被覆盖**」——实测运行中写回可行，只要写回到重启之间不新建/移动会话。统计口径也要先自问「两个会话根有大量重复 id（隔离时复制过），我算的是并集还是各自」。

35. **配置写了不等于会生效——在「被禁用的条目」上写配置，永远不会进运行时**（2026-09-18 实测）：通过 profile patch 给 host 层的 `compaction-basic`（dsh-base bundle 的行）加 `config.thresholdRatio: 0.5`——YAML 合法、字段名对得上 schema、取值落在 `(0, 1]`，**三条同时成立，但那条配置根本不会被加载**：`web-app` bundle 在 host 平面把该行设成了 `disabled: true`（压缩改由 agent preset 决定挂不挂，host 层只留 token 计量）。静态检查查不出这类问题，**唯一可靠的判据是 `--dump-config`**：看目标条目有没有被 `patched by <patch 文件绝对路径>` 标注、以及它有没有躺在 `disabled: true` 下面。SSiD 没有全局 `dsh`，跑 profile 里那个：

    ```sh
    node ~/.dsh/profiles/ssid/node_modules/@deepseek-ai/dsh/lib/bin.js --profile ssid --dump-config
    ```

    `--dump-config` 是**干跑**（组合完插件树就退出），不启动第二个实例，可随时跑；另有 `--dump-default-config`（不含用户 patch 层）可做对照。**同一个坑的另一面**：`thresholdRatio` 这类按 preset 走的参数**不在 host 层**——本机自动压缩阈值实际由 **agent preset** 决定（`~/.dsh/.agent-presets/<id>/agent.cordis.yml` 里 `compaction` group 的 `compaction-basic` 子条目），落点规则见 `@deepseek-ai/dsh-agent-presets` 的 `lib/index.js:195`（`USER_PRESET_DIR = ".agent-presets"`，harness-home 下放自建 preset 的目录）与 `:182`（`COMPOSITION_FILE = "agent.cordis.yml"`）；而 `agent-presets` 的 `config.default` 决定**新建会话**用哪个 preset——**已存在的会话沿用创建时的选择**，改 default 不会追认。相关记录：`docs/排查/2026-09-18-长会话输出退化.md` §五。

36. **「vendor 四份逐文件一致」在 Windows 上必须对行尾码免疫，否则是一条永远修不干净的门**（2026-09-18 v0.3.3 发版实测）：`check-vendor-sync` 原先按**字节**算 sha256，于是报出 6 处「内容漂移」——而逐份复核（归一化后取指纹 + 逐字节 CRLF/LF 计数）显示**四份内容完全相等**，差的只是行尾码：源与 `profile-template` 是 git 检出（`core.autocrlf=true` → **CRLF**），而 `~/.dsh/profiles/<p>/{vendor,node_modules}` 里那些实体是 **pnpm 物化**写出来的（**LF**）。判据是两处副本的**字节数与时间戳完全相同**（`vendor/<pkg>/x` 与 `node_modules/@max-null/<pkg>/x` 同为 3152 B、同一秒）——`sync-vendor` 用的是 `copyFileSync`（保留 CRLF），所以写 LF 的只可能是 pnpm 那一步。**结论**：这条硬性要求在此结构下**不可维持**——每次 `pnpm install` 都会把差异造回来，门报的是假信号，真漂移反而被淹没；而 `sync:vendor --apply` 修完下一轮 install 又打回 LF。**处置**：`lib/vendor-fingerprint.mjs` 的指纹改为只对**可解码 UTF-8 文本**归一 CRLF / 孤立 CR（含 NUL 或非法 UTF-8 序列的缓冲区按二进制逐字节算），内容差异（行尾之外的任何改动、末尾换行、空白）与从前一样照报；同步器与门共用该实现，因此两侧结论一致（`node scripts/sync-vendor.mjs` 的 dry-run 同时从 5 处假差异回到「全部一致」）。新增 `scripts/check-vendor-sync.spec.mjs` 四条自测守住这个语义。**同批的第二处假红**：`check-profile-sync` 报 `dsh-context` A=0.53.3 / B=0.53.1 —— dev profile 落后于 template，处置是 `pnpm install` 把它拉平（`Packages: +1 -71`，66 项声明改后逐项在位、bundles 33 项全在）。**顺带记下 web 侧的处置**：`sync:vendor --apply --web` 会覆盖 `~/.dsh/profiles/web/vendor` 里那份 `release-notes.md`（纯文档字节，对运行中的宿主无影响），而 `dsh-ssid-pwsh-retry` / `dsh-ssid-env` 在 web 侧**本就该缺**（SSiD 专属，门按 `profiles` 字段跳过），报「目标不存在」是设计如此。

37. **读者要据此挑动作时，「差异」的方向不是修饰、是判据本身**（2026-09-21 修 `check-profile-sync`）：判定 3（两处同名不同版）原本只报「声明不同」，而**同一句话在两个方向上要求的动作恰好相反**——B 落后于 A 是可预期的稳态（部署时按 A 补上，多半不用动手），**B 超前于 A** 才是坑（下次部署会被归档包覆盖，必须补进 `profile-template`，铁律 5）。不分方向的文案把读者推向 `pnpm install`，而它对后者**恰恰是错的**：会把本机独有的新版本静默降回，正好抹掉那条必须保住的声明，代价要到下一次发版才显形（对照 #36：那次假红同样难以分辨，但错得安全）。该文件开头第 11 行本就写着「两个方向都要报，但文案必须区分」，判定 2（只在一侧存在）早已照做、判定 3 没做——**规则写在注释里，不会自动扩散到下一个同类分支**。**处置**：判定 3 引入 `compareVersions`，复用 `shell/lib/profile-merge.mjs` 的既有语义（含 pre-release；`file:`/`git:` 等非 semver 形态返回 `null` → 退回中性文案，不假装知道方向）。**验证要造例**：真实 profile 只会给出「落后」那一支，超前那支得用临时 `DSH_HOME` 造一份假 profile，两个方向各自命中才算测过。**通用判据**：写「A 与 B 不一致」这类检查前先问——读者会据此改哪一边？答案随方向变的，方向就必须进文案。

38. **共用信号 ≠ 共用判据：把判定条件照抄到语义相反的地方，会静默走向反面**（2026-09-21 实现「执行期间不息屏」实测）：保活与完成通知共用同一批 `turn/start` / `turn/end` 事件，但**判据必须相反**——通知只挑 `reasonKind === 'completed'`（只有正常完成才值得打扰用户），保活要「**任何** `turn/end` 都释放」：`error` / `aborted`(user·parent·disposed·legacy·hook) / `interrupted` / `blocked` / `max-tokens` / `plugin-*` 都从这条路走。照抄通知的判定，结果是**出错或用户手动停止之后永不释放**，屏幕再也关不掉（最坏是烧屏）。同一处的第二个坑：`noteTurnEnd()` 必须排在「没记到 start 就 `return`」那个短路**之前**——该短路对通知无害（没 start 就没用时），对计数却是致命的（只加不减 = 永久持有）。**处置**：状态机抽到 `shell/lib/keep-awake.mjs`，副作用（`start`/`stop`/`readConfig`/计时器）全部注入，配 `tests/keep-awake.spec.mjs` 九条单测覆盖并发 turn、尾巴期内再起一轮、多余的 `turn/end`、配置关闭；这些序列靠手点界面凑不出来。**通用判据**：复用一段信号之前先问「我这边的语义是**触发**还是**释放**」——两者相反时，判定条件必须重写而不能沿用。相关：`docs/SSiD开发手册.md` §3「壳侧配置文件」、`shell/main.mjs` 的两个 `turn` 分支。

39. **跨窗口做不了毛玻璃：`backdrop-filter` 只模糊同一页面内的内容**（2026-09-21 实现执行中遮罩实测）：遮罩要「透出底下的会话、但读不出内容」，初版是独立 `BrowserWindow`，三条路依次试完全部不通——① **Windows acrylic**（`backgroundMaterial: 'acrylic'`）：DWM 把不透明度和模糊半径**都**定死，只剩一片均匀的浅灰，**连「有东西在动」都看不出来**；而 `backgroundColor` 的 alpha 也盖不过它的材质色（设 `#0b0f179e` 仍是浅灰）。② **`transparent: true` + 页面 `backdrop-filter`**：窗口背后不在它的合成树里，取不到 backdrop，内容原样清晰透出。③ 其它窗口级变体同理。**唯一可行的是把遮罩注入 DSH 页面内部**——同页面内的 backdrop-filter 是标准能力，半径完全可控（`blur(10px)` = 布局轮廓看得出来、一个字读不出）。**代价两条**：遮罩依附页面，重载会被冲掉（`dom-ready` 要按状态补注）；解除信号没有 `ipcRenderer` 可用（主视图页没配 preload），走**页面 `console.log` → 壳的 `console-message`**（与 `[theme-sync]` 同一套标记模式）。**同批还踩了一个验证方法的坑**：`Graphics.CopyFromScreen`（GDI BitBlt）**抓不到 DWM 的材质合成**，用它验证 acrylic 会得到「窗口完全没绘制」的假象，并据此白改了一轮参数——要抓含 DWM 效果的画面必须用 `desktopCapturer`（DXGI）；反过来，抓页面自身效果直接 `page.screenshot()` 最省事（不必抢窗口焦点）。**通用判据**：做跨窗口的视觉合成前先问「这个效果作用在哪一层」——CSS 的 backdrop 类效果作用在**页面合成树**内，出不了窗口。

40. **dev 不部署 ⇒ 模板改了 patch，运行时不会自己跟上**（2026-09-21 实测，Playwright 双条目）：`main.mjs` 的 `devSkipDeploy`（`!app.isPackaged && hasModules && SSID_DEV_DEPLOY !== '1'`）让 **dev 裸跑下自动部署永不触发**——这是设计（dev 要热更新，不能每次启动重铺 profile），但副作用是：**`shell/profile-template/cordis.patch.yml` 的任何改动都停在模板里，运行时的 patch 一动不动**。2026-09-20 的 `6ef7dea` 把 Playwright 拆成无头/有头两条目、并加 CLI 缺失护栏，只落到模板和**做那件事那台机器**的 profile；本开发机的运行时隔天仍是单条 `mcp-playwright` 且无护栏（护栏缺了就是埋雷：`args[0]` 求值出 null 会让整棵插件树加载失败、内核起不来，见 #31），而且是凭印象发现的、不是门报出来的。**判据**：改完模板的 patch，**必须手工把同批改动搬进 `~/.dsh/profiles/<p>/cordis.patch.yml`**——dev 不部署不等于不用同步，只是没人替你同步。`check-profile-sync` 的**判定 6** 现在管这个：模板有的条目 id 运行时缺了要报；同 id 条目模板带 `disabled` 而运行时不带（护栏缺失）更要报。**⚠ 反方向的陷阱**：运行时 patch 常含**本机增量**（如 `compaction-basic` / `agent-presets`），这些**不该**搬进模板——判据是「这条改动换台机器还成立吗」。**同批还清掉一处历史残骸**：`insert` 块与 `connection` 条目之间有一行缩进 2 空格的悬空 `inject: [webRuntime, webServer]`，YAML 会把它并进 `insert` 块的字段（等于让整个 MCP 插入块去等那两个服务就绪）。它的形状符合 #30 那条旧合并逻辑「吞掉下一个顶层条目」留下的痕迹（`git log -S` 查模板各版本该行始终与 `- id: connection` 1:1，故不是模板带来的）；用当前 `mergeUserPatch` 复现纯升级路径**不再产生**它，是历史残留而非活 bug。**顺带的判据**：改完 patch 用 js-yaml 实解析一遍并**逐条目打印自己的字段**，别只看文本——`!!js` 要按完整 tag 名 `tag:yaml.org,2002:js` 注册自定义类型，否则 `yaml.load` 直接抛 `unknown tag`。

41. **发版回填 release notes 时，包内那份必须停在发版前那一版**（2026-09-21 v0.4.0 收尾时差点踩）：发布后要把 SHA256 与「已发布」状态回填进 `docs/release-notes-*.md`——这时**只能改 docs 与 GitHub Release 页，不要走「Copy 到 panels → tsdown → sync-vendor」那条同步链**。原因是**哈希自指**：安装包的 SHA256 取决于内嵌归档，而归档里又装着一份更新日志，把最终哈希写进包内会**再次改变**哈希。所以包内那份（`plugins/dsh-ssid-panels/release-notes.md`）从 v0.3.2 起只给占位符，真实校验和以 Release 页与 `docs/` 为准。**为什么值得记**：`ssid-release` skill 里原本把「归档里的 notes 是发版时快照」与「改完 notes 要重走同步链」并排列出，两条各自都对，但**连起来读会把人推向反方向**——照后者做就把最终哈希同步进包内了，且踩得无声（门不会报，因为 vendor 三处确实一致了）。这是「两条都对、合起来错」的类型，与坑 #37（方向即判据）同源：规则写在列表/注释里，不会自动扩散到相邻那条。**处置**：skill 那两条已补上适用时点——**发包前**改 notes 走同步链，**发包后回填**只改 docs 与 Release 页。

42. **往 profile 装第三方插件时，`link:` 指向的目录必须能沿真实路径向上找到 `node_modules`，否则内核直接起不来**（2026-09-22 实踩，MerZlin 桌宠的桥接插件）：桌宠的 `install_bridge()` 往每个 profile 写入 `"@dsh-pet/bridge": "link:H:/…/dsh-pet-standalone-webm-chat/_internal/integrations/dsh-pet-bridge"` —— 插件实体落在**桌宠自己的安装目录**下，而那条路径从插件目录一路到 `H:\` **都没有 `node_modules`**；Node 解析 ESM 裸包名（插件内 `import … from '@deepseek-ai/dsh-llm'`）是沿 **realpath 逐级向上**找的，于是插件树加载失败（`plugin tree failed to load: failed to apply loader entry include (cordis:include): failed to import loader entry …` + `ERR_MODULE_NOT_FOUND`）、**内核起不来**，主进程弹「思灵启动失败」。**处置**：在插件实体目录里建 `node_modules` junction 指向 `~/.dsh/profiles/<profile>/node_modules`（链路上任何一级有它即可解析）。**两个误导点**：①壳在启动失败时会兜底提示「可尝试：设置环境变量 `DSH_CHECKOUT` 指向 DeepSeek Harness 仓库」——那是**通用兜底文案**，与依赖解析失败无关，顺着它查会跑到完全无关的方向；②「link 建好了」不等于「能解析」，必须实测 `node -e "import('file:///<插件入口>')"` 能列出 exports 才算通。**更根本的解法**：需要长期集成的第三方插件，别用它自带的 `link:` 机制——把实体放进 profile 的 `vendor/`（向上两级即 `profiles/<p>/`，天然够得着 `node_modules`），或自己写一份走正常 npm 发版。相关：`docs/决策/2026-09-22-桌面宠物选型与自研评估.md` §7.1。

43. **长期存活的外部程序不能用会话内 `Start-Process` 拉起——会被进程树清理带走**（2026-09-22 实踩，桌面宠物「莫名退出」）：DSH 的 subprocess 层带 **local process-tree provider**，内核重启/退出时清理整棵进程树。用工具会话里的 `Start-Process` 启动的进程，父进程是会话内的 `pwsh`（内核的子进程），**思灵一重启就被一起收走**；表现为**日志停在那一刻、无任何错误痕迹**，极易误判成「程序自己崩了」（本次据此白查一轮）。**判据**：`Get-CimInstance Win32_Process -Filter "Name='<exe>'"` 取 `ParentProcessId` 并向上追溯，落在 `pwsh → node(kernel-child) → 思灵.exe` 这条链上就没脱离。**处置**（脱离进程树）：① **WMI** —— `Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '"<exe 路径>"' }`，父进程为 `WmiPrvSE.exe`、`ReturnValue=0` 为成功；② `Start-Process explorer.exe -ArgumentList '"<exe 路径>"'`；③ 计划任务（适合开机自启）；④ 让用户自己双击。**适用范围不止桌宠**：任何需要活过内核重启的外部程序（常驻服务、监视器、外部编辑器）同理。相关：`docs/决策/2026-09-22-桌面宠物选型与自研评估.md` §7.2。

44. **文档里写裸的双左花括号会让 GitHub Pages 构建失败或静默吞内容**（2026-09-23 实踩：Pages 构建被我一篇新落的调研文档打红，而这条坑正是我们自己在 dsh-memory 里刚修过的同类问题，只是宿主从 DSH 严格插值换成了 Liquid）：本仓库的 Pages 是 `legacy` 模式、**从仓库根跑 Jekyll**，因此所有 `.md` / `.html` 都过一遍 Liquid（`.mjs` / `.js.map` 不过，所以源码里的 JSDoc 类型花括号无害）。Liquid 把**连续两个左花括号**当变量起始：**未闭合**时直接 `Liquid syntax error: Variable '…' was not properly terminated`，让**整个构建失败**（本次元凶是一个把它当字面量写的行内代码）；**成对闭合**时不报错，但会**静默渲染成空字符串**——文档悄悄缺字，比报错更隐蔽（本仓库另有一处引官方 persona 原句的决策记录，一直在被吞）。**只有双左花括号敏感，双右花括号单独无害。** **写法**：要表达这个字面量时写 `<code>&#123;&#123;</code>`（HTML 实体 + `<code>` 标签）——Liquid 看不见实体里的字符，GitHub 网页与站点两侧都渲染成目标字形；**行内代码里放 HTML 实体无效**（代码跨度内不解析实体），所以必须换成 `<code>` 标签而不是反引号。**排查**：`gh run view <run-id> --log-failed` 直接点名文件与行号；`gh run watch <id> --exit-status` 等结果（失败返回非零）。**未根治**：`docs/决策/index.html` 的内嵌 JSON 里仍有成对形态（由 `build-index.mjs` 生成，要根治得在生成器里转义）——它不报错，只在线上站点里静默缺字。

45. **fork 有两个副本（交付副本 / 运行副本），改动只落在一侧会静默漂移**（2026-09-26 实测）：`ssid-shell-fork/`（**交付源码副本**，非 git 仓库，只含 `apps/desktop` + `apps/desktop-host`）与 `.ssid-build/checkout`（**运行副本**，dev 实际构建与启动的那一个）。2026-09-26 核对发现：改动 24 那一轮全在 checkout 里做，fork 落后 **6 个文件有差异 + 5 个新文件只在 checkout**（`screenshot.ts` / `mask.ts` / `main.ts` / `host-process.ts` / `desktop-host/index.ts` / `titlebar.ts`，以及新文件 `keep-awake.ts` / `mcp-env.ts` / `codegraph-adapt.ts` / `ssid-keep-awake.ts` / `ssid-screenshot.ts`）——**没有任何门会报这个错**，只有主动比对才看得见。**判据**：收尾对 `apps/desktop/src`、`apps/desktop/scripts`、`apps/desktop-host/src` **逐文件比哈希**（`Get-FileHash`），必须零漂移；`lib/` 是构建产物、**不参与比对**——fork 那份是历史构建，里面还留着上游早已删除的模块产物（`preload.cjs` / `seed-store.js` / `wire.js`），拿它判断「改动是否落地」必然得出错误结论。**坑中坑**：**不要用 `git diff --no-index` 递归整个 `apps/`** —— checkout 里 `.desktop-build/development/project/node_modules` 的深路径会超 Windows 上限，git 直接 `Could not access ...` 并退出码 1，看着像 diff 本身失败。

46. **移植一个功能前，先确认它防的那个问题在新架构下还存不存在**（2026-09-26 核查 `profile-merge`）：自建壳的 `shell/lib/profile-merge.mjs`（升级时保留用户层）防的是「`deployRuntime` 用归档对 profile 根**整体覆盖**」——`node_modules` 整体替换，`package.json` / `cordis.patch.yml` / `pnpm-lock.yaml` / `vendor/` 逐个 `rmSync + rename`（引文见 `docs/决策/2026-09-07-升级部署覆盖用户层修复.md:10`）。判断 fork 要不要移植它，不能靠「自建壳有、fork 没有」，得去找**覆盖**这个前提：① **fork 壳里没有任何归档部署代码**——`.ssid-build/checkout` 全仓搜 `dsh-runtime.tar.gz` / `deployRuntime` / `profile-template`，命中的全是 `dsh-runtimes/dsh-primary-runtime`（那是 python/node/pnpm 工具链，与 profile 无关）；② **官方基座的 profile 初始化是纯增量**——`packages/boot/app-boot/src/profile.ts:236-239` 的注释与实现都写着 *“Existing files are never touched, so re-running is a no-op on an initialized profile.”*，三个文件各自 `if (!existsSync(...))` 才写。⇒ 结论是**不移植**，用户层天然被保留。**但「前提不成立」不等于「没事可做」**：同一轮核查顺带挖出真缺口——`initProfile` 写的是 `dependencies: {}` + 两个官方 bundle 且**不跑包管理器**，而 fork 的打包配置（`electron-builder-config.mjs` 的 `extraResources`）只带 primary-runtime 与图标、**不带 profile 归档**，于是「新装机如何得到思灵的插件集」在 fork 链路里根本没有答案。**通用判据**：先把「它防的是什么」写成一句话，再去新架构里找那个前提；找不到前提时不要直接收工，接着问**「那个危害现在由谁承担、由谁交付」**——问题通常不是消失，而是换了形态。

47. **在启动路径上 `await` 一个等人操作的对话框，等于让无人值守启动永久挂起**（2026-09-26 实踩，我自己埋的）：CodeGraph 索引目录的首次引导原本放在 `installSsidMcpEnv({ promptWorkspace })` 的 await 链上——MCP 的 env 必须在 Host 子进程启动**前**注入，而对话框要等人点击。触发条件平常得可怕：**全新的 `DSH_HOME`（没有任何会话可供探测）+ `~/.ssid/codegraph.json` 缺席**。实测现象：日志停在 `ssid: mcp codegraph cli missing` 之后不再前进，**没有报错、没有超时**，进程活着、9229/9222 都在 LISTEN，但 **Host 永不 spawn**（9230 一直 free）——界面上只剩一个等待点击的对话框。脚本/CI/远程启动会**永久**卡在这里，而现场留下的证据是「什么都没有」，极易误判成内核启动失败。**判据**：把「启动必须走过的 await」逐条列出来，问每一句「如果这一步永远不返回，现场会留下什么」——留下的若是「什么都没有」，就是这种坑。**处置**：引导挪到 Host 就绪、窗口可见之后，**调用方 `void` 不 await**，结果写进配置、下次启动生效；窗口不可见时干脆不问（那正是无人值守场景）。纯判据与落盘抽成 `apps/desktop/src/ssid/codegraph-guide.ts`，`mcp-env.ts` 只解析、不交互。**更一般的教训**：**「需要人回答」和「启动必须完成」是互斥的两件事**，任何一次把前者塞进后者的改动都不会立刻报错，只会在没人看着的时候静默挂住。

48. **同名同版本、内容不同：跨渠道取包时版本号不再是判据**（2026-09-26 实测）：为 fork 版做「随包插件集」时，我从**发版基准**（`shell/profile-template`）装包 —— 它对 13 个 `@max-null/*` 写的是 **npm 版本号**，而 dev profile 用的是 **`file:./vendor/*`**。两者**版本号一模一样**（如 `dsh-node-appearance` 都是 `0.5.0`），**内容却不同**：npm 那份的 `dsh.client.inject` 要 `@deepseek-ai/dsh-client-ui-settings-plugins`、host 半调 `ctx.settingsScope`；vendor 那份要 `dsh-client-ui-plugin-manager`、不碰 `settingsScope`。而 **`settingsScope` 在 dev 内核源码里零命中**（`packages/*/*/src` 全仓搜索）—— 它属于 0.1.5 线的机制，0.1.7 已换掉。结果：从 npm 装出来的插件集在这台机器上 `pending (waiting for service: settingsScope)`，**壳直接拒绝启动**，而 dev profile 一路正常。**判据**：一个包只要存在两条来源渠道（registry / 本地 vendor / 手工同步的构建产物），比较就**必须落到内容**（哈希、或 `inject` / `exports` 这类会随内核演进的声明），**不能只看版本号**。相关：坑 #36（vendor 指纹要对行尾免疫）、铁律 5（插件双处声明）。**另一面**：这件事不是孤例 —— 同一个 template 的 vendor 只有 7 个包、dev profile 有 21 个，第三方包版本也整体落后（better-sidebar 0.19.1 vs 0.21.1、dream-skin 9.16 vs 9.23…）。**发版基准不会自己跟上 dev**，得有人回填。

49. **内核包的版本线不是一条：想自己拼一份「内核闭包」会撞上一整张对照表**（2026-09-26 实测）：给插件集补装内核 peer 时，我按「内核版本 `0.1.7-rc.2`」统一填版本，连撞两次 `ERR_PNPM_NO_MATCHING_VERSION` —— `@deepseek-ai/cordis` 走 **4.x** 自己的线（那不是内核版本，是 cordis 的 rescope 版本）、`@deepseek-ai/dsh-client-runtime` 走 **0.1.1-rc.x**，只有 `dsh-tools` / `dsh-settings` 那一批才与 `@deepseek-ai/dsh` 同版。**这正是自建壳 profile 里那 313 条 `overrides` 在解决的事**：内核各包的版本对应关系是内核自己维护的（官方 lockfile / overrides），外面的人按名字猜不出来。**判据**：需要「与内核同版的一套包」时，**照抄内核给的清单**（overrides / lockfile / 闭包），不要用「主版本号 + 包名前缀」去推。**推论**：fork 版下插件要用的内核包应当**由安装锚点提供**（`<runtimeDir>/node_modules/@deepseek-ai/*`，dev 下 325 个包），插件集只该管插件侧的传递依赖 —— 我们往里塞内核包的那次，直接让内核自己的 26 个插件 `failed to import`（profile 的内核包盖掉了锚点的）。

50. **「复验通过」不等于「形态正确」：拿一个能跑的组合去改基准之前，先跑基准自己的门**（2026-09-26 实踩，我做错又回退）：起因是 `profile-template` 的组合装出来必崩（`dsh-node-appearance` 等 `settingsScope`），而 dev profile 的组合能跑 —— 于是我判定「以 dev 为准把 template 对齐」，把 dev vendor 的 13 个包拷进去、7 个版本对齐、13 条依赖从 npm 版本改成 `file:./vendor/…`。**复验确实通过**：全新 `DSH_HOME`、`linked=615`、零崩溃零 pending。**但形态是错的。** 改完才跑 `check:rules`，三门报红，其中 `profile-sync` 的报错直接把正解摆了出来 —— 它比的是 template（A）与**安装版运行时**（B）的声明，而 B 那 69 条里写着规矩：**不发 npm 的包**（`dsh-capture` / `dsh-ssid-panels` / `dsh-context-doctor`…）用 `file:./vendor/…`、**发 npm 的包**（`dsh-achievements` `0.1.2`、`dsh-memory` `0.12.1`…）用 **npm 版本号**。我把 13 个发 npm 的包也改成了 `file:` —— 那是 **dev profile 长期手工同步出来的偏离态**，不是发版形态。另有一门报 template 的目标内核仍是 `0.1.5-rc.2` 而 vendor 是给 `0.1.7-rc.2` 编的（peer 写 `^0.1.7-rc.2`），套进旧基座必然不覆盖。**处置**：从备份整目录回退，`git diff shell/profile-template` 只剩一行既有改动。**三条判据**：①「跑通了」证明的是**这个组合能工作**，不是**这个形态符合仓库规矩** —— 两个不同的问题，前者可以用一次启动验完，后者只有门知道；② **改基准前先跑它自己的门**（`check:rules`），我这次改完才跑，于是先红后查、白做一轮；③ **看到「dev 能跑、基准不能跑」，先问「dev 是不是长期手工维护的偏离态」** —— dev profile 里那 13 个 `file:` 声明与 21 个 vendor 副本就是偏离的痕迹。真正的病根也不是声明形态，而是**版本没发**：npm 上那份是旧适配，dev vendor 里的新适配还没 `publish`。

51. **fork 官方桌面端引入的新构建依赖与一串环境门**（2026-09-26 实踩，连撞六次才打通）：自建壳（NSIS 安装器 + PowerShell）在本机打包**从不需要**这些东西，换成官方基座后全部变成硬前置。**① Visual Studio Build Tools（C++ 工具链）**：官方桌面端的 Windows 安装器是**自绘 UI** —— `apps/desktop/installer/` 下有 `window-frame.cpp` 与一批 C++ 头文件，要 MSVC 编译成 `window-frame.dll`；探测写在 `scripts/desktop-toolchain-preflight.ts`，判据是 `vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath` 非空，**拿不到就拒绝开工**（错误文案 `the installer helper cannot compile`）。装法：`winget install --id Microsoft.VisualStudio.2022.BuildTools --accept-package-agreements --accept-source-agreements --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`（**需要管理员**，会弹 UAC；装完 `vswhere` 出现在 `%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\`）。**② 一串必须显式给值的 env**，缺一个就中止且报错互不相同：`apps/desktop/.env.windows` 本身要从 `.env.windows.example` 拷贝（该文件被 gitignore）；`DSH_DESKTOP_APP_ID` 必须 reverse-DNS；策略源 `DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN` / `PROD_ORIGIN` **要 HTTPS origin，空值不算填**；`DOWNLOAD_TEST_ORIGIN` 要非空、`DOWNLOAD_TEST_RELEASE_ID` 要**32 位小写十六进制**；`DSH_DESKTOP_WINDOWS_CER_FILE` 要证书 —— **不买证书的既定取舍下应该走 `--unsigned`**。**③ 未签名的 dir 打包得自己拼 flag**：`package.json` 里 `package:win:x64:dir` 与 `package:win:x64:unsigned` 各有一半，组合（`--dir --unsigned`）不存在，我补了 `package:win:x64:dir:unsigned`。**④ 这个脚本必须经 pnpm script 调用** —— `runPnpm` 读 `process.env.npm_execpath`，用 `pnpm exec tsx scripts/package-target.ts …` 直接跑会报 `invoke this script through a pnpm package command`。**通用判据**：换底座时，「新底座多要求什么」要**逐个显式确认**，不能靠「反正以前能打」推断 —— 自建壳能打不等于 fork 能打，这两条链的依赖集没有包含关系。

52. **直连 GitHub 拉 Electron 会挂死在「没有数据流的连接」上，而现场什么错都不报**（2026-09-26 实踩）：`apps/desktop/scripts/prepare-runtime.ts:36` 用 `@electron/get` 下载 Electron（win-x64 的 zip **150 MB**）。国内直连 `github.com/electron/electron/releases` 时它卡死在一半：日志停在 `$ tsx scripts/prepare-runtime.ts` 不再前进、`packaging-runs/<run>/events.jsonl` 最后一条是 `stage-start download:electron` 而**没有配对的 `stage-end`**、进程活着、**25 秒内 CPU 时间一秒没涨、读写字节 0.00 MB → 0.00 MB**，而 socket 仍然在（`Get-NetTCPConnection` 能看到一条 `Established` 到 `185.199.110.133:443`）。它**没有超时也没有重试**，放着不管就是永久等待 —— 我为此白等了 20 分钟，中途还误判过一次「没卡住，在下载」。**判据**：① `download:electron` 是否完成，看 events.jsonl 有没有配对的 `stage-end`；② 判断「是不是卡住」**不能看 socket 是否存在**（存在 ≠ 有数据），要**取两次 `Get-Process` 快照比 `CPU` 与 `ReadTransferCount` / `WriteTransferCount`** —— 真在下载的进程这两个 IO 计数持续增长，挂死的连接是三个数一起不动。**处置**：设进程环境变量 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`（`@electron/get` 的 `dist/artifact-utils.js` 里 `mirrorVar` 读的就是 `ELECTRON_<镜名>` 变量，而 `customDir` 默认取版本号，拼出来正好是镜像上的 `44.0.0/electron-v44.0.0-win32-x64.zip`）。实测镜像 **12 MB/s**，整个 `prepare:runtime`（Electron 下载 + 解压 + pnpm 准备 + primary runtime + smoke）**81 秒**跑完；同一件事直连 20 分钟没动静。**两条坑中坑**：① **不能把它写进 `apps/desktop/.env.windows`** —— `desktop-package-environment.mjs:47-52` 对该文件的**每一个键做白名单校验**，非白名单键直接抛 `desktop package: unsupported setting …`，会把打包当场打死；它只能做**进程环境变量**。② **`downloads` 缓存不保留 Electron 的 zip**（那目录里只有 primary runtime 的 python / node / 4 个 wheel，合计 90.8 MB），所以**每次打包都要重下这 150 MB** —— 镜像不是「可选加速」，是这条打包链在国内跑通的**必要前置**。

53. **electron-builder 会丢掉 `extraResources` 源目录顶层的 `node_modules`，且一个字都不报**（2026-09-26 实踩：Windows 打包**首次跑通**、产物却是废的）：fork 版把「随包插件集」挂在 `extraResources`（`{ from: <root>/ssid-plugins, to: 'ssid-plugins' }`），而 `prepare:ssid-plugins` 的产物是 `<root>/ssid-plugins/{node_modules, ssid-plugins.json}`。包打出来了、进程退出码 0、smoke 全过、目录也建了 —— 但 `resources/ssid-plugins/` 里**只有那个 14.8 KB 的 manifest，819 MB 的插件实体一个没进去**：一份写着 `bundles: 32 / packages: 584` 的清单配着一个空目录，壳照着它建链接只会指向空气。**判据**：`extraResources` 复制完要**核对源与产物两侧的顶层条目**，不能只看「目标目录在不在」—— 我这次就是先看到目录存在便以为成了，直到量体积（0 MB vs 819 MB）才认出问题。**根因**：electron-builder 对**源目录顶层**的 `node_modules` 有特殊处理（把它当依赖目录走另一套收集逻辑），最终被丢掉；**嵌套的 `node_modules` 不受影响** —— 同一份产物里 `resources/runtime/pnpm/dist/node_modules` 完好无损，就是反证（对照见 `builder-debug.yml` 首行的 `!**/node_modules/**`）。**正解**：**单独再挂一条，让 `from` 指向 `node_modules` 的`*内容*`**：`{ from: join(root, 'ssid-plugins', 'node_modules'), to: 'ssid-plugins/node_modules', filter: ['**/*'] }`。**这个坑上游早就踩过**：`apps/desktop/scripts/electron-builder-config.mjs` 里处理 dsh 依赖的那段就写着 `// electron-builder excludes a source directory's root node_modules.` 并配了完全相同的第二条；我加插件集条目时只抄了「带上这一目录」，没抄这条配套。**教训**：**照抄一份既有配置时，要连同它的「配套条目 + 注释里写明的理由」一起抄** —— 只抄看着像主体的那一条，就会静默继承一个自己完全不知道的缺陷。

54. **改发版基准前先问一句：B 侧还会不会被重新部署？**（2026-09-27 实踩，先改错又改对）：fork 版打出来的安装包首启即崩（`@max-null/dsh-node-appearance: pending (waiting for service: settingsScope)`），查下来是 **template 对该包声明 npm `0.5.0`**，而 npm 上的 **0.5.0 是 0.1.5 内核适配**（`dsh.client.inject` 要 `dsh-client-ui-settings-plugins`、host 半调 `ctx.settingsScope`）、**0.6.0 才是 0.1.7 适配**（要 `dsh-client-ui-plugin-manager`；而 `settingsScope` 在 0.1.7 内核里零命中）。改成 0.6.0 后 `profile-sync` 立刻报红：`「@max-null/dsh-node-appearance」版本失配：B 落后于 A（A=0.6.0 B=0.5.0）—— 可预期的稳态，部署后会按 A 补上`。**我的第一反应是回退**（以为这一改会把 0.6.0 装进内核还是 0.1.5 的安装版），**这个反应是错的** —— 一旦确定 B 侧不再接受部署（安装版冻结、不会再装新版插件），「B 落后于 A」就不再是「欠一次部署」而是**稳态**。**正解**：照改 template，并给 `check-profile-sync` 加一个豁免类别 `exemptFrozenInB`（与既有的 `exemptOnlyInB` 是同一类豁免的两个方向），登记进去、**撤销条件写在理由里**。**判据**：**动发版基准前先问「B 侧还会不会被重新部署」** —— 会，就是「欠一次部署」，改动必须连同内核版本一起走（门报红是对的，别急着豁免）；不会，就是「稳态」，登记豁免、把理由与撤销条件写清楚。**这条坑的价值不在结论而在过程**：我拿到门报红后第一反应是回退，而门其实已经把答案写在文案里了 —— 它说的是「**部署后**会按 A 补上」，**真正的变量不是「A 该不该变」，而是「B 还会不会被部署」**。后一个问题我没问就下了结论。

55. **换底座会换掉「产品版本」的载体，而且它散在三个地方各强制相等一次**（2026-09-27 实踩）：自建壳时代产品版本挂在 `shell/package.json` 上（所以有 `ssid-shell-setup-0.4.0.exe`）；换上官方壳后那个载体没了 —— 产品版本被**三处**强制等于 DSH 版本（`0.1.7-rc.2`），于是「思灵 1.0.0」无处安放：① `package-target.ts` 的 `writeReleaseRecord` 抛 `does not match dsh version`，并用 `resolveDesktopBuildVersion(environment, dshVersion)` 算发版号；② **`prepare-dsh.ts` 的 `desktopRelease`** 同样强制相等，**而且它把 `version` 当作「要装的 dsh 版本」用**（`readDesktopCorePackageSet(BUILD_ROOT, release.version)`）—— **这一处最容易漏**：跟着把产品版本改成 1.0.0，运行时会去 npm 找一个不存在的 `@deepseek-ai/dsh@1.0.0`，正解是让它**继续用 dsh 版本**（运行时描述的是它内嵌的内核，不是产品版本）；③ `desktop-upload-plan.ts` 上传时校验「发版记录里的版本是 dsh 版本的扩展」。**判据**：**换底座后逐个问「这个版本号是谁的」** —— 描述**运行时**的（内嵌内核、node/pnpm 版本）必须跟 DSH；描述**产品**的（安装包名、更新源 `latest.yml`、发版记录）必须跟思灵自己。混用会在「产品版本 ≠ 内核版本」的第一天就炸。**同轮附带两条**：ⓐ **验证要在打包链真正跑的那条命令下做** —— 我删掉两行后 `apps/desktop` 自己的 `tsc -b` 通过，但链上跑的是**根级 `tsconfig.host.json`**（开了 `TS6133`「声明但未读取」），于是打包跑到第 7 分钟才失败、白跑一轮；ⓑ **产物名与更新源要一起改** —— `electron-builder-config.mjs` 的 `artifactName` 默认是 `deepseek-harness-...`，它同时决定安装包文件名**与 `latest.yml` 里的 `url`/`path`**，只改一个会让自动更新指向不存在的文件。

## 8. 文档索引

- 本手册（总览/流程/坑）
- `ssid-shell-fork/SSID-CHANGES.md`（**fork 改动清单**：对上游每条改动的文件/行/原因 + dev 实机验证证据。改动 21–28 覆盖 dev profile 解耦、第三方插件接入、设置槽位迁移到 `plugins.bundle.config`、截图/保活/MCP/CodeGraph 四项功能补全，以及**「`profile-merge` 为何不移植」**与 fork 双副本同步纪律）
- `docs/决策/2026-08-29-SSiD升级执行指南.md`（升级执行方案——§1.1 版版本对照表仍在参考价值）
- `docs/决策/2026-08-29-SSiD升级执行记录.md`（本次升级全过程与修复记录）
- `docs/决策/2026-08-29-DSH-master插件适配测试报告.md`（插件 × master 适配矩阵、根因、PR 追踪）
- `docs/决策/2026-08-24-Playwright-MCP-预制-实施方案.md`、`docs/发版流程规范.md`（发版：归档抽查/NSIS/GitHub Release）
- `docs/决策/2026-09-07-升级部署覆盖用户层修复.md`（用户层保留）、`docs/决策/2026-09-09-CodeGraph-MCP-默认索引目录修复.md`（预制 MCP 索引目录适配 + 三方合并）
- `docs/决策/2026-09-10-官方桌面壳评估与方案B决策.md`（官方壳底座评估、cordis inject 语义实测、**§12 host 通信通道规范草案**）
- `docs/决策/2026-09-10-升级前置差异清单-0.1.2-rc.1到0.1.5-rc.1.md`（跨系列升级的破坏性变更核对 + 前置 checklist）
- `dsh-anatomy/工程范式/2026-09-10-DSH官方工程化范式调查.md`（Agent Notes / Skills / Gates 三套机制实测 + 可移植清单）
- `dsh-anatomy/工程范式/2026-09-10-DSH工程方法论学习笔记.md`（8 个 skill 的方法论提炼：八条核心原则 + 个人/工具双线可迁移清单）
- `docs/决策/2026-09-10-DSH作为AI中台内核的评估框架.md`（就绪观察信号五维 + 可替换用法的中间道路 + 季度评估节奏）
- `dsh-anatomy/工程范式/2026-09-10-DSH方法论精读原始报告存档.md`（8 个 skill 的原始精读报告：逐字引用 + 完整规则清单，供复核）
- `docs/决策/2026-09-10-SSiD-check-rules骨架建议.md`（**待办 #5 的骨架**：四项检查的判定契约 + 编排器取舍 + 首次体检实测）
- `dsh-anatomy/工程范式/2026-09-10-DSH官方Gates拆解原始报告-E-配对与配置门.md`、`...-F-run-gates编排.md`（上述骨架的原始依据，含逐行行号引用）
- `docs/决策/2026-09-14-插件样式归属与HMR连带删除.md`（**手动注入 `<style>` 的归属标记规范** + sticky header 遮挡修复 + CDP 焦点模拟测量纪律 + 逐处普查结论：自制插件里仅三处曾是裸注入）
- `docs/决策/2026-09-15-patch合并越界吞条目.md`（升级部署 patch 合并的区间越界：吞掉 `- id: connection` → boot 失败 → 把 YAML 调合法后 **405 复发**；含真实输入逐字符复现证据与「恢复时只补缩进不解决 405」的要点）
- `docs/决策/2026-09-15-MCP条目CLI缺失拖死启动修复.md`（MCP 条目 `args[0]` 依赖的 CLI 缺失 → 整棵插件树加载失败；壳层启停判定联动 + 模板 `disabled` 兜底 + `shell/fix-mcp-startup.ps1` 一键恢复脚本）
- `docs/决策/2026-09-15-部署校验清单化与codegraph缺失.md`（部署后校验原先只验归档 82% 处的浅层路径 → 中断解压可通过校验、留下尾部缺失的环境；改为清单式，`verify-release` 补 codegraph）
- `docs/决策/2026-09-15-pwsh-spawn-EPERM-重试插件决定.md`、`docs/排查/2026-09-15-pwsh-spawn-EPERM-上游issue草稿.md`（DSH 进程创建层的间歇性 `spawn EPERM`：SSiD 侧一次透明重试的取舍与代价 + 待提上游的 issue 稿）

## 待办清单（2026-08-30 记）

| # | 待办 | 说明 | 状态 |
|---|---|---|---|
| 1 | `shell/scripts/sync-vendor.mjs` | ✅ **完成**（2026-09-12）。**文件名偏离**：手册原写 `.cjs`，实作改为 `.mjs` —— `shell/package.json` 声明了 `type: module`，且要复用 ESM 的 `lib/vendor-fingerprint.mjs`；`.cjs` 得改回 require 写法且无法直接 import ESM（该待办写在 `.mjs` 约定确立之前）。**与已落地的 `check-vendor-sync` 互为对偶**：同步与验证**共用** `lib/vendor-fingerprint.mjs` 的比对面与指纹实现，避免出现「验证说通过、同步完却仍不一致」这类自相矛盾；实测两者对同一处差异（web vendor 的 `release-notes.md`）结论完全一致。**只处理 manifest 里 `mode: full` 且有真实 source 的包**（当前 `dsh-ssid-panels`、`dsh-ssid-zh-ui`）；`vendor-only` 的包源头在 SSiD 仓库之外或不存在，由 check 的三处互比负责。**三个安全默认（本次决策，非上游既有约定）**：① 默认 **dry-run**，须 `--apply` 才写盘；② 默认**不同步 web** —— `~/.dsh/profiles/web` 是当前会话宿主实例，改它等于动运行中的环境（工作区铁律 2），须 `--web` 显式开启且输出显著标注；③ 默认**不删除**多余文件 —— profile 下的 vendor **没有 git 保护**，删了不可逆，须 `--prune`。用法（脚本头注释有完整说明）：`node scripts/sync-vendor.mjs` 报告差异／`--apply` 写入／`--apply --prune` 连带删除／`--web` 纳入 web／`--pkg=<名>` 只处理一个。挂载 `npm run sync:vendor`。自测 5 项只覆盖三条安全默认、**不触发写盘** | ✅ 完成 |
| 2 | `shell/scripts/verify-release.mjs` | ✅ **完成**（2026-09-12）。机械化 `docs/发版流程规范.md` §4 完整性检查与 §5 七条抽查清单（体积、`.runtime-version`、open-sea-skin 默认关闭、dsh-plugin-center 与 dsh-better-sidebar 版本、dsh-capture 功能标记、顶层 dependencies、vendor 版本与源一致）。用 `tar -tzf` ／ `tar -xzOf` **选择性读取**而非整包解包 —— 185 MB 全解包要几十秒且要临时空间，而抽查只需清单里那几个文件。**默认不做部署与 boot**：那两步会改变运行环境，规范 §6.2 把它们放在本机 dev 验证环节（重启思灵看日志 ／ `npm run smoke`），脚本只打印验证方式。这也是"skill 是流程清单、脚本是机械化工具"分工的落地。**两条由实测逼出来的实现纪律**：① **tar 列表要剥 CRLF** —— Windows 上 bsdtar 输出 CRLF，条目实为 `./package.json\r`，不剥则 `endsWith("package.json")` 永假，曾让 §5 的 7 条抽查**全部误报"归档内无此文件"**；② **「读不到」必须与「内容不符」区分** —— 实测 `tar -xzOf` 对 `./node_modules/@max-null/<pkg>/...` 返回 **0 字节**，而同一文件在 `./vendor/<pkg>/...` 下可正常读出（59128 字节、含标记）；把空结果当内容不符会报假违规，**§5-5 正是这样误报过一次「归档缺功能标记」**。故 `readOrNull()` 对空结果返回 null，调用方按两种事实分别处置（"读不到"记 info 提示人工核对，不计违规）。**首次实跑**（归档 223.8 MB ／ 72712 条目）：§5-1 `.runtime-version = 0.2.1-0.1.2-rc.1-7df053b3`、§5-3 dsh-plugin-center `0.2.19`、§5-4 dsh-better-sidebar `0.18.0`、§5-6 顶层 62 个依赖含 `@playwright/mcp`、§5-7 四个 vendor 包全部一致、§5-5 功能标记 ✓ → **0 违规**。挂载 `npm run verify:release` | ✅ 完成 |
| 3 | —（已完成） | 手册变更记录表 + 待办清单 | ✅ 本轮完成 |
| 4 | 全家桶 README 截图补全 | ✅ **完成**（2026-09-12）。**口径修正**：原记「6 个缺 + 3 个半规范」，实测**缺图 10 个**（原记漏了 dsh-node-appearance 等）。处理分三类：①**新截 5 个**（dsh-draft-polish / dsh-memory / dsh-plugin-center / dsh-skill-mcp-center / dsh-ssid-achievements）——连 SSiD dev（`npm start -- --remote-debugging-port=9222`，内核动态端口不碰 3080）经 `playwright-core` CDP 截设置页，**严格按设置对话框 boundingBox 裁剪**，避免带出私人会话/工作区内容；②**归位 2 个**（dsh-capture 7 张 `shot/` → `docs/shots/` 并语义化重命名；dsh-plugin-center 3 张 `assets/` → `docs/shots/`）；③**豁免 4 个**（dsh-chinese-thinking / dsh-guardian / dsh-habit / dsh-skills 无界面元素，改用行为效果说明，见 §9 新增第 5 条）。**顺带修复系统性缺陷**：6 个插件的 `package.json` `files` 字段缺 `docs/shots`，导致**截图根本没随 npm 包发布**（dsh-node-appearance 此前一直如此）。最终 **13/13 通过审计** | ✅ 完成 |
| 5 | **规范检查器**（合并 ①） | `check-rules`：profile vs template 声明逐键对比、BOM 扫描、旧名残留、vendor MD5 四份核——挂 pre-push / 发版前置（把文字规范变成机器强制）。**骨架已产出**（`docs/决策/2026-09-10-SSiD-check-rules骨架建议.md`：判定契约 + 编排器取舍 + 首次体检实测）。**组织方式参考官方 Gates**（一脚本一职责 + 每 gate 配自测 + 统一编排器 + 命名聚合）。**2026-09-12 进度（1/4 门）**：已落地 `shell/scripts/lib/gate-report.mjs`（报告契约：`文件:行` 定位 + 三类事实 + **非零退出** + 空语料 fail-loud）、`shell/scripts/check-bom.mjs`（6 项自测全绿、已显式登记进 `npm test`，全套 35 项通过）、`shell/scripts/check-rules.manifest.json`（比对面声明，字段值取自实测复核）。**首批实战即命中两处真问题并当场修复**：① `~/.dsh/profiles/web/cordis.patch.yml` 带 UTF-8 BOM（用 PowerShell 独立读前三字节复核确认后去 BOM，门转绿 exit 0）；② `verify-header-unify.cjs` 残骸仍留在 **web/ssid 两份运行时 vendor**（tpl 已于 09-10 清理而运行时未清，造成三份不一致）——确认无任何引用后清理，三处回到 4 文件一致；它同时是 `check-vendor-sync` 与 `check-legacy-names` 两门的首个真实命中。**09-12 追加（3/4 门）**：新增 `check-profile-sync.mjs`（A=profile-template vs B=运行时 profile，四条判定 + **方向区分**；构造期排除内核族 `@deepseek-ai/*` 与 `cordis` —— 实测 B 有 33 个内核族条目而 A 一个都没有）。**命中 1 处真失配**：`@max-null/dsh-skills` 只在 B 有（集成时漏改 template），方向为「**B 超前于 A**」即下次部署会被归档覆盖；因它在 B 是 `file:` 本地路径、而 A 现有依赖实测全是 npm 版本号（绝对路径进归档包在用户机必失效），故不能照搬，登记进 manifest 白名单（**门仍打印豁免项，不静默**）并从 A 排期。新增 `check-vendor-sync.mjs`（逐文件 sha256 + 三类差异 + 文本报**首处不同行号**；按包分 `full`/`vendor-only` —— 实测整目录比对会让 dsh-quick-toolbar 报 40 处假差异）。**命中 1 处真信号**：`dsh-ssid-panels/release-notes.md` 在 **web 运行时 vendor 落后一版**（v0.2.0，而源/tpl/ssid 均为 v0.2.1）；因 web 是当前会话宿主实例（**铁律 2**）**未自动修**，保留报红待人工决定。**剩余**：check-legacy-names / check-rules.mjs 编排器 + 各门自测 **09-12 收尾（4/4 门）**：新增 `check-legacy-names.mjs`（硬域用**结构化等值匹配**而非文本扫描：profile 声明的 dependencies 键与 bundles 项、`cordis.patch.yml` 的 id/name、plugins 与 vendor 的目录名；软域 `docs/决策/`、`docs/release-notes-*` 豁免——实测全仓 grep 旧名有 79 处合法历史叙述）与编排器 `check-rules.mjs`（单入口 + 白名单 mode 校验并回显合法值、门表数据化、逐门计时、失败时 error/exit/signal 三类事实互不遮蔽、任一失败 ⇒ exit 1）。**自测 11 项全绿**（bom 6 + legacy-names 5），已显式登记进 `npm test`。其中 legacy-names 的自测以**校准正例**为前提：门在真实仓库零命中，而零命中既可能是真干净、也可能是门根本没工作——故用例 1 造已知正例证明它**会**命中，用例 4 造「注释里的旧名」反例证明它**不**误报（后者正是骨架 §3.5 说的「变更探测器」边界）。**耗时**：四门合计约 320 ms（vendor 129 / profile 51 / bom 70 / legacy 73），串行足够，未引入并发与 fail-fast。**挂载**：`npm run check:rules`；四个门各有独立 script 便于单独复现与单独接钩子。**当前唯一红**：vendor-sync 报 web 运行时 vendor 的 `release-notes.md` 落后一版（铁律 2 未自动修，待人工决定）。 | ✅ 完成（4/4 门） |
| 6 | **host 通信通道规范升格** | ✅ **完成**（2026-09-12），**但升格时补做的实测改变了它的适用范围**。决策文档 §12 的 7 条条文已升格为手册 **§9「插件开发与测试规范」新增小节「host 侧通信通道」**，并附加了版本边界。**实测结论**：本机所有已安装内核（assistant-probe `0.1.1-rc.2`、ssid 与 rc1-clean `0.1.2-rc.1`）的 `dsh-client-connection` 均只有 `GET`＋`HEAD`，**不支持 POST**、也没有 `requestBody` —— 与决策 §13.1 的断代实测吻合。**故升格条件①「在一个 rc.1 环境实测通过」当前并不成立**：`dsh-capture` 的三条路由都是 POST，在 `0.1.2-rc.1` 上跑不通。这是一条**面向升级后**的规范，手册小节里已写明「不要据此在 `0.1.2-rc.1` 上改插件（会得到静默失效的路由）」。**证据强弱已分清**：alpha.2 支持 POST 有**源码证据**（`DSHfork/packages/client/connection/src/rpc.ts:110`）与**行为断言**（同包 `tests/fetch-routes.host.spec.ts:60/62` 证明「路径必须在 `/api` 下」「methods 不能为空」是代码强制而非约定）；而「`0.1.5-rc.1` 的 connection 与 alpha.2 零改动」**仍系此前手册的断言，本机无该版本、本次未能独立复核**，已在手册标注待升级后按升格条件①②补测 | ✅ 完成（附版本边界） |
| 7 | **SSiD Agent Notes 状态机** | ✅ **主体完成**（2026-09-12）。原案「`docs/决策/` 改为 `{proposed,implemented,rejected,archived}` 四状态目录」**已被替代**——物理重组要移动 110 个历史文件、破坏既有互引路径，且状态每次流转都要再移动一次、git 历史碎片化；改用**零侵入的元数据投影**：`shell/scripts/build-decision-index.mjs` 构建器 + `docs/决策/index.html`（自包含单页，110 篇可全文检索、按状态/月份/标签浏览），状态用「原文 + 类别」双字段（不批量补写；67 篇无状态头者诚实标为「未标注」并由构建器点名）。**四段模板已生效**（Problem → Decision → **Alternatives considered（必填）** → Consequences），首个范例 `docs/决策/2026-09-12-决策记录知识库化.md`。**未做**：①归档现有决策文档一批；②67 篇「未标注」需人工逐篇补状态。重建命令 `node shell/scripts/build-decision-index.mjs`。参考 §3.B.1 **归档已完成（2026-09-12）**：按**选项 1「只加状态标记」**执行（不改路径、不动正文，与 #7 的零侵入原则一致）——**A 组 5 篇**标为 `已归档（2026-09-12 · 被 X 取代；原状态：Y）`（**原状态保留在括号里，信息不丢**）；**B 组 4 篇**只标 `部分结论已被 X 取代`（整篇归档会连带丢掉仍有效的部分）。候选与依据见 `docs/决策/2026-09-12-归档候选清单.md`（110 篇全量审计，判定标准从严、每条附原文引用）。同时构建器新增**「已归档」独立状态类别**（规则**优先于「已完成」**——否则归档会被压成普通完成、在索引里筛不出来），UI 同步加筛选 chip 与徽章配色，验证器自测由 5 chip 改为 6。**索引现为 111 篇**：进行中 37 ／ 已完成 29 ／ 记录 31 ／ 已决策 14 ／ **已归档 5**。**未移动任何文件**。另：68 篇原无状态头的记录已补**推断状态**（标注为「（推断 · 2026-09-12）」）；43 篇有原文状态头的一律未动（原文权威优先于推断）。 | ✅ 完成 |
| 8 | **CoT 泄漏探针（首批）** | ✅ **完成**（2026-09-12）：落地 `shell/scripts/check-cot-leakage.mjs`，探针**逐字**取自 `@max-null/dsh-skills` 的 `ssid-trim-cot-leakage/references/recall-batteries.md`（中文 4 组 + 英文 1 组，未改写）。**关键判断——做成报告型而非阻塞门**：探针集自己写明「每个命中都需要语义判断、按设计会过度匹配」，且其「已知假阳性家族」末条对自身语料有实测（扫 8 份 SKILL.md 命中 24 处、**真泄漏 0**）；若做成命中即失败，它会第一时间误杀自己的校准语料、随后被无视——那才是真的失效。故默认**恒 exit 0**，只给候选并标注该组的已知误报家族；`--strict` 才在命中时阻塞（供收窄范围后的 CI）。**范围只取代码**（.ts/.mjs/.cjs/.js），刻意不含任何 .md：代码注释是主要载体，而 .md 里的变更叙事多为**合法主场**（决策记录／release notes／规范文档本身就在陈述变更史）。**两次踩到同一个坑并修正**：脚本最初扫到它自己（体内含探针词表，命中率恒 100%），补排后自测文件又被扫——正是 recall-batteries 第 47 条预告的假阳性家族，最终按文件名前缀 `check-cot-leakage` 整体排除。**自测 5/5**：含**校准正例**（造泄漏代码，证明探针确实在工作）与**近失负例**（`this PR` 必须命中 `this PR adds`，却不得命中 `this project`／`this process`／`this provider`），两者都出自 recall-batteries 的校准纪律。**首次实测**：29 个代码文件、42 处候选待人工判断。挂载 `npm run check:cot`。**未挂 commit-msg 的理由**：本仓库当前**零 git hooks**，引 hook 需动 `core.hooksPath` 才随克隆传播；且提交信息本身就是变更叙事，用它查 CoT 泄漏属自相矛盾。改以独立 script + `--strict` 供 CI 调用 | ✅ 完成 |
| 9 | **深挖官方 Gates 实现** | 读 3–5 个 `verify-*` 脚本源码 + `run-gates.ts` 的依赖图与聚合编排，产出「SSiD `check-rules` 可借鉴的组织方式」。参考 `dsh-anatomy/工程范式/2026-09-10-DSH官方工程化范式调查.md` §4 | ✅ 本轮完成（7 个脚本 + 编排器；产出骨架建议 + 两份原始报告存档；顺带实测出 2 处残骸） |
| 10 | **探针脚本清理** | ✅ **完成**（2026-09-12，用 `ssid-test-reliability` 的判据做的首次实战）。实测修正了原记录口径：本目录共 **59 个 `.mjs`**（原记「66 个文件」是含 `.cjs`/`.ts` 的总数）。三项：①**28 个文件**补上 `SSID_CDP` 回退——改前 52 处硬编码 `127.0.0.1:9222` 字面量、其中 28 处无回退；改后 **52 个文件全部走回退、残留 0**；②**6 个文件**的硬编码 launch token 改从 `SSID_APP_URL` 读（**新增 `helpers/app-url.mjs`**，缺失时清晰报错 + `exit 2`）；③`rc1-clean-check.mjs` 硬编码的 chromium 绝对路径**与构建号**一并删除（改由 Playwright 自行解析，否则换机器必错）。**验证**：以 HEAD 版本（改动前原文）作已知正例校准 pattern → 命中；当前工作区 0 残留；6 个文件 `node --check` 全 OK；缺环境变量 `exit 2`、给了则走到网络层。**顺带查清**：rc1-clean 探针（3083）访问的是**另一个 profile 的独立实例**，与 CDP(9222) 连的不是同一个——所以 `findDshPage` 那套"从页面 URL 取 token"的办法**对它们不适用**，这正是它们需要独立环境变量的原因。相关记录：`dsh-skills/docs/适配说明/2026-09-10-skill适配说明-01-测试可靠性.md` §3（该节即用此问题作判据价值的现场证明） | ✅ 完成 |
| 11 | **`@max-null/dsh-skills` 发布与集成** | ✅ **基本完成**（2026-09-12）。8 个 skill 已生成（SKILL.md + SOURCE.md，含 1 份带 Python 编码器），4 个不适配并记录理由；GitHub 仓库 `Max-Null/dsh-skills` 已建（PUBLIC）并推送。npm 发布**已执行**——重发返回 403「cannot publish over the previously published versions: 0.1.0」，证明该版本**已在主库**；但 registry 查询仍 404，疑为 CDN 同步延迟，待观察。SSiD 侧集成**已就位并验证到 Loader 层**：`ssid` profile 双处声明（暂用 `file:` 指向本地包）→ `pnpm install`（`+16 -68`，13 个关键包核对无缺失）→ **`dsh --profile ssid --dump-config` 的组合插件树里出现 `@max-null/dsh-skills`** → 从 profile 内加载读到全部 8 个 skill。**剩余**：npm 可见后把声明换成版本号 `0.1.0`。全过程见 `docs/决策/2026-09-10-dsh-skills发布与集成.md` | ✅ 完成（2026-09-12 收尾：npm 已可见，实测 `npm view @max-null/dsh-skills version` → `0.1.0`；ssid profile 与 profile-template 双处声明均已由 `file:` 改为 `0.1.0`，manifest 临时豁免已撤销，`check-profile-sync` 转绿；**2026-09-18：0.1.2 发布**——包扩为 10 个技能（8 上游适配 + 2 思灵自创），图书馆按来源拆类，三处声明升 0.1.2） |
| 12 | **升级 `ssid-release` skill（落后于 0.1.5 内核）** | 用户 2026-09-14 指出并拍板。该 skill 定稿于 0.1.5 之前，与当前仓库已有工具脱节，照搬会走弯路：①**打包**是 `npm run pack`（= `bundle-kernel` + **`bundle-kernel-child`** + electron-builder），skill 只写了 `bundle-kernel`；②**归档抽查**已被 `npm run verify:release` 机械化（`verify-release.mjs` 覆盖 §4 完整性与 §5 七条抽查，且默认不做部署与 boot），不必手工 `tar -xzf` 逐项核；③**交付链完整性**由 `npm run verify:shipped`（仓库根 / `win-unpacked` / `setup.exe` 三层哈希）覆盖；④七道检查门（`npm run check:rules`，含 `dsh-clean`）与归档内 `runtime-integrity.sha256` 逐文件清单都是 skill 之后新增；⑤子进程内核与纯净模式、0.1.5 的 inject 收缩（405 修复）等结构性变更 skill 均未涵盖。**注意**：skill 正文**仓库里就有一份且更新**——`.agents/skills/ssid-release/`（`SKILL.md` 17,443 B，2026-09-06；`smoke-ui.cjs` 11,156 B）比用户级 `~/.dsh/skills/ssid-release/`（15,771 B，2026-08-30）新，**该做的是把仓库版同步到用户级**（而非把正文迁进仓库）。**2026-09-14 发版实测补充三条**：①**归档耗时被严重低估**——skill 写「3-5 分钟」，实际约 **25 分钟**（`runtime-integrity.sha256` 生成 65,481 条占 291 秒，1018 MB 的 `tar -czf` 再 1-3 分钟），据此安排发版时段；②**`verify-release.mjs` 的 §5-2 已过时**——它仍检查 `open-sea-skin/plugin/client.js`（该定制在 v0.1.16 已移除），本次报「归档内无该文件」属假提示；同节的体积上限 213 MB 也已被依赖增长突破（本次 230.5 MB，脚本自己提示"通常是依赖增多"）；③`pack` 脚本早已是 `bundle-kernel` + `bundle-kernel-child` + electron-builder，skill 只写 `bundle-kernel` 会漏掉子进程 bundle。**2026-09-14 首轮升级已完成**：skill 正文（`.agents/skills/ssid-release/SKILL.md`）按上述各点改写并同步到用户级 `~/.dsh/skills/ssid-release/`（两处 MD5 一致）；`verify-release.mjs` 的 §5-2 改为「open-sea-skin 缺失不判违规（v0.1.16 已移除）」、期望体积 185 → 230 MB；skill 新增「打包产物自检必须隔离（PS 5.1 无 `Start-Process -Environment`）」「隔离空环境的断言假 FAIL 判据」「gh 上传大文件实测很快（v0.3.0 的 359/409 MB 各 1-2 分钟）」等条目。 | ✅ 完成（2026-09-14 首轮；后续随工具演进继续维护） |
| 13 | **quick-toolbar 在壳里缺「插件中心」按钮** | ✅ **已修**（2026-09-14，`dsh-quick-toolbar` 6835abb）。机理与实测见 §7 #20。修法取「壳标志函数化、每次读取」——**未**新增 `hideIfShell` 补渲染钩子：既有的 1s 补渲染轮询本就一直跑到全部内置就位，标志到达后的下一个 tick 即按壳语义补渲染，故钩子是多余的机制。dev 实测：面板 4 → 5 个内置，点击「插件中心」`pc-` 元素 0 → 1858（打开）、再点归 0（收起）。 | ✅ 完成 |

## 附录 A：开发会话行为清单（2026-08-30，agent 执行前自检）

1. **改 shell 代码** → 先 `npm run typecheck`（有测试先跑测试；能红再改——反馈环）
2. **改插件** → 先跑该插件 L1（typecheck+test）；改完必复跑
3. **改 vendor 插件** → sync-vendor（或手动三处+运行时实体同步）+ 重启 dev 验证（可自重启，先判宿主）
4. **改 profile/模板 JSON** → node 写（防 BOM）；**改插件声明** → 双处（profile + template）
5. **重启 DSH** → 先判宿主（web 3080 禁）；重启后查 ssid.log（bootKernel ok / deploy 链路）
6. **发版** → 给用户完整指令（包名/版本/顺序/回滚预案），F2A 由用户执行
7. **验证留痕** → L2 checklist + 记录一行；截图顺手入 docs/shots

## 9. 插件开发与测试规范（2026-08-30 定稿）

**背景**：早期插件开发漏了自动化测试，现已补齐——全家桶 11 个插件全部具备 `build/typecheck/test` 三件套 + `tests/`。本规范把现状**门槛化**，防止回退。

### 分级门槛（克制原则：不过度强制，只锁关键环）

| 级别 | 时机 | 要求 |
|---|---|---|
| **L1 仓库级** | 每次改动、发布 npm 前 | `pnpm typecheck && pnpm test` 全绿（插件仓库标配；标准 scripts：`build`/`typecheck`/`test`，可加 `prepublishOnly`） |
| **L2 环境级** | 同步进 SSiD（vendor）前 | 在 **DSH 环境实测**（按「三环境流转」：被挂载环境 ≠ 操作环境）——插件挂载点/开关往返/console 0 error |
| **L3 发版级** | 版本收尾 | `verify-release.mjs`（待办 2，服务 ssid-release skill）+ 全家桶全量 `pnpm test` |

### 配套约定

1. **新插件必须按标准模板**：`scripts:{build,typecheck,test}` + `tests/` 目录（包根，参照 DSH 官方惯例），**无测试不进 `max-null-plugins/`**。
2. **反馈环纪律**：先写/改测试 → **跑红**（确认能捕获）→ 改代码 → **跑绿**——「改完再测」是本轮升级踩坑的教训（验证总在最后 → 返工成串）。
3. **对齐 DSH 官方**：官方惯例为 lint/typecheck/test 三件套；插件库对标 **typecheck + test** 两门槛（lint 可选，不过度）。
4. 插件发版（npm publish）必过 L1；同步 vendor 进 SSiD 必过 L2；SSiD 发版整体走 L3。
5. **发版（F2A 验证已启用，2026-08-30；git 与 Release 归属澄清 2026-09-23）**：**只有 `npm publish` 由用户手动执行**；开发会话给指令（包名/版本/发布顺序/回滚预案），并负责**其余全部发版动作**：`git` 提交 / 打标 / push、`gh release create`、三处 pin 与 profile 实体。同日两次把本该自己做的活推给用户（先 git、后 GitHub Release），两次的理由都是「我以为不行」而非「查过不行」——**判据：MCP 工具面不是能力边界**，`pwsh` 后面还有整个命令行（`gh` / `git` / `npm` / .mjs 脚本），先查一次再下结论。另：反问句在纯文本里没有语气标记，遇到「也 / 还 / 又」先确认是质问还是分派，再落档。

### README 截图演示规范（推广硬门槛，2026-08-30 定稿）

**背景**：市面插件普遍无截图，用户安装前看不到效果（"哎这里咋多了个按钮呢"）。标杆：**dsh-chat-rail**（`## 截图` 段 + `docs/shots/`）。

**标准**：
1. README **必须**有 `## 截图` 段——位置：简介/徽章之后、安装之前（用户第一眼看到效果）。
2. 截图存 **`docs/shots/`**，文件名语义化（`<feature>-<n>.png`，如 `rail-fav-1`）；README 用 **Markdown 表格多图并排**（每行 2–3 张）。
3. **用户视角原则**：截图必须能回答「装完会多出/变成什么」——至少覆盖：**新入口/按钮的挂载位置**、**核心面板/交互态**（开/关或前/后对比更佳）。
4. **版本纪律**：插件发大版本（UI 变化）后**必须重截**——防「截图与实物不符」。

**我的补充（工程化）**：
- 截图**随 L2 环境测试顺手生成**（测试时截，不单独开步骤）；
- 原始屏摄（`ScreenShot/` 等）与精选（`docs/shots/`）分开，README 只引用 `docs/shots/`；
- 交互强的插件可进阶用 GIF（chat-rail 目前 PNG 即可，动图不强制）。

**现状缺口（2026-08-30 清点）**：
- ✅ 达标：dsh-chat-rail、dsh-node-appearance
- ⚠️ 半规范（图未进 shots / 空段 / 散落）：dsh-capture、dsh-draft-polish、dsh-plugin-center
  - ✅ 上述三处已于 2026-09-12 补齐（dsh-capture 归位 7 张、dsh-draft-polish 填充空段、dsh-plugin-center 归位 3 张）。
5. **无 UI 插件豁免**（2026-09-12 补）：**行为/提示注入/Provider 类**插件（不新增任何按钮、面板或设置项）**不适用**第 3 条的「入口与面板」截图要求；改为在 `## 截图` 段用文字说明「装完会多出/变成什么」的行为效果，并注明本插件无界面元素。当前适用：dsh-chinese-thinking、dsh-guardian、dsh-habit、dsh-skills、dsh-tone-layer、dsh-allostasis。
6. **标题允许双语**（2026-09-12 补）：`## 截图` 段标题可写作 `## Screenshots / 截图` 等**含「截图」**的形式（便于英文读者定位）；校验按「h2 标题含『截图』」判定，不强制纯中文。
7. **`files` 字段必须含 `docs/shots`**（2026-09-12 补）：截图目录移入 `docs/shots/` 后，若 `package.json` 的 `files` 未列入该路径，**截图不会随 npm 包发布**（README 在 npm 页面上会显示裂图）。这是易漏项，新增截图时一并检查。
- ~~❌ 缺：dsh-chinese-thinking、dsh-guardian、dsh-habit、dsh-memory、dsh-skill-mcp-center、dsh-ssid-achievements~~ —— 此清单是 2026-08-30 的快照，上列缺口已于 2026-09-12 全部补齐（新截 5 个 + 归位 2 个 + 豁免 4 个，见本文待办表第 4 项）；保留删除线是为了不与上方「现状缺口」标题下的结论互相矛盾。

### 样式与视觉一致性（DSH 风格对齐，2026-08-30）

- **插件 UI 必须与 DSH 风格一致**（当前插件基本已做优化；新插件以此为验收项）：用 DSH 设计 token / CSS 变量（`--dsw-alias-*`、`--dsw-*`）而非硬编码色值；不破坏官方布局。
- **样式锚点**：DSH 官方可寻址样式接缝是 `data-slot="<key>"`（渲染点外裹 display:contents div），插件样式定位应基于 data-slot 而非组件 class/hash（hash 随构建漂移——教训见记忆「dsh-navpatch」与「轮次导航 aria-label 锚点」）；aria-label 是可靠的文本锚点（多语言按"中/英双文案"匹配）。
- **不要用兄弟选择器猜布局**（slot 组件 DOM 与相邻控件非兄弟关系）；布局调整如 InputBar 顺序走插件 CSS flex order + data-slot 锚点。

### 侧边栏插件耦合边界（2026-08-30）

- 我们的插件与**侧边栏插件**（dsh-better-sidebar / dsh-sidebar-qa 等）**耦合度高**——**目前没有计划移除侧边栏插件**。
- 插件开发**勿假设侧边栏会被移除**（不做「无侧边栏退化」设计）；耦合点（如依赖 better-sidebar 的挂载/布局）属于稳定依赖。

### 插件设置卡片标准（插件详情页 `plugins.bundle.config`，2026-09-06 定稿·2026-09-26 随内核 0.1.7 改写）

**槽位变更（0.1.7 起，本节规范的依据）**：`settings.plugin.item` 已从内核**删除**（依据：
`packages/client/ui-plugin-manager/src/client/config-ledger.ts:40` 只认
`plugins.item` / `plugins.bundle.config` / `plugins.row.config`；官方 `dsh-cordis-client-runner`
的注册清单里七个 `plugins.*` 槽俱全、独缺此项）。挂到已删除的槽 = 注册到未声明的 slot，
**卡片完全不渲染**（2026-09-26 实测：`dsh-capture` 的设置卡即因此消失）。

**适用判定**：
- **参数少（单卡一屏能放下）→ 插件详情页卡片**（本规范的默认做法，免自建独立设置页）；
- **有独立管理界面/复杂交互**（插件中心、记忆管理、侧边卡片等）→ 独立页面，**不在此列**。
- 先例：@max-null/dsh-node-appearance、@max-null/dsh-chat-rail、@max-null/dsh-capture、
  @max-null/dsh-draft-polish。

**前提**：插件自身必须是 bundle——`package.json` 声明
`"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`。缺它则 `plugins.bundle.config` 不渲染。

**两条实现路线**（按数据来源选，二者都只注册该槽）：

1. **走官方 configForms（推荐——设置是 host 的 `Config`）**：
   - host：`Config` 用 **schemastery `z`**（`z.object({...})` + 默认值=配置缺省）；
   - client：`ctx.configForms.get<T>(NS)` 取表单面（与旧 `settingsScope` 面几乎同形：
     `getSnapshot()` / `subscribe()` / `set(field, value)`，另有 `mutate(ops, rev)` 与 `unset(field)`）；
   - 注册：`ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: PKG_NAME, inject: () => face }, Card))`。
   - ⚠️ `key` 是 **bundle 的包名**（`config-ledger` 的 `keysOf('plugins.bundle.config')` 直接取
     `entry.options.key`）；若要按行挂配置则用 `plugins.row.config` + key = `包名#行id`。
     `NS`（Host 插件 entry id，与 `cordis.patch.yml` 的行 id 同值）只在 `configForms.get(NS)` 用。
   - ⚠️ 该槽只渲染 `view: 'page'`（卡片在 summary 下返回 null）。
   - ⚠️ 对象字段（如 `colors`）不能走 `set(field, value)`（只接受 scalar），改用
     `mutate([{ op: 'set', path: ['colors'], value }])`。
2. **自管理数据的卡片**（设置存在插件自有配置/API 里，不经过 host `Config`）：同上注册，
   但不必碰 `configForms`——卡片自己 fetch/save（注册不提供 `inject`）。
   - 先例：dsh-capture（走 `/api/ssid/screenshot/*`）、dsh-draft-polish（走 `/draft-polish/api/config`）。
   - 旧文档说的「host 必须 `settings.installSection`」是 **0.1.2-rc.1 的历史做法**，0.1.7 下
     `settingsScope` / `installSection` 均已不在 client 服务面（`settingsScope` 在 client 包里 0 命中）。
3. **卡片视觉**（官方 PluginCard chrome token——对齐 node-appearance `card.module.css`）：
   - 壳：`border:1px solid var(--dsw-alias-border-l2); border-radius:12px; background:var(--dsw-alias-bg-layer-3);`
     hover `border-color:var(--dsw-alias-label-dimmed)`；
   - header（button）：标题 15px/600 `--dsw-alias-label-primary` + 描述 13px 灰 `--dsw-alias-label-tertiary`
     + **官方 chevron**（`IconChevronDownOutline14` 同款 fill path，viewBox `0 0 14 14`——**勿自绘 stroke 箭头**）；
   - 展开态 `.xCardOpen`：`background:var(--dsw-alias-bg-layer-2); border-color:var(--dsw-alias-label-dimmed)`；
   - body（`border-top` 分隔）：行 = rowLabel 13px/500 + hint 12px 灰 + 家族开关（40×22 胶囊，`.on` `#4FC3F7`）；
   - **默认展开**：卡片是该插件唯一设置入口，折叠态会让用户以为「设置不见了」——除非有明确理由，
     初始 `open = true`（2026-09-26 用户反馈后定）；
   - 文案中英双语；只用 DSH token（无硬编码色值）。

**依赖注意事项**：client 侧 peer/dev 成对声明需 `@deepseek-ai/dsh-client-ui-plugin-manager`
（提供 `plugins.bundle.config` 的 SlotMap 合并）与 `@deepseek-ai/dsh-client-ui-settings`
（`configForms` 所在），版本对齐当前内核（0.1.7 档为 `^0.1.7-rc.2`）；
`@deepseek-ai/schemastery`（`z`；dependencies）。

**排查清单**：卡片缺失 → ① package.json 有 `dsh.bundle.patch`？② 注册的槽名是否仍是已删除的
`settings.plugin.item`？③ `key` 是否 = 包名（不是 NS、不是行 id）？④ console 有无 slot 冲突/界面错误；
切换不生效 → `configForms.get(NS)` 的 NS 与 `cordis.patch.yml` 行 id 是否一致；
显示为裸行/无卡片壳 → 未用官方卡片样式（检查上述视觉段）。

### host 侧通信通道（2026-09-12 升格自决策 §12）

**来源**：`docs/决策/2026-09-10-官方桌面壳评估与方案B决策.md` §12（草案）。本次升格**附加了版本边界**——决策文档给的是条文，实测补的是"从哪个版本起才成立"。

#### 条文

1. **host 侧新增 HTTP 端点一律用 `ctx.connection.fetch.register`**，不用 `ctx.webServer.register`。
   理由：`connection` 是 carrier-neutral（web 载体把路由挂到 webserver 的 `/api`；Electron shell 载体由帧化管道直接分发），而 `webServer` 只在 web 载体存在，**官方桌面端已在配置层禁用**。
2. **路由路径必须在 `/api` 之下**（如 `/api/ssid/<plugin>/<method>`）。两种载体的分发都只把 `/api` 前缀交给 connection 路由表。
   这条**不是约定而是代码强制**：`packages/client/connection/tests/fetch-routes.host.spec.ts:60` 有断言，注册 `/outside` 直接抛错（同文件 :62 断言 `methods: []` 也抛错）。
3. **精确路径匹配**：一个 `kind: 'prefix'` 路由要拆成若干条精确路径（未命中即 404）。
4. **handler 用标准 Fetch API**：`(request: Request) => Promise<Response>`，不再用 node:http 的 `(req, res)`。
5. **不要自建 Host/Origin fence**：carrier 在 handler 运行前已应用信任与鉴权策略。
6. **注入声明用 `inject: ['connection']`**；避免静态 `inject` 里出现 `webServer` / `webRuntime` —— 静态声明缺失服务会让插件**静默不激活**（无报错、无警告）。
7. **客户端请求路径与 host 注册路径保持一致**（同为 `/api/...`）。

#### ⚠️ 版本边界（升格时的实测，2026-09-12）

**本规范自 `0.1.5-rc.1` 起适用。** 实测证据：

- `0.1.2-rc.1`（SSiD 当前内核）：`ConnectionFetchMethod` 只有 `GET` 与 `HEAD`，**不支持 POST**，也没有 `requestBody`。
- `0.1.5-alpha.2` / `0.1.5-rc.1`：为 `GET`／`HEAD`／`POST`，另有 `requestBody`（buffered／streaming）。
- 本机实测（2026-09-12）：**所有**已安装内核（assistant-probe `0.1.1-rc.2`、ssid 与 rc1-clean `0.1.2-rc.1`）的 `dsh-client-connection` 均为 `GET`+`HEAD`；本机**未安装 0.1.5-rc.1**。

**因此升格条件①「在一个 rc.1 环境实测通过」当前并不成立** —— `dsh-capture` 的三条路由都是 POST，在 0.1.2-rc.1 上跑不通。**这是一条面向升级后的规范**，不要据此在 0.1.2-rc.1 上改插件（会得到静默失效的路由）。

**证据强弱须分清**：alpha.2 支持 POST 有源码证据（`DSHfork/packages/client/connection/src/rpc.ts:110` 的 `ConnectionFetchMethod = 'GET' | 'HEAD' | 'POST'`）；而「0.1.5-rc.1 的 connection 与 alpha.2 零改动」**仍系此前手册的断言，本次未能独立复核**（本机无该版本）。升级到 0.1.5-rc.1 后应按升格条件①②补做实测。

**迁移是单向的**：从 `webServer` 迁到 `connection` **改一次两端都能跑**（web 载体下 connection 把路由挂到 webserver 的 `/api`；桌面载体下由 shell 直接分发），不是二选一。

**当前进度**：`dsh-capture` 已完成改造（`inject` 从 `[webServer, webRuntime]` → `[connection]`；三条路由改 Fetch handler；删自建 Host/Origin fence）。其余 5 个仍在 `webServer` 上，按决策文档 §14 排期：`dsh-memory`、`dsh-draft-polish`、`dsh-ssid-achievements`（静态必需）+ `dsh-quick-toolbar`（动态、核心功能依赖）+ `dsh-chat-rail`（动态、非核心）。

## 10. 内置专属插件规范（2026-08-30 定稿）

### 定位
- 内置插件 **dsh-ssid-panels / dsh-ssid-zh-ui / dsh-ssid-pwsh-retry / dsh-ssid-env**：**脱离 SSiD 生态无法独立使用** → **不单独建库、不发布 npm**。
- **分合判断（2026-09-17 定）：一个适配面一个插件，不合并。** 合并能省的成本（vendor 同步、门禁覆盖）已被 manifest + `sync:vendor` + `check-vendor-sync` 这套工具吸收——加一个包的人工动作只有 manifest 一段 JSON 加两条命令；而代价（独立回滚、故障隔离、`pwsh-retry` 必须挂在 `bundles` 末尾的加载顺序语义）无法自动化。将来小适配 ≥ 5 个、或它们开始共享状态时再评估。依据：`docs/决策/2026-09-17-内置插件分合与运行环境自述.md`。
- **dsh-ssid-env**（2026-09-17 新增）：贡献一条 `systemPrompt` 段落做**运行环境自述**——让模型知道自己在 SSiD 而非裸 DSH web，带上可复核的判据（宿主进程链、profile 目录、会话根）。**只有探测到 `SSID_PROFILE_DIR` 才注入**，装到非 SSiD 环境时保持沉默（自述说错比没有更糟）。`order = -95`，排在中文思考（-90）之前。
- **dsh-ssid-pwsh-retry**（2026-09-15 新增）：包装 `tools/execute`，对 pwsh 工具的 `spawn EPERM` 做一次透明重试（等待 300ms 后重新 dispatch）。挂载点必须在 `bundles` **末尾**——Cordis 的 waterfall 用 `cbs.shift()` 逐个消耗监听器，`next()` 不可重放，只有链尾的包装器重新 `next()` 才会再次真正 dispatch。带单测（7 项）。
- 源码在壳库 **`plugins/`**（源头）→ 三处 vendor 同步（`~/.dsh/profiles/{web,ssid}/vendor` + `shell/profile-template/vendor`），四份**逐文件**指纹一致（源与 vendor 为全等副本，连 `src/`、`tests/`、`docs/` 都同步；**不要**按"整目录摘要相等"比）。
- **dsh-quick-toolbar（原 dsh-header-unify）已于 2026-08-30 迁出独立**（仓库 `max-null-plugins/dsh-quick-toolbar`；独立化设计见该仓库 `doc/设计/2026-08-30-quick-toolbar-独立化设计方案.md`）；SSiD 侧仍 vendor 集成——同步链 = 独立仓库构建产物 → 三处 vendor（正式发布 npm 后切官方路径）。
  - 与另两个内置插件不同，它的 vendor 是**精简副本**：只收 `lib/` + `cordis.patch.yml` + `package.json`，源码/测试/截图/README/LICENSE 都不进 vendor。按"整目录相等"核会报出 39 处假差异。
  - `plugins/dsh-quick-toolbar` 副本已于 2026-09-10 清理（2026-08-30 迁出时未删净，停留在 0.1.0）。

### 打包注意（发版）
- 归档集成**只走 vendor**：`profile-template/vendor/<pkg>` + package.json `file:./vendor/<pkg>` 声明——**不存在 npm 安装路径**。
- **禁止对内置插件执行 npm publish**；发版前置检查：确认内置插件仅经 vendor 打包（无 npm 版残留路径）。
- vendor 清理：`plugins/open-sea-skin` 残留待删（已移出预制清单）。

### 演进记录（已执行）
- **dsh-header-unify → dsh-quick-toolbar（2026-08-30 改名完成）**：功能核心已是「快捷工具栏」，命名归正；`__SSID_SHELL__` 分支具备无壳独立运行潜质。
  - 改名五处（已全部执行并 smoke 验证）：① plugins 源目录（git mv）+ package.json/cordis.patch.yml/client.js 内容 ② 三处 vendor 目录+内容 ③ 三处声明（**dependencies key + file: 路径值 + bundles 数组**——值易漏！）④ main.mjs 注释 ⑤ lockfile / .modules.yaml / .package-map.json（pnpm 状态，install 重物化）。
  - 独立插件设计迭代：**待用户详说**（design doc 后再动）。

### 门槛
- §9 适用：现状 **dsh-ssid-panels** 有 typecheck+测试；**dsh-ssid-zh-ui** 无 scripts/测试；README/截图两兄弟全缺（待补）。dsh-quick-toolbar 已迁出独立，门槛随上游仓库（`max-null-plugins/dsh-quick-toolbar` 具备 build/typecheck/test 三件套）。
