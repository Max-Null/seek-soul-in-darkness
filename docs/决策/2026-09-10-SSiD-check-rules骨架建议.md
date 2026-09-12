# SSiD check-rules 骨架建议（对标官方 Gates）

日期：2026-09-10　对应手册待办 #5、#9

## 0. 输入与边界

本文的输入是官方仓库 `DSHfork`（= `deepseek-ai/deepseek-harness`）`scripts/` 下 55 个
`verify-*` 门脚本与 1583 行编排器 `run-gates.ts` 的精读结果，报告原文见：

- `docs/决策/2026-09-10-DSH官方Gates拆解原始报告-E-配对与配置门.md`（`verify-translation-pairing.ts`、`verify-cordis-config.ts`）
- `docs/决策/2026-09-10-DSH官方Gates拆解原始报告-F-run-gates编排.md`（`run-gates.ts`）

结论对 SSiD 侧的真实结构做了核实：SSiD 壳库根目录**没有** `package.json`，脚本家在
`seek-soul-in-darkness/shell/`，运行器是 `npm run`。本文所有落点均按此写。

本文只给骨架与判定契约，不含实现代码。

## 1. 官方 Gates 的形状（结论先行）

| 维度 | 官方实测 | SSiD 应否照搬 |
|---|---|---|
| 门数量 | 55 个 `verify-*` 门脚本（`scripts/` 下共 210 个文件） | 否，四项检查 |
| 编排器 | `run-gates.ts` 1583 行 / 17 个聚合 mode | 否，约 150 行 |
| 依赖 | `needs`（强）+ `after`（弱）+ DFS 环检测 | 否 |
| 调度 | 单进程手写容量闸 + `availableParallelism()` 上限 | 否，四个门串行 |
| 失败处理 | fail-fast + `kill(-pid)` 进程树终止 + 静默确认 | 否 |
| 开关 | 十余个 `DSH_*` 环境变量 | 否 |
| 空语料 | 显式 fail-loud | **是** |
| 每门自测 | 每个 gate 配 `.spec.ts` | **是** |
| 失败定位 | 每条违规自带 `文件:行` | **是** |

官方那 1583 行不是设计过剩，是被"55 个门 + vitest worker + dev server 这类会留下后代的
子进程"逼出来的：`needs`/`after` 双依赖存在的理由是同目录产物的读者与写入者互斥
（`run-gates.ts:447-461`、`526-536`），进程树终止体系存在的理由是子进程会留后代
（`1091-1265`）。SSiD 四个检查脚本都读完几十个文件就退出，串行耗时以秒计，上述机制一件都用不上。

## 2. 落点

```
seek-soul-in-darkness/shell/
├── package.json                 # 增加 5 行 scripts
└── scripts/
    ├── check-rules.mjs          # 编排器（四项都就绪后再建）
    ├── check-vendor-sync.mjs
    ├── check-profile-sync.mjs
    ├── check-bom.mjs
    ├── check-legacy-names.mjs
    └── check-rules.manifest.json   # 例外清单（白名单式）
```

沿用 `.mjs` 而非官方的 `.ts`：`shell/scripts/` 现有五个脚本里四个是 `.mjs`
（`boot-bundled.mjs`、`prepare-runtime.mjs`、`repack-open-sea-skin-vendor.mjs`、
`verify-deploy-rename.mjs`），另一个 `after-pack.cjs` 是 electron-builder 的钩子。
检查脚本不需要类型，保持形态一致就不必让 `scripts/` 依赖 `tsx`。

**`verify-deploy-rename.mjs` 是一个要避开的先例。** 它 72 行里逐场景 `console.log`，
失败只打 `[FAIL]`，进程仍以 0 退出，结尾固定打 `ALL CHECKS DONE`。这种形状供人肉阅读，
无法挂 pre-push 或发版前置——CI 与发版脚本只认退出码。新脚本从第一个起就必须把
"发现问题 ⇒ 非零退出"写死。

## 3. 四项检查的判定契约

### 3.1 check-vendor-sync：vendor 四份一致

手册 §10 定义的同步链是四份：

```
1. seek-soul-in-darkness/plugins/<pkg>/lib/**        源头
2. ~/.dsh/profiles/web/vendor/<pkg>                  运行时（web）
3. ~/.dsh/profiles/ssid/vendor/<pkg>                 运行时（ssid）
4. shell/profile-template/vendor/<pkg>               发版基准
```

适用范围要显式声明，不能对所有 vendor 条目一律比，而且**源头未必在 SSiD 仓库内**。
已核实 SSiD 仓库根的 `plugins/` 下有三个包，但只有两个是现行源头：

| 包 | 源头 | 可比份数 |
|---|---|---|
| `dsh-ssid-panels` | `seek-soul-in-darkness/plugins/dsh-ssid-panels/lib` | 四份 |
| `dsh-ssid-zh-ui` | `seek-soul-in-darkness/plugins/dsh-ssid-zh-ui/lib` | 四份 |
| `dsh-quick-toolbar` | `max-null-plugins/dsh-quick-toolbar/lib`（**仓库外**） | 四份，源侧不在本仓 |
| `dsh-capture` | `max-null-plugins/dsh-capture/lib`（仓库外） | 三处 vendor 互比 |
| `dsh-context-doctor` | 上游固化，无本地源头 | 三处 vendor 互比 |

`seek-soul-in-darkness/plugins/dsh-quick-toolbar` 曾是该插件 2026-08-30 迁出独立时
未清理的残留：停在 0.1.0，落后现行 0.8.6 七个小版本，且全仓没有任何脚本引用它。
它若被当作源头写进 manifest，`check-vendor-sync` 会稳定报三个假红。该残骸已于
2026-09-10 删除（见 §6），实测数据见 §7。

**不要照搬记录式哈希。** 官方 `.i18n.yaml` 采用"记录上次确认一致时的 git blob 哈希"，
是因为双语对两侧内容本来就不同，没有可比的第二份。SSiD 的四份是**应当完全相同**的副本，
直接实时比对即可；若引入记录文件，它自己就变成第五个需要同步的东西。

**哈希对象是文件集合，不是目录。** 已核实两个内置插件的同步语义并不相同：

- `dsh-ssid-panels`（源 21 文件 / vendor 21 文件）与 `dsh-ssid-zh-ui`（5 / 5）：
  源目录与 vendor 副本**逐文件全等**，连 `src/`、`tests/`、`docs/` 都同步。
- `dsh-quick-toolbar`：源（`max-null-plugins/`）43 文件，vendor 只有 5 个——vendor 是
  **精简副本**，只含 `lib/`、`cordis.patch.yml`、`package.json`；源码、测试、截图、
  `README`、`LICENSE` 都不进 vendor。整目录比对会报 **40 处差异，其中只有 1 处是真信号**
  （vendor 侧多出的旧脚本 `verify-header-unify.cjs`），其余 39 处是"源侧有而 vendor
  本就不需要"。

所以比对面必须按包声明，不能一律要求"整目录摘要相等"。正确做法是逐文件建
`相对路径 → 内容哈希` 映射再比，差异分三类输出：

- 只在源侧存在 → 未同步
- 只在 vendor 侧存在 → 多余文件
- 两侧都有但内容不同 → 漂移

文本文件在报差异时给出**第一处不同的行号**，二进制给文件级。这一点是官方门禁里
"每条违规自带 文件:行 定位"的直接落地，没有定位的漂移报告等于没跑。

哈希用 `node:crypto` 的 `sha256`。手册写的是习惯叫法"MD5"，实现不必跟着弱算法走，
但文档与错误信息里要把用词统一（建议统一为"指纹"）。

比对面写进 manifest，采用官方"只列排除项"的白名单风格（`verify-translation-pairing.ts:93-101`
的目录项以 `/` 结尾做边界，同款写法）：

```json
{
  "packages": {
    "@max-null/dsh-ssid-panels": {
      "source": "../../plugins/dsh-ssid-panels",
      "include": ["lib/**", "package.json", "cordis.patch.yml"],
      "exclude": ["**/*.map", "**/*.tsbuildinfo"]
    }
  }
}
```

### 3.2 check-profile-sync：profile vs template 声明

比对面：`shell/profile-template/package.json`（发版基准，A 侧）对
`~/.dsh/profiles/ssid/package.json`（运行时，B 侧），取两个字段：

- `dependencies`（包名 → 版本，版本是精确 pin 无 `^`）
- `dsh.profile.bundles`（数组）

判定四条：

1. 只在 A 有 / 只在 B 有 → 报告差异，并注明方向。手册 §4 记的实测是：只改 B 不改 A，
   部署后 B 会被归档包版本覆盖——所以"B 落后于 A"是可预期的稳态，"B 超前于 A"才是
   下一次发版会踩的坑。两个方向都要报，但文案要区分。
2. 同名不同版本 → 报告，这是最高频的失配形态。
3. A 侧 `dependencies` 里每个 `file:./vendor/<X>` 指向的目录必须存在。
4. `dsh.profile.bundles` 的每一项必须在 `dependencies` 里声明。这是官方
   `missingPluginDependencies`（`verify-cordis-config.ts:441-463`）的差集模式：
   遍历引用、按包名归集引用点，`packageName in dependencies` 才算通过，否则报
   `<引用位置>: <package> must be declared in <dependencyOwner>`——**违规信息里同时带
   引用位置与责任文件名**，这正是 §3.1 要求的那种定位。反方向不查：`dependencies` 里
   多出来的 MCP 包（如 `@playwright/mcp`、`@astudioplus/codegraph-mcp`）本就不注册为 bundle。

必须在构造期排除内核族 `@deepseek-ai/dsh*`：dev 源码模式下 profile 声明**不包含**内核族
（手册 §5.1），拿它跟 template 比必然假红。

**只比 ssid，不比 web。** `~/.dsh/profiles/web` 是 web 开发环境，依赖集与 ssid 不同
（已核实两侧 vendor 目录内容就不同：web 多一个 `dsh-dream-skin`）。受检 profile 列表由
manifest 声明；声明的 profile 目录不存在时报错，不静默跳过。

### 3.3 check-bom：BOM 扫描

判定：文件前三字节为 `EF BB BF`。

范围（都是被 node 读的文本）：`shell/profile-template/**/*.{json,yml,yaml}`、
`~/.dsh/profiles/{ssid,web}/*.{json,yml,yaml}`、SSiD 仓库内被 node 读的 JSON。
排除 `node_modules/`、`lib/`、`dist*/`、`build/`。

必要性有实测支撑：手册 §4 记 PowerShell 5.1 的 `Set-Content -Encoding UTF8` 会写 BOM，
`readProfileManifest` 直接崩。这类故障面大而检查成本极低。

官方 `scripts/` 下没有任何 BOM 检查（`verify-translation-pairing.ts` 与 `verify-cordis-config.ts`
都没有），这一项要自写，结构照官方风格即可：Buffer 前三字节判定 + 空语料 fail-loud。

### 3.4 check-legacy-names：旧名残留

**这一项的关键是划对硬/软边界。** 全仓 grep `header-unify` 命中 79 处，其中绝大多数在
`docs/决策/**` 与 `docs/release-notes-*.md` 里，是合法的历史叙述（"原 dsh-header-unify"）。
用黑名单式全仓扫描，79 条噪声会立刻摧毁这条规则的可信度——而官方门禁的通行做法正是
**显式分类允许名单**而不是黑名单。

硬残留域（应为零，且**用结构化解析而非扫描文本**）：

- `shell/profile-template/package.json` 的 `dependencies` 键与 `dsh.profile.bundles` 项
- `~/.dsh/profiles/*/package.json` 同上
- `cordis.patch.yml` 里各条目的 `id` / `name`
- `plugins/`、`vendor/` 下的**目录名**

软残留域（合法，豁免）：`docs/决策/`、`docs/release-notes-*.md`、以及代码注释中的
「（原 X）」叙述。豁免按路径前缀走白名单。

改名表带归一化，因为旧名有多个变体（`dsh-header-unify` / `@max-null/dsh-header-unify` /
`header-unify`），比对前去掉 scope 与分隔符：

```json
{
  "renames": [{ "from": "dsh-header-unify", "to": "dsh-quick-toolbar", "at": "2026-08-30" }],
  "hardScopes": ["shell/profile-template/package.json", "~/.dsh/profiles/*/package.json", "**/cordis.patch.yml", "dirName"],
  "exemptPathPrefixes": ["docs/决策/", "docs/release-notes-"]
}
```

**首个实测命中。** `shell/profile-template/vendor/dsh-quick-toolbar/verify-header-unify.cjs:77`
是一条钉住旧包名的断言：

```js
check('handoff.id 为 @max-null/dsh-header-unify', global.__handoff.id === '@max-null/dsh-header-unify', global.__handoff?.id)
```

而它 `eval` 的同目录 `lib/client.js:399` 早已用新名注册（`id: "@max-null/dsh-quick-toolbar"`）。

实测 `node verify-header-unify.cjs`：进程 exit 1，但**不是在断言处失败的**——它在更早的
`new MutationObserver(...)`（`client.js:1276`）处就抛 `ReferenceError: MutationObserver is not defined`。
脚本内建的假 window 停留在 0.1.0 版 client.js 所需的最小集合上，没有跟上新版，
这条旧名断言永远到不了。

所以该文件的真实状态是**废弃的回归测试**：它不再保护任何东西，留在目录里只会让
旧名残留检查多出一条噪声（已于 2026-09-10 删除，见 §6）。它同时是 §3.1 那类漂移的
产物——源侧的对应文件已改名 `verify-quick-toolbar.cjs` 并随新版同步，vendor 侧留下的是
0.1.0 时代的旧脚本。这说明旧名并不总在配置声明里，也可能钉在测试断言里，
而**只在配置里查旧名会漏掉它**。

### 3.5 一条适用于所有检查的判据：别做"变更探测器"

来源：`superpower-writing-skills` 的附带参考 `writing-good-tests.md`（DSH 生态移植版：[JasonFreeLab/dsh-superpowers](https://github.com/JasonFreeLab/dsh-superpowers)，上游为 obra/superpowers）。它讲的是**测试**，两条原则：

> 1. Every test names the break it catches（每个测试都要说出它捕获的那个断裂）
> 2. Every test exercises the real thing（每个测试都要演练真实的东西）

其中一条否决很锋利：

> **No change detectors.** 如果只有**有意的决策**能让测试失败——一个常量的值、**确切的措辞**、私有结构——那么它**会在重新设计时触发，却在 bug 面前睡觉**。应该测**依赖那个决策的行为**：不是 `expect(MAX_RETRIES).toBe(5)`，而是"失败的调用被重试 5 次，且第 6 次永不发生"。

**边界声明**：门禁**不等同于**测试。门禁强制一个约定，测试捕获一个 bug——目的不同，所以上面那套判据**不直接适用于门禁**。

**但有一条启发值得对照**：

> **一个只会在"有意变更"时报警的门禁，是在追着变化跑，而不是在防真问题。**

按这条逐项对照四项检查：

| 检查 | 报警时的成因 | 判定 |
|---|---|---|
| §3.1 vendor 四份核 | 改了源头忘同步 / 改了一处漏别处——**内容是应然的契约** | 不是变更探测器 |
| §3.2 profile vs template | 声明失配（手册 §4 实测过的坑） | 同上 |
| §3.3 BOM 扫描 | 字节级污染导致解析崩溃，属事故 | 同上 |
| **§3.4 旧名残留** | **改名是有意的显著变更** | **最接近变更探测器的一项** |

前三项防的是"事情坏了"，第四项防的是"措辞不干净"——**所以只有第四项需要额外小心**。

**它需要小心的具体形态是退化成全仓文本扫描**。一旦变成"任何地方出现旧字符串就报警"，它会稳定命中 `docs/决策/**` 与 `docs/release-notes-*.md` 里的合法历史叙述（实测 79 处），而**这些命中恰好都是有意保留的**——那就是变更探测器的定义。

**免除办法本文件 §3.4 已经给出**：只检查"**引用会不会失效**"，不检查"措辞是否干净"——

- **硬域**：profile 声明、`cordis.patch.yml` 的 `id`/`name`、目录名——旧名在这里会导致**运行失败**
- **软域**：历史文档与注释中的「原 X」叙述——旧名在这里**只是历史**

**一句话判据**：门禁应当回答"**这样写会不会坏**"，而不是"**这样写是否够新**"。

## 4. 编排器 check-rules

四项检查各自是独立脚本 + package.json 里一行稳定 script 名（官方约定：
`Package scripts own public aggregate names; this runner owns their validated dependency graphs`），
编排器只做四件事：

1. 单入口 + 白名单 mode 校验。`node scripts/check-rules.mjs [all|vendor-sync|profile-sync|bom|legacy-names]`，
   非法值抛错并回显全部合法值（`run-gates.ts:134-159` 的形状）。
2. 门表数据化，命令与展示名分离：`{ id, label, script }`。
3. 顺序执行 + 逐门计时 + 输出缓冲。
4. 退出码契约：任一失败 ⇒ exit 1。

失败输出按官方 `formatGateResultReason`（`run-gates.ts:1533-1539`）把三类事实全列出、互不遮蔽：
`error` / `exit N` / `signal X`。汇总区逐条列不成功的门。

`shell/package.json` 增加：

```json
"check:rules":        "node scripts/check-rules.mjs",
"check:vendor-sync":  "node scripts/check-vendor-sync.mjs",
"check:profile-sync": "node scripts/check-profile-sync.mjs",
"check:bom":          "node scripts/check-bom.mjs",
"check:legacy-names": "node scripts/check-legacy-names.mjs"
```

每个门保留独立 script，便于单独复现、单独接入钩子。规模上四个门串行秒级完成，
不需要并发调度；门数到 10 个以上、或单轮超过两分钟，再考虑引入官方那套并发与 fail-fast。

**平台条件门用构造期过滤 gate 列表，不用运行期 skip 状态**（`run-gates.ts:351-365`）：
少一个状态维度，也少一处"看起来跑了其实跳过了"的假绿。

## 5. 明确不抄的部分

| 官方机制 | 位置 | 不抄的理由 |
|---|---|---|
| `needs` + `after` 双依赖与环检测 | `814-869` | 为同目录产物的读者/写入者互斥而生；SSiD 四门之间无产物依赖 |
| 手写并发调度 + `availableParallelism` 上限 | `168-197`、`934-941` | 官方封顶 4 是因为多个 doc 门各自建整棵 `ts.Program` 会爆内存；SSiD 无此负载 |
| fail-fast 进程树终止体系 | `1091-1265` | 被 vitest worker / dev server 逼出来的；SSiD 门不留后代 |
| 十余个 `DSH_*` 开关 | 全文 | 配置面就是理解成本 |
| 嵌套 runner | `464-467` | `ci-consumers` 门里再跑子 runner，SSiD 无对应结构 |

## 6. 待人工确认

1. ~~两处残骸的处置~~ **已处置（2026-09-10）**：
   - `seek-soul-in-darkness/plugins/dsh-quick-toolbar/`（整个目录，6 个 git 跟踪文件）
   - `shell/profile-template/vendor/dsh-quick-toolbar/verify-header-unify.cjs`
   
   删除前确认随目录一并删掉的设计文档在上游有同一份（`max-null-plugins/dsh-quick-toolbar/doc/设计/`，
   SHA256 均为 `1B397F5B…`，6158 字节），无信息损失。清理后重跑比对：三处 vendor 与
   `max-null-plugins/` 源头零差异，"仅在 vendor 侧存在"由 1 归零，vendor 回到 4 文件的精简副本。
2. 比对面是否需要 `exclude` 掉 `src/`、`tests/`、`docs/`——取决于"四份一致"是按可运行产物
   定义还是按整个包目录定义。手册说的是"MD5 四份一致"，未界定比对面。
3. `~/.dsh/profiles/web` 是否也要有 template 基准（当前 web 与 ssid 的 vendor 包集合不同）。
4. 指纹算法是否接受从手册所称 MD5 换为 sha256。
5. `dsh-capture`（源头在 `max-null-plugins/dsh-capture`）与 `dsh-context-doctor`（第三方固化）
   是否纳入 §3.1 的"三处互相一致"子集。
6. ~~`shell/profile-template/vendor/README.md` 两处过时~~ **已修正（2026-09-10）**：条目标题
   的旧名改为 `dsh-quick-toolbar`；`dsh-genui` 条目改为反映现状（经 npm 声明 0.9.8、
   vendor 目录下已无该包）。仍待定的是**边界问题**：`vendor/README.md` 这类描述性标题
   要不要纳入旧名检查的硬域？当前建议归软域（人工维护），因为它是叙述而不是配置声明。

## 7. 首次体检实测（2026-09-10）

在写任何检查脚本之前，先按 §3.1 的判定手工跑了两轮比对（lib 面四份核、整包目录源对
vendor；逐文件 sha256，排除 `node_modules`、`.git`、`*.log`、`*.tsbuildinfo`）。
这既验证了判定契约可落地，也给出了当前基线：

**lib 面（四份核）**：

| 包 | 源侧 | 三处 vendor | 差异 |
|---|---|---|---|
| `dsh-ssid-panels` | 3 | 3 / 3 / 3 | **0** |
| `dsh-ssid-zh-ui` | 2 | 2 / 2 / 2 | **0** |
| `dsh-quick-toolbar` | 2 | 2 / 2 / 2 | **3（全部文件）** |

**整个包目录（源 vs `profile-template/vendor`，残骸清理前）**：

| 包 | 源 | vendor | 仅在源侧 | 仅在 vendor | 内容不同 |
|---|---|---|---|---|---|
| `dsh-ssid-panels` | 21 | 21 | 0 | 0 | 0 |
| `dsh-ssid-zh-ui` | 5 | 5 | 0 | 0 | 0 |
| `dsh-quick-toolbar`（源取 `max-null-plugins/`） | 43 | 5 | 39 | 1 | 0 |

`dsh-ssid-panels` 与 `dsh-ssid-zh-ui` 四份全绿，说明现行同步纪律在执行中确实有效，
检查一旦建立就有真实基线可守。

`dsh-quick-toolbar` 的 lib 面三个红全是 manifest 源头写错，不是真的漂移：

```
把 seek-soul-in-darkness/plugins/dsh-quick-toolbar/lib 当源头：
  DIFF client.js    src=74F19FCD  tpl/web/ssid=1FF6630F
  DIFF index.js     src=MISSING   tpl/web/ssid=C0E9D4DA
  DIFF index.mjs    src=00620466  tpl/web/ssid=MISSING
把 max-null-plugins/dsh-quick-toolbar/lib 当源头：
  三处 vendor 零差异
版本：SSiD 残骸 0.1.0 ／ max-null-plugins 与三处 vendor 均 0.8.6
```

全目录那一行给出另一半结论：源 43 文件对 vendor 5 文件，39 处"仅在源侧"全部是按设计
不进 vendor 的内容，唯一真信号是仅在 vendor 侧的 `verify-header-unify.cjs`——直接比
"整目录摘要"的噪声比是 **40:1**，这正是 §3.1 要求把 include/exclude 写进 manifest 的理由。
而 lib 面那三个 DIFF 里有两个是文件命名变化（`index.js` ↔ `index.mjs`），目录级摘要
只会把它们显示成一个无法定位的红。

残骸清理后重跑同一比对：`A=43 B=4 onlyA=39 onlyB=0 contentDiff=0`——"仅 vendor 侧存在"
归零，vendor 回到 4 文件的精简副本，三处 vendor 的 lib 与源侧零差异。

同时确认 §3.2 的一个前提：`~/.dsh/profiles/web/vendor` 与 `ssid/vendor` 的包集合不同
（web 多一个 `dsh-dream-skin`），所以 profile 侧的受检对象只能是 ssid。

## 8. 落地顺序

1. `check-vendor-sync`——手册 §10 的硬性要求，与待办 #1 `sync-vendor.cjs` 互为对偶
   （一个负责同步，一个负责验证）。
2. `check-profile-sync`——手册 §4 实测踩过的坑，失配频率第二高。
3. `check-bom`——实现最简，故障面最大。
4. `check-legacy-names`——先定硬/软边界，并处理 §6 第 1 项的待确认。
5. 四个都跑通后再建 `check-rules.mjs` 编排器。

前两项之间有共享代码的诱惑（列文件、算指纹、定位差异），但建议先各自独立；
真正需要从第一个脚本起就统一的只有**报告格式**（`文件:行` + 三类事实 + 退出码非零），
它值得抽一个约 40 行的 `scripts/lib/gate-report.mjs`。

每项检查都配一个自测（官方是每 gate 一个 `.spec.ts`）。既然检查脚本本身是 `.mjs`，
自测也用 `.mjs`，`node --test scripts/*.spec.mjs` 直接可跑，不必引入 `tsx`。
`shell/package.json` 现有测试脚本之所以带 `node --import tsx/esm`，是因为它跑的是
`.ts` 用例（`--test tests/profile-merge.spec.ts tests/codegraph-adapt.spec.ts`），
且用例是逐个列出的——新增自测时按同样方式显式登记，别用通配符收进来。
自测同样要遵守官方那条纪律：**一个只在单独运行时才通过的测试是缺陷**——
凡是占用临时目录或子进程的自测都要自己收尾。`verify-cordis-config.spec.ts` 的写法是
每个用例 `mkdtempSync` 建独立临时目录、在 `finally` 里 `rmSync` 清理（L52/L70、
L113/L141、L146/L152），并断言精确的错误字符串。
