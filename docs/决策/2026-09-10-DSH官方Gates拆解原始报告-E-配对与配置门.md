## 官方门禁拆解 · 报告 E：配对与配置校验门

本文件是子代理原始报告的存档，未做改写；正文行号均指 `DSHfork/scripts/` 下的对应文件。

# DSH Gates 双脚本精读报告

> 状态：记录（推断 · 2026-09-12）

## A. 两个脚本解决什么问题

| 脚本 | 一句话 | 触发条件 |
|---|---|---|
| `verify-translation-pairing.ts`（357 行） | 强制「英文源 `.md` ↔ 中文 `.zh.md` ↔ `.i18n.yaml` 哈希记录」三元组齐全、结构等价、且自上次确认后字节未单边漂移（顶注 L1-11） | `doc-sync` 的叶子门禁（L350 自述「still runs in doc-sync」）；pre-commit 用 `--cached` 走 git index（L6-8、L504） |
| `verify-cordis-config.ts`（564 行） | 校验 Cordis Loader 配置的条目元数据（只有 `disabled` 可含 `!!js`）与「配置引用的包是否在解析面 package.json 中声明」（顶注 L1-11） | `if (import.meta.main)` 守卫（L60），配置范围由 `cordisConfigFiles(root)`（L61）决定 |

## B. verify-translation-pairing 实现要点

- **配对定义 = 纯命名约定，不是 frontmatter**：`translationPairPaths(anchor)` 由英文锚点推出三件套（L109、L154）；`.i18n.yaml` 是两行 git blob 哈希记录（L230 正则提示 `<basename>: <40-hex>`，期望 40 位十六进制）。
- **缺失**：每个 in-scope 且未被排除的 `.md` 必须有 `.zh.md`（L186-193）；三者不齐报 incomplete（L216-220）。锚点取 `.zh.md` 与 `.i18n.yaml` 的**并集**，所以半边删除从任一残骸都能抓到（L198-200）。范围 glob 见 L79-84。
- **多余**：被 manifest 排除的文件若存在 `.zh.md`/`.i18n.yaml` 也报错（L211-215）。
- **不同步**：记录哈希与当前内容不符（L234-242）；链接指向错误语言（L252-268）；生成区（marker 分隔）规范化后必须逐段一致（L270-300）；zh 侧缺语言切换器（L304-309）；结构签名 diff（L310-327，覆盖列表种类/起始序号/表格行列）。
- **白名单/排除**：唯一机制是 `scripts/translation-pairing.manifest.json`，只含 `excluded` 数组（实测 13 行、9 条），目录项以 `/` 结尾表示整目录且不做前缀误匹配（L93-101）。没有「允许内容不同」的宽泛白名单，只有窄豁免（成对文档路径、locale 链接归一化）。
- **错误信息**：`${file}: 原因` 或 `${source} ↔ ${zh}: diff`；链接违规**带行号** `${violation.sourcePath}:${violation.line}`（L266）。每条都给动作指引（"bring the other side along, then re-record with --write"）。全部落 stderr、缩进两空格（L355-356）。
- **退出码/模式**：`--list` 状态表+计数、exit 0（L336-346）；`--write [pairs…]`/`--write --all` 记录哈希并写 sidecar、exit 0（L150-180）；`--cached` 走 index（L56-57）；参数错误 exit 2（L48-53）；违规 exit 1（L357）。

## C. verify-cordis-config 实现要点

- **校验对象**：条目元数据（`id/name/group/inject/intercept/isolate` 必须静态，L39；仅 `disabled` 可 `!!js` 且必须可解析——用 `new Script()` 只编译不执行，L534-543）+ 插件包解析。
- **读 package.json 作为权威：是**（`readManifest` L465-467），且按「谁消费」分解析面：apps/cli shipped 配置与 examples 用 `apps/cli/package.json` dependencies + 各 bundle dependencies（L232-248）；apps/cli/tests 用 deps+devDeps（L249-254）；各 bundle 的 patch 行从**该 bundle 自身** deps 解析（L257-265）；`packages/*/*/tests` fixture 从该包 deps/devDeps，并扫描 fixture 目录 `.ts/.mjs` 的 bare import（`ts.preProcessFile`，L335）。
- **两类错误**：本脚本只处理「**存在但没声明**」——`missingPluginDependencies`（L441-463）报 `${locations}: ${pkg} must be declared in ${owner}`；并带出 chooser 4 个运行期才暴露的后端包（L44-56、L456-458）。自引用豁免（L302、L384）。「声明了但不存在（装不上）」不由它负责（应属 runtime-closure/hygiene，未验证）。
- **schema/路径/默认值**：无通用 JSON Schema，是手写形状校验（root 必须数组 L65-67，递归 `group.config`/`insert`/`include.patches` L197-220）；**用 TypeScript 编译器 API 做路径解析**：读 `tsconfig.base.json` 的 `paths`，`ts.resolveModuleName` 要求本地包解析到 `.ts/.tsx`，否则判为 built `lib/` 回退（L399-439）。无默认值填充。
- 另有两条声明一致性：client 包 `exports["./client"]` ↔ `dsh.client` 双向一致（L104-117）；preset 行不得与 host composition 同行，考虑 overlay 的 disabled 撤回（L137-161）。
- **定位方式**：`${file}${path}`，path 是 JSON 式路径如 `[3].config[1].insert[0]`（L70、L199）；批量 stderr 后 `process.exitCode = 1`（L81-87），**不用 `process.exit()`**。

## D. 共有工程约定

- **入口**：translation 是顶层直接执行（无 main、无顶层 await、全同步）；cordis 用 `import.meta.main` 守卫（L60），以便 spec import 纯函数不触发门禁。
- **报错退出**：先攒 `errors: string[]` 再一次性打印（fail-soft 汇总，非首错即停）；translation 用 `exit(0/1/2)` 三态，cordis 用 `exitCode = 1`。成功也打印一行计数（L86、L351、L178）。
- **纯函数与 I/O 分离**：脚本顶层只做 glob/read 与编排，判定抽到具名函数或独立模块（`translation-pairing.ts`、`-record.ts`、`-git.ts`、`-links.ts`；`cordis-config-files.ts`、`cordis-yaml.ts`）。
- **空语料守卫**：cordis 显式 fail-loud：`found no package-owned Loader configs`（L319-321、L341-343）——门禁发现为空必须失败。
- **测试**：vitest（spec L10）。`translation-pairing.spec.ts` 9 组 describe、33 个 it，覆盖 git blob 存储/index 读取、manifest 解析、链接语言等价、记录 round-trip、结构签名、CLI 参数归一化、生成区标记；`verify-cordis-config.spec.ts`（155 行）9 个 it，直接 import 导出判定函数并用 `mkdtempSync` 造临时仓库。注意：`verify-translation-pairing.ts` **无同名 spec**，逻辑靠纯模块测。

## E. 可搬到 SSiD 的骨架

1. **双处声明一致性** → 套 C 的「引用集合 ↔ 权威清单」双向差集：解析 profile 与 template 得 `Map<pkg, Set<位置>>`，分别报「只在 profile」「只在 template」，位置带文件+JSON 路径。
2. **vendor 四份 MD5** → 套 B 的「哈希记录 + 显式豁免」：以权威副本为基准逐份比对；若想避免「四份同时被改」漏检，照 `--write` 先写一份 `.md5.json` 基线再比对。官方用 `gitBlobHash` 而非 MD5，SSiD 用 `crypto` MD5 等价。
3. **BOM 扫描** → 官方这两个脚本**都没有**（`scripts/*.ts` grep `uFEFF|BOM|byte-order` 零命中，`verify-*.ts` 名单里也无编码类门禁），需自写，但套其结构：读 Buffer 判前三字节 `EF BB BF`。

```ts
if (import.meta.main) {
  const errors: string[] = []
  const files = globSync([...])            // 统一 '\'→'/'
  if (files.length === 0) errors.push('scan found no manifests')   // 空语料即失败
  const prof = pluginMap('profile/.../profile.json')               // Map<pkg, loc>
  const tpl  = pluginMap('profile-template/.../profile.json')
  for (const [p, loc] of prof) if (!tpl.has(p)) errors.push(`${loc}: ${p} declared in profile but not in profile-template`)
  for (const [p, loc] of tpl)  if (!prof.has(p)) errors.push(`${loc}: ${p} declared in profile-template but not in profile`)
  const base = md5(read(VENDOR[0]))
  for (const f of VENDOR.slice(1)) { const h = md5(read(f)); if (h !== base) errors.push(`${f}: md5 differs from ${VENDOR[0]}`) }
  for (const f of [...json, ...ts]) { const b = readFileSync(f)
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) errors.push(`${f}:1: UTF-8 BOM`) }
  if (errors.length) { console.error('verify-ssid-gates:'); errors.forEach(e => console.error(`  ${e}`)); process.exit(1) }
  console.log(`verify-ssid-gates: ${files.length} files passed.`)
}
```
判定函数（`pluginMap`/`md5Mismatches`/`bomProblem`）导出，spec 用 vitest + `mkdtempSync` 测 6 类：正常、profile 缺项、template 缺项、BOM 命中、MD5 差异、空扫描 fail-loud。

## 未验证项

① 两脚本在 `run-gates.ts` 中的确切注册位置；② 「声明了但不存在」由哪个门禁负责；③ SSiD 的「vendor 四份」具体指哪四个位置。

## 本次补记

### 1. `.i18n.yaml` 哈希记录格式（父 agent 核实 + 本代理复核）

- **路径**：`<basename>.i18n.yaml`，与 `<basename>.md`、`<basename>.zh.md` 同目录；由 `translationPairPaths` 推导（`translation-pairing-record.ts` L31-40），反向由 `translationPairPathsFromMeta` 推导（L48-53）。
- **内容**：`renderTranslationPairingRecord`（L86-98）以 `join('\n')` 输出 **4 行 `#` 注释头 + 2 行哈希 + 1 个空行**，故文件以恰好一个换行结束。实测样本 `DSHfork/docs/api-gateway.i18n.yaml`：L1-4 为注释头（第 4 行是 `#   pnpm run verify-translation-pairing --write docs/api-gateway.md` 重录命令），L5 为 `<basename>.md: <40位hex>`，L6 为 `<basename>.zh.md: <40位hex>`。
  - 父 agent 原述为「3 行 `#` 注释头」；实测为 **4 行**，此处按实测记录（差异仅在注释头行数，机制描述无误）。
- **解析**：正则常量名为 **`META_LINE`**（非 `PAIR_META_LINE`），值 `/^([^:#]+\.md): ([0-9a-f]{40})$/`（L23）。`parseTranslationPairingRecord`（L62-77）跳过空行与 `#` 开头的行；任何非注释行不匹配该正则、key 重复（L70）、或最终哈希数不为 2（L75）都返回 `undefined`，即**malformed 而非静默缺失**，由门禁按「malformed consistency record」报错（`verify-translation-pairing.ts` L229-231）。
- **重录**：`--write <source>`（`verify-translation-pairing.ts` L150-180；渲染出的提示命令即 `pnpm run verify-translation-pairing --write <source>`，L94）。

### 2. vendor 四份副本：应实时直接比对，**不要照搬记录式哈希**

**记录式哈希存在的理由**：双语对的两侧内容**本来就不同**（英文原文 vs 中文译文），无法直接互比。记录式解决的是「两侧无法互比」——先把「上次确认一致时的两侧字节哈希」记下来，之后各自与记录比对，任一侧漂移即报警。

**SSiD 的 vendor 四份副本语义相反**：它们是**应当完全相同**的副本，因此可以直接互比，不存在「无法互比」这一前提。照搬记录式会带来两个坏处：

1. **有毒合法化通道**：记录式配套一条重录路径（`--write`）。若四份中有一份被误改后有人执行了重录，不一致会被永久合法化为「确认态」，门禁从此对这份差异沉默。直接比对没有这条通道——四份不一致就是不一致，无所谓「上次确认过」。
2. **纯负担**：记录式需要额外维护 4 份（或 1 份基准）sidecar 文件与重录流程，还引入「基线本身可能是错的」这一新失效模式；对「应当完全相同」的副本毫无收益。

**建议做法**：以一份**权威副本**（例如 `profile-template` 下那份，或 npm 上架所用的那份）为基准，其余三份实时逐字节/MD5 比对，不写 sidecar、不提供重录入口。若确实需要固化基准值，应使用外部固化值（架构约定、上一版本的归档产物），而不是「上次跑门禁时看到的字节」——后者正是记录式哈希的固有风险，也正是这里不该沿用的部分。

**一句话**：记录式是给「两侧本就不同、必须记住共同确认态」的双语对用的；vendor 四份是「本就相同、可以当场互证」的副本，套用记录式既多余又会打开合法的漂移缺口。
