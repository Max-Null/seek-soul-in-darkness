## 官方门禁拆解 · 报告 F：run-gates 编排

本文件是子代理原始报告的存档，未做改写；正文行号均指 `DSHfork/scripts/run-gates.ts`。

## A. 数据模型

**Mode（24–42）17 个聚合名**：ci-primary、ci-linux-primary、ci-static、ci-lint-contracts-ready、ci-coverage、ci-bench、ci-snapshot、ci-artifacts、ci-consumers、ci-windows-blocking、ci-windows-complete、ci-windows-observational、node-compat、check-all、hygiene、doc-sync、doc-quick。parseMode（134–159）是白名单 switch，非法值抛错并回显全部合法 mode。

**Gate（47–63）**：`id`（图的键，依赖按 id 引用）、`label`（人读名，默认=script 名，202）、`displayCommand`（只在诊断里打印的人类可读命令，203）、`command`+`args`（真正 spawn 的，199–207 由 pnpmInvocation 生成）、`needs`（强依赖：必须 passed）、`after`（弱依赖：只需 settled，不看结果，54 注释）、`env`（合并进 process.env，1069）、`quick`（供 doc-quick 过滤，776–778）、`allowFailure`（失败可见但不拖垮聚合，59/118/1573）、`streamOutput`（实时透传不缓冲，61）。**没有** platform/timeout/retry/cwd 字段（cwd 恒为仓库根 root，1068）。

**状态机（43–44）**：`GateResultStatus = passed|failed|skipped`；`GateState = pending|running|<终态>`。迁移 pending→running（937）→passed|failed（1270，判据 `exitCode===0 && signalCode===null && 无 spawnError`）；另有两条直接落 skipped 的边：needs 已失败时对下游 pending 当场构造 skipped（957–972），fail-fast/宿主中断把剩余 pending 全置 skipped（946–953、989–995）。`aborted`（74–77、979–982）保证被中止的结果即便 exit 0 也改写为 skipped，不误报 pass。

## B. 依赖与调度

依赖只有两种表达：needs 强、after 弱，判定在 predecessorsReady（1035–1038）。构造后先校验：validateGateGraph（814–837）拒空图/重复 id/未知依赖；findDependencyCycle（839–869）DFS 三色找环，needs 与 after 一起参与（854）。

调度是单进程手写循环 runGates（897–1008）：每轮 `while (running.length < maxActive)` 找第一个 ready 的 pending 启动（934–941，FIFO，故长门应排前，见 726 注释）；无新启动则 `Promise.race` 等任一子进程结束（976–983）；pending 且 needs 已失败时当场生成 skipped（955–972）；否则抛 `validated graph stalled`（958）。

并发度：defaultConcurrency（168–187）用 `node:os.availableParallelism()`（导入 10、默认参数 171）；ci-consumers 放开为 gate 总数（173，其内部还要嵌套跑子 runner），check-all/hygiene/doc-sync/doc-quick 封顶 4（176–186，注释：doc 门各自建整棵 ts.Program，不封顶会内存爆）；`DSH_GATE_CONCURRENCY` 覆盖（107–108、189–197），来源串在 114 行打印。

Node API：spawn/spawnSync（8）、readdirSync/readFileSync（9，读 /proc）、availableParallelism（10）、resolve（11）、performance（12），另有 AbortController、`process.kill(-pid)`、setTimeout/setInterval。**「bounded in-process scheduling」** = 934–941 容量闸 + 976 单点 race 等待 + 168–197 上限计算，全在同一 Node 进程内，不引入 worker/队列服务。

## C. 聚合与命令

注释 4–5 行：`Package scripts own public aggregate names; this runner owns their validated dependency graphs, scheduler environment, and process diagnostics.` 落地：package.json 77–91 每个聚合一行 `tsx scripts/run-gates.ts <mode>`，且非同名映射——`check:all`→check-all（77）、`check:ci`→ci-primary（78）、`test:docs`→doc-quick（116）、doc-sync/hygiene 同名（170–171）。**所以用户敲的是 `pnpm run check:all`，`pnpm run check-all` 并不存在。**

链路：pnpm→tsx→parseMode→gatesForMode（232–296）拼 Gate[]（每门最终仍是 `pnpm run <script>`，199–207）→defaultConcurrency→runGates→逐门 spawn→printSummary→只要存在非 allowFailure 的 failed/skipped 就 exit 1（118–120）。子进程不经 shell：pnpmInvocation（pnpm-invocation.ts 9–21）从 `npm_execpath` 推出 `process.execPath` + pnpm 入口，缺 npm_execpath 直接抛错。门本身仍是 package script，可单独 `pnpm run typecheck` 复现。

## D. 输出与诊断

收集（1073–1082）：stdout/stderr 均 `setEncoding('utf8')`，data 事件 push 进 `GateOutputChunk[]`（带 stream 归属）；仅 `streamOutput===true` 实时写父进程（1076、1080），否则缓冲到结束。

打印（1541–1557）：pass 且非 `DSH_GATE_VERBOSE=1` 只一行 `PASS label (x.xxs)`；其余打 `== STATUS label (s) ==` + `command: displayCommand` + `outcome:`，outcome 由 formatGateResultReason（1533–1539）把 error / `exit N` / `signal X` 三类事实全列出（缺省 `no exit code or signal`），互不遮蔽。汇总（1559–1577）：总 passed/failed/skipped + 总时长，再逐条列不成功门，allowFailure 加 `NON-BLOCKING` 前缀（1573）。

计时有（per-gate 1058/1274，聚合 113/117）；重试全文无；per-gate 超时也没有——只有中止路径上的分级宽限：SIGTERM 后 5s SIGKILL（1148）、8s 内确认整树静默否则打 `gate tree not quiescent after 8s`（1237–1262，报错在 1256）、10s 强断 stdio 防挂死（1160–1165）。coverage 的 vitest 超时（614）是传给子命令的参数而非看门狗。

**「process diagnostics」** = 子进程输出的归属与重放 + 退出码/信号/启动错误三类事实 + 进程树终止与静默确认（1091–1265）+ 并发来源与 fail-fast 原因行（114、988）。

## E. 环境与条件

开关（均环境变量）：`DSH_GATE_CONCURRENCY`（107）、`DSH_GATE_FAIL_FAST`（仅接受 '1'，684–689）、`DSH_GATE_VERBOSE`（1542）、`DSH_WEB_SNAPSHOT_WORKERS`（≥2，491–503，决定 test:web:ci 还是 test:web:built）、`DSH_OXLINT_THREADS`（575）、`DSH_NODE_COMPAT_SKIP_TYPECHECK`（348）、`DSH_COVERAGE_MAX_WORKERS`（601–609，按 2:1 切给 instrumented 与 exempt 两门）、`DSH_COVERAGE_PARTITIONS`（615–632，改走 partitioned script）、`DSH_COVERAGE_TEST_TIMEOUT_MS`（614）、`DSH_COVERAGE_EXEMPT_HEAVY`（coverage-exempt.ts:26，传给子进程的豁免标记）、`DSH_BUILD_CLIENT_PROFILE=official`（209–215）、`DSH_DOC_TYPECHECK_USE_BUILD_OUTPUT=1`（279、424、479）、`DSH_SNAPSHOT=replay` 与 `DSH_EXAMPLE_MODE=lib`（505–509、653、662）、`DSH_REQUIRE_BUILT_CLI_SMOKE`（398）。

平台/环境造成的「跳过」：runner 无运行期打 skip 的机制（skipped 只来自 fail-fast 与依赖链），条件性全在构造期——nodeCompatGates 在 `runningNodeMajor() !== 22` 时丢掉 build/build:web（351–365）；doc-quick 只取 `quick===true` 的叶子（776–778）；ci-windows-complete 把 observational 门标 allowFailure（526–537）。子命令内部自跳（如无 `DEEPSEEK_API_KEY` 的 e2e）不经过 runner，其实现**未验证**。

## F. 给 SSiD 的取舍（5–10 个检查脚本）

**只有大规模才需要的复杂度（别搬）**：① needs+after 双依赖与环检测（814–869）——它为「产物读者与写入者互斥」而生（447–461 的 dev:web 与产物读取、526–536 的两种 VitePress 模式同目录不可重叠）；② 手写并发调度 + availableParallelism 上限（168–197、934–941）——10 个门串行也就几分钟；③ fail-fast 的进程树终止体系（1091–1265、1377–1508：detached、`kill(-pid)`、Windows `taskkill /T`、后代采样缓存、SIGKILL 升级、静默确认、stdio 强断）——被 vitest worker / dev server / 编译器这类会留后代的子进程逼出来的；④ 十几个 `DSH_*` 开关与 allowFailure/streamOutput/quick 的多样语义；⑤ 嵌套 runner（464–467 的 ci-consumers 门里再跑 check:node-compat）。

**一开始就该有（形状可抄，实现可缩到约 150 行）**：① 单入口 + 白名单 mode 校验（134–159）；② 门表数据化、命令与展示名分离（47–63、199–207），并 shell-free 起进程（pnpm-invocation.ts）——Windows 上避开 shell 引号/转义坑；③ 依赖失败 ⇒ 下游 skipped，绝不误报 passed（957–972、1035–1046）；④ 逐门计时 + 明确退出码契约（113–120、1270），CI/发版脚本只认退出码；⑤ 失败打 displayCommand + exit/signal/error 三类事实（1533–1539、1549–1556），且每个门自带 `文件:行` 定位——BOM/旧名/vendor MD5 类门没有定位等于没跑；⑥ 每个检查一个独立脚本 + 稳定 script 名（77–91 与 4–5 行注释的约定），便于单独复现、单独入 CI 作业；⑦ 平台条件门用构造期过滤 gate 列表（351–365）而非运行期 skip 状态，少一个状态维度。

**落到 `check-rules` 的具体建议（未验证 SSiD 现有结构）**：profile vs template 逐键对比、BOM 扫描、旧名残留、vendor MD5 各做一个 `scripts/check-*.ts`，package.json 各一行 script，`check:rules` = 顺序跑 4 个并汇总退出码；只有 vendor MD5 依赖构建产物时才加一条 needs 边；门数上 10+ 或单轮超 2 分钟，再引入并发与 fail-fast。

## 本次补记：SSiD 侧真实结构核实结果

下列事实本次由本代理实际读取文件/目录核实（非推测），用于修正上节 F 中「未验证 SSiD 现有结构」一句。

**1. 壳库根目录没有 package.json。** `seek-soul-in-darkness/package.json` 不存在（glob 无结果，已核实）；脚本家在 `seek-soul-in-darkness/shell/`，该目录有 `package.json`（133 行，`name: ssid-shell`、`version: 0.2.1`、`private: true`、`type: module`）与 `scripts/`。

**2. `shell/package.json` 现有 scripts（第 8–16 行，逐字）**：`start`（`electron .`）、`typecheck`（`tsc --noEmit -p tsconfig.json`）、`smoke`（`node --import tsx/esm boot-smoke.ts`）、`test`（`node --import tsx/esm --test tests/profile-merge.spec.ts tests/codegraph-adapt.spec.ts`）、`test:profile-merge`、`test:codegraph-adapt`、`pack`（`npm run bundle-kernel && electron-builder --win`）、`bundle-kernel`（esbuild 打 `kernel.bundle.mjs`）、`pack:mac`。**运行器是 `npm run`，不是 pnpm**（`pack` 脚本第 14 行自证）。

**3. `shell/scripts/` 现有内容（已核实）**：`after-pack.cjs`、`boot-bundled.mjs`、`prepare-runtime.mjs`、`repack-open-sea-skin-vendor.mjs`、`verify-deploy-rename.mjs`；另有 `probes/` 下 4 个：`fake-worker.cjs`、`probe-worker-packaged.mjs`、`probe-worker-source.mjs`、`verify-pack.mjs`。

**4. `verify-deploy-rename.mjs`（72 行）是唯一的 verify 先例，且没有退出码契约（已核实）**：第 1–2 行是中文注释；第 7 行 `const base = fileURLToPath(new URL('./tmp-deploy-test', import.meta.url))` 建临时目录；第 38–39 行失败路径只 `console.log('  [FAIL] ...')` 后 `return false`；第 50/52 行把 `ok1`/`ok2` 打成「成功/失败」文本；第 64 行把预期内的失败打成「失败(符合预期)」；第 69 行固定打印 `ALL CHECKS DONE`；全文唯一的非零退出是第 72 行 `run().catch(...)` 里的 `process.exit(1)`，即只有未捕获异常才非零。**结论：脚本正常走完必然 exit 0，任何检查失败对 CI/发版都不可见。** 新的 check-rules 若沿用这一形状（中文注释 + 临时目录 + 逐场景 console.log），必须额外补上 F 节第 ④ 条的退出码契约：收集各项检查的通过/失败状态，失败时 `process.exitCode = 1`（或显式 exit 1），并让聚合脚本把子脚本退出码向上传递——否则「四份核」跑出红字也拦不住发版。

**5. 目标检查共四项（手册待办 #5）**：profile vs template 声明逐键对比、BOM 扫描、旧名残留、vendor MD5 四份核。

**6. 「vendor 四份」已核实为以下四个位置**（前三项本次实测存在；第 2、3 项为当前用户环境路径）：
- 源头：`seek-soul-in-darkness/plugins/<pkg>/lib/**`（已核实存在，如 `plugins/dsh-ssid-panels/lib/client.js`）
- `~/.dsh/profiles/web/vendor/<pkg>`（已核实存在；实测包集合：dsh-capture、dsh-context-doctor、dsh-dream-skin、dsh-quick-toolbar、dsh-ssid-panels、dsh-ssid-zh-ui）
- `~/.dsh/profiles/ssid/vendor/<pkg>`（已核实存在；实测包集合：dsh-capture、dsh-context-doctor、dsh-quick-toolbar、dsh-ssid-panels、dsh-ssid-zh-ui）
- `seek-soul-in-darkness/shell/profile-template/vendor/<pkg>`（已核实存在；实测目录含 dsh-capture、dsh-context-doctor、dsh-quick-toolbar、dsh-ssid-panels、dsh-ssid-zh-ui）

**注意（本次实测发现，供 check-rules 设计参考）**：四处 vendor 的包集合并不一致——`web` 比 `ssid` 多出 `dsh-dream-skin`，而 `profile-template` 与 `ssid` 的集合一致。因此「vendor MD5 四份核」不能简单地求四份全等：需要先确定「本应参与核对的包集合」与源头的对应关系（哪些包由 `plugins/<pkg>/lib/**` 派生、哪些是外部引入不参与四份比对），否则会把集合差异误报成 MD5 不一致。`dsh-dream-skin` 的归属规则本次未验证，建议在设计 check-rules 时一并确认。

**7. 对 F 节第 ② ⑥ 条的落地修正**：runner 与检查脚本应放 `shell/scripts/`（与该目录既有形状一致），聚合 script 进 `shell/package.json`（`npm run check:rules` 之类），命名风格沿用现有 `verify-*.mjs` / `check-*.mjs`；F 节第 ② 条提到的「shell-free 起进程」在 SSiD 侧的对应做法是 Node `spawn(command, args)` 直接起 `node`（不经 `sh`/`cmd`），`pnpmInvocation` 那套 `npm_execpath` 解析在 npm 环境下是否同样可用，本次未实测。
