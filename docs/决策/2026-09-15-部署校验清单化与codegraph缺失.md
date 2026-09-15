# 部署校验清单化：新机缺 @astudioplus/codegraph-mcp 的上游成因

> 状态：**已修复**（部署完整性校验由单点 `existsSync` 改为四项必需路径清单；随 v0.3.2 出包）
> 关联：手册 §7 坑 #31、`docs/决策/2026-09-15-MCP条目CLI缺失拖死启动修复.md`

## 一、现象

新机器（zip 免安装版、全新用户目录）首次启动失败，splash 报：

```
ssid: plugin tree failed to load: failed to apply loader entry mcp-codegraph
(@deepseek-ai/dsh-mcp-client): invalid config:
  ... but got {"serverName":"codegraph","transport":"stdio","cwd":"D:\\AI center",
  "command":"...\\resources\\node\\node.exe",
  "args":[null,"--exclude","node_modules", ...], ...}
```

用户已确认拿到的是 **0.3.1 的 zip**。因此该机运行环境里根本没有
`@astudioplus/codegraph-mcp`，壳的 `existsSync` 判为缺失、不注入 `SSID_MCP_CG_CLI`，
`args[0]` 求值为 `null`（JSON 化后即 `null`），`dsh-mcp-client` 的 schema 要求 `string[]`，
整棵插件树加载失败。

上游成因需要单独回答：**归档里有这个包，为什么落到用户 profile 里就没了？**

## 二、根因

部署在原子落位前只做一次完整性校验，而那个校验点的位置远在归档尾部之前：

| 归档内路径 | 条目序号（共 73775） | 占位 |
|---|---|---|
| `@playwright/mcp/cli.js` | #53545 | 72.6% |
| `@max-null/dsh-memory/package.json`（**原唯一校验锚点**） | #60793 | 82.4% |
| `@deepseek-ai/dsh/package.json` | #68401 | 92.7% |
| `@astudioplus/codegraph-mcp/bin/codegraph-mcp.js` | #71539 | 97.0% |

机制：归档是逐条目顺序写入的单一 tar.gz 流，**解压在 82%～97% 之间中断或部分失败时，
那次 `existsSync` 仍返回 true**，部署被当作成功、`.deploy.new` 换名落位，
于是留下的 profile 是「头部齐、尾部缺」——`@max-null/dsh-memory` 在，
`@astudioplus/codegraph-mcp` 与全部 `.bin` 不在。缺的恰好是 MCP 条目 `args[0]` 依赖的 CLI，
下游症状即第一、二节描述的启动失败。

**证据等级**：归档条目布局（四个行号）、校验代码位置、以及本次修复后的清单落位均为**实测**；
「该机解压确曾中断」是**机制推断**——新机的 `~/.ssid/ssid.log` 与 profile 实体不在本机，
触发条件本身未经现场直证（见第六节）。

## 三、已排除的假设

| 假设 | 判据 |
|---|---|
| 归档里根本不含该包 | 0.3.0 与 0.3.1 两份归档都含该包全套条目（含 `bin/codegraph-mcp.js` 与 `.bin` 启动器），实测枚举确认 |
| pnpm 发布年龄策略跳过 | `shell/profile-template/pnpm-workspace.yaml` 为 `minimumReleaseAge: 0`（发布年龄保护关闭） |
| 平台条件分支排除 | 该包 `os` 含 `win32`、`cpu` 含 `x64`，且 `pnpm-workspace.yaml` 的 `allowBuilds` 已放行它的构建脚本 |
| 只有 optional / peer 声明 | `shell/profile-template/package.json` 是硬 `dependencies` 声明（pin `0.20.1`），lockfile 内有实体条目 |
| 部署期 `pnpm install` 失败 | 部署是纯 `tar` 解压 + 原子换名，**不跑 pnpm**；`pnpm install` 只发生在构建机的归档生成阶段 |

## 四、修复

**1. `shell/main.mjs` 部署校验清单化。** 原子落位前的校验从单点判定改为四项必需路径逐项判定：

```js
const requiredPaths = [
  ['@deepseek-ai', 'dsh'],                                      // 内核本体
  ['@max-null', 'dsh-memory'],                                  // 内置记忆插件
  ['@playwright', 'mcp', 'cli.js'],                             // mcp-playwright 条目的 args[0]
  ['@astudioplus', 'codegraph-mcp', 'bin', 'codegraph-mcp.js'], // mcp-codegraph 条目的 args[0]
]
const missingPaths = requiredPaths.filter(
  (segments) => !existsSync(join(tmpDir, 'node_modules', ...segments)),
)
if (missingPaths.length > 0) {
  throw new Error(`解压结果缺少必需路径：${missingPaths.map((s) => s.join('/')).join('、')}，部署中止`)
}
```

实现要点：

- **清单必须覆盖归档尾部**。取归档里最靠后的必需路径作为锚点：`codegraph-mcp.js` 在 97.0% 处，
  高于此前的 82.4%，把「解压中断而校验通过」的窗口从约 18% 压到约 3%。
- **清单条目选「缺失就会拖死启动」的路径**，而不是随手取一个浅层路径：两个 MCP 条目的
  `args[0]` 来源与内核锚点都属此列（`@max-null/dsh-memory` 得以保留，因为它同时回答
  「闭包是否解压过」）。
- 归档条目名与 `existsSync` 的相对路径逐段一致，四项都落在 `node_modules/` 下的同构位置。

**2. `shell/scripts/verify-release.mjs` 补发版抽查。**

```js
const EXPECT_PRESENT = ['@playwright/mcp', '@astudioplus/codegraph-mcp']
```

此前的必查清单只列 `@playwright/mcp`，而它的占位是 72.6%、codegraph 是 97.0%——
发布前抽查**结构性看不见**更靠后的那个包，本次缺失因此从未在发版环节被拦下。两项并列后，
归档里任一 MCP 依赖包的缺失都会让抽查判违规。

## 五、验证

1. **归档清单定位（未解包，`tar -tzf` 枚举 73775 条）**：四项必需路径分别落在
   #53545 / #60793 / #68401 / #71539，确认清单覆盖到归档 97% 处，且 `codegraph-mcp.js`
   就是其中最后一项。
2. **归档内路径存在性**：按精确条目名逐项复核四项路径在归档清单中均可命中；
   整包提取 `@max-null/dsh-memory/package.json` 与 `@astudioplus/codegraph-mcp/bin/codegraph-mcp.js`
   均成功，二者可并存于同一次提取。
3. **规则门**：`node shell/scripts/check-rules.mjs` 实测 6/7 门通过（profile-sync / bom /
   legacy-names / loader-external / plugin-peers / dsh-clean）；唯一红项是 `vendor-sync`——
   `dsh-ssid-panels/release-notes.md` 的 `src` 与 `web` 副本内容漂移（指纹 `d080e786` vs `12a3b29c`），
   属既有状态，与本修复无关。
4. **发版抽查清单**：`verify-release.mjs` 的 `EXPECT_PRESENT` 已含两项，§5-6 一节的判定按
   「必查包全在才判通过」执行。

## 六、遗留

- **触发条件未现场直证**：新机的 `~/.ssid/ssid.log` 与 profile 实体拿不到，故「解压确曾中断」
  仍是机制推断；将现场两份材料收回后即可把结论升到确证。现场取证签名：profile 内
  `node_modules/@max-null/dsh-memory` 存在而 `node_modules/@astudioplus` 不存在。
- **解压中断之外仍未排除的场景**：用户抽样解压 zip 后直接运行、解压途中机器休眠/断电、
  磁盘空间不足导致尾部写入失败。四项清单把这些场景一并拦在部署阶段，但**不区分**它们，
  归因仍要回到新机日志。
- 清单本身是手工维护的：将来若有新的「缺失即拖死启动」路径，必须同步加进 `requiredPaths`，
  否则盲区以另一种形式回归。
