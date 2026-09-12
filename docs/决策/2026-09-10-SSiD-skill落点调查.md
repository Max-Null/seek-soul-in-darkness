# SSiD skill 落点调查

> **调查缘起**：你指出"这些 skill 可能是某个插件的附属品，比如我们的记忆插件就有附带的 skill。这一点值得先进一步调查"。
> **调查方法**：读 DSH 的 skill 发现机制源码，并核对本机的实际部署形态。

---

## 一、DSH 如何发现 skill

源码：`DSHfork/packages/skill/skill-filesystem/src/index.ts:250-262`

```
<项目根>/.dsh/skills      →  source: project-dsh
<项目根>/.agents/skills   →  source: project-agents
<customSkillDirs 配置项>   →  source: custom
$DSH_HOME/skills          →  source: user-dsh   （skipSystem：跳过 .system/）
$AGENTS_HOME/skills       →  source: user-agents
<bundledSkillDir>         →  source: bundled     （trustedHost: true）
```

**共 6 类源**，每类带一个 `rank`（优先级）。同名的覆盖关系由测试名写明：

> **项目 skill 覆盖 runtime，runtime 覆盖 custom 与 user skill。**

其他核实到的行为：支持目录形式 `<name>/SKILL.md` 与平铺形式 `<name>.md`；支持符号链接（含断链与设备链的处理）；有 `skills/change` 事件供热更新；`customSkillDirs` 可在配置里声明任意额外目录。

---

## 二、本机的实际部署形态

| 路径 | 源 | 内容 |
|---|---|---|
| `C:\Users\MaxNull\.dsh\skills` | **user-dsh** | **17 个**：`dsh-plugin-upgrade`、`genui`、`mxy-*`（8）、`omo-*`（6）、`ssid-release`，另有 README.md |
| `C:\Users\MaxNull\.agents\skills` | user-agents | 1 个：`docx` |
| `C:\Users\MaxNull\.agents\.skill-lock.json` | — | `npx skills add` 的锁文件 |
| `H:\MaxNull\WorkStation\.agents` | project-agents | **不存在** |

**因此当前会话加载的全部 skill 都来自 `~/.dsh/skills/`（user-dsh 源）**——包括那个 `dsh-plugin-upgrade`。

---

## 三、插件附属 skill 的真实机制（关键）

**模式确实存在，但机制与直觉不同。**

`max-null-plugins/dsh-plugin-center` 带一个 skill：`skills/dsh-plugin-upgrade/SKILL.md`。

它的 package.json 里：

- `files` 字段**包含** `"skills"`（把它打进 npm 包）
- **`dsh` 字段没有任何 skill 声明**——只有 `bundle` 与 `client`

既然发现路径里没有"从 `node_modules/<pkg>/skills` 读"这一条，而 `dsh-plugin-upgrade` 又确实出现在 `~/.dsh/skills/` 下，**结论是：插件附属 skill 是"部署时被安装到 user-dsh 目录"才生效的，不是运行时从插件目录发现的。**

旁证：`dsh-plugin-center/src/market.ts:182` 有一段注释区分了两种 skill 来源——

> Skill entries install into `~/.agents/skills` via a different mechanism (`npx skills add`); the pnpm-driven center cannot install them, so…

**所以 skill 有两条独立的供应链**：
1. **插件包内 `skills/` → 随插件安装 → 落到 user-dsh**
2. **纯 skill → 走 `npx skills add` → 落到 `~/.agents/skills`**

---

## 四、一处与记忆有关的更正

你说"我们的记忆插件就有附带的 skill"。**这一点我没有找到证据**：

- `max-null-plugins/dsh-memory` 顶层**没有** `skills/` 目录，全库无 `SKILL.md` 或 skill 相关文件
- 它的 `files` 字段是 `["dist","client.js","cordis.patch.yml","README.md","LICENSE"]`——**不含 skills**
- 它的 `dsh` 字段只有 `bundle` 与 `client`，无 skill 声明
- 全工作区扫下来，**带 `skills/` 目录的插件只有 `dsh-plugin-center` 一个**

**最可能的解释**：你指的是当前会话每轮注入的那段「记忆系统自述」——那是 **dsh-memory 插件注入的系统提示段落，不是 skill**。两者在界面上都表现为"大段中文说明"，容易混淆，但机制完全不同：系统提示段落由插件直接注入，skill 是经上述发现路径加载的。

如果你指的是别处（比如另一个工作区或未提交的分支），告诉我路径，我再去核。

---

## 五、对落点决策的结论（2026-09-10 修订）

> **本节已改写**。原结论是"两个落点"，那是在**只考虑文件系统发现路径**的前提下得出的。
> 之后的调查发现 skill 可以由**插件注册 provider**提供（范本：`packages/skill/skill-badge/`），于是出现了第三个、也是更优的落点。

**落点是三个，且第三个优于前两个。**

| # | 落点 | 生效条件 | rank |
|---:|---|---|---:|
| ① | `<项目>/.dsh/skills` | 工作目录 = 该项目 | 100 |
| ② | `<项目>/.agents/skills` | 工作目录 = 该项目 | 200 |
| ③ | **独立 npm 包（SkillProvider 插件）** | **装了它的 profile** | **550** |

**①② 的共同局限**：路由条件是"**工作目录等于那个仓库**"——**出了那个目录就失效，也无法分发给他人**。我最初建议的 ② 只解决了一半问题。

**③ 解决了全部四个需求**：进 SSiD、进任何 DSH profile、可分发给他人、独立库可承载更多文档与演进记录。

**rank 550 的依据**：生态里已有先例——[JasonFreeLab/dsh-superpowers](https://github.com/JasonFreeLab/dsh-superpowers) 的 `SkillProvider` 就用 550，README 明写"可被项目/用户技能覆盖"。它位于 user-agents(500) 与 bundled(600) 之间，语义是"第三方 skill 插件"。详见 `2026-09-10-DSH-skill生态调查.md`。

**SSiD 现有的 `ssid-release` 不受影响**——它是 SSiD 专属、只在开发/发版时用的 skill，留在 `.agents/skills/`（②）是对的。**新的方法论 skill 走 ③**，因为它的目标是"跨项目可用、可分发"。

**一个仍然有效的事实**：SSiD 根目录的 `skills/`（14 个）**不在 DSH 的发现路径上**。它只是"源头"——需要经 `profile-template/skills/`（15 个，多一个 `genui`）走归档部署，才能到达 `~/.dsh/skills/` 生效。这解释了 `genui` 为什么只在 profile-template 里：它只属于产品交付，不属于开发期。

**于是 SSiD 侧出现第三种形态**：一个既可独立分发、又被 SSiD 集成的东西。它**不适用**手册 §10 的"内置插件不发布 npm"条款（那条针对的是脱离 SSiD 无法使用的插件），而是走**npm 声明**（像 dsh-chat-rail 那样）——这也正是你的决定。

---

## 六、你这个要求的技术必要性：来源与版本标记

你说的"要有一份文档或者标记，表明这个 skill 的来源和版本，得记录来时路"——调查之后，这条**不只是好习惯，而是被机制逼出来的必需**：

**因为 skill 一旦部署到 `~/.dsh/skills/`，就脱离了源仓库。** 那个目录下的 17 个条目没有任何元数据说明它们从哪来、对应哪个上游版本。当前已知的溯源手段只有：

- `~/.agents/.skill-lock.json`（只覆盖 `npx skills add` 那条链）
- 各 skill 自身的 frontmatter（DSH 的 12 个 skill 只有 `name` 与 `description`，**没有 version 字段**）

所以如果我们不自己记，**上游 DSH 更新到第几版、我们适配自哪一版，将无从查起**。而 DSH 是高频更新的（本会话早前实测：24 天 / 16 个 tag）。

**建议的标记内容**（待你确认）：

| 字段 | 例子 | 为什么需要 |
|---|---|---|
| 上游来源 | `DSHfork/.agents/skills/dsh-prose-standard/SKILL.md` | 定位原始文件 |
| 上游版本锚点 | commit SHA + 日期 | DSH 无版本号，只有 commit 可靠 |
| 适配日期 | `2026-09-10` | 判断适配是否已过时 |
| 适配类型 | 小改 / 需适配 / 部分可用 | 对应清点文档里的分类 |
| 与上游的差异摘要 | 删了什么、改了什么、为什么 | **适配的核心价值所在** |

放在哪有两种选择：**skill 文件内的 frontmatter 扩展字段**（随文件走，但可能被 DSH 的 skill 格式检查拒绝），或 **skill 包内单独一个 `SOURCE.md`**（不干扰格式）。我倾向后者，理由与 DSH 自己的做法一致——`SKILL.md` 保持精简，重材料外置。

---

## 附：本次调查的证据边界

- **已核实**：发现路径与 rank 的源码位置、6 类源、本机三个目录的实际内容、`dsh-plugin-center` 的 package.json 字段、全工作区插件 `skills/` 目录的扫描结果、`market.ts` 的注释原文。
- **未核实**：`bundledSkillDir` 具体指向哪里；profile 配置里是否有 `customSkillDirs`；`dsh-plugin-upgrade` 究竟由哪一步部署到 `~/.dsh/skills/`（我只确认了结果，没有追到执行者）。
- **更正**：第四节关于 dsh-memory 的结论是"未找到证据"，不是"不存在"——如果你有具体位置，我再去核。
