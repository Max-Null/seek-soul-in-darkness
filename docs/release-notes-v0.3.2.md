# v0.3.2 思灵（SSiD）

> 状态：**已发布**（2026-09-16）。按 `git log v0.3.1..HEAD` 分组。
> 本版是补丁版：两个能让思灵起不来的启动级修复，加一个新内置插件与部署期的完整性加固。

## 修复

- **升级部署的 patch 合并会吞掉下一个顶层条目**（0.3.1 安装版实测）：`mergeUserPatch` 的
  「用户改过的出厂子条目」分支按注释块归属与 `end` 计数算出越界区间，把 `- id: connection`
  整行替换掉。症状是 boot 报 `bad indentation`，而手工把 YAML 调成合法后**插件中心 405 复发**
  ——真正缺的是 `connection` 的 `webServer` 注入。修复为区间钳制
  `Math.min(e.start + c.end, e.end)`，并补了与真实模板同构的回归用例。
- **MCP 条目的 CLI 缺失会拖死整棵插件树**（新机 zip 版实测）：模板 `mcp-codegraph` 与
  `mcp-playwright` 的 `args[0]` 取自壳注入的环境变量，而壳只在 CLI 实体存在时才注入它。
  CLI 缺失时 `args[0]` 求值为 `null`，而 `dsh-mcp-client` 的 schema 要求 `string[]`，于是
  `plugin tree failed to load`、内核起不来。修复分两层：壳层把 CLI 存在性并入启停判定
  （`resolveCodeGraphEnable`），模板给两个条目补 `disabled` 兜底。
- **部署后的完整性校验由单点改为清单式**：原先只验归档 82% 处的 `@max-null/dsh-memory`，
  而 `@astudioplus/codegraph-mcp` 在 97% 尾部——中断发生在两者之间的解压能通过校验，留下
  「头部齐、尾部缺」的 profile，正是上一条故障的上游成因。现在逐项核对内核、记忆插件与
  两个 MCP CLI；`verify-release` 的必查清单也补上了 codegraph。
- **3 个 mxy 技能修掉重复段落与描述缺失**（`skills/` 与 `profile-template/skills/` 两处同步）。

## 新增

- **内置插件 `dsh-ssid-pwsh-retry`**：Windows 上 pwsh 工具偶发 `spawn EPERM` 时**透明重试一次**
  ——等待 300ms 后重新 dispatch，只对 `pwsh` 工具与这一种错误生效，已中止的调用不重试。
  根治在 DSH 的进程创建层，本插件是 SSiD 侧的缓解；重试意味着非幂等命令可能执行两次。
- **`shell/fix-mcp-startup.ps1`（配双击入口 `.cmd`）**：给已装 0.3.1 的机器自助恢复启动——
  检查两个 MCP CLI、缺则停用对应条目、改动前备份、再用思灵自带 node 实解析校验，可重复运行。

## 内置升级

- **@max-null/dsh-memory 0.6.1 → 0.7.0（静默记忆机制第一版）**：写入即生效，不再逐条等人工放行；
  命中密钥/凭据规则的记忆写入即**隔离**（不进检索也不进注入，由人放行）；命中两次自动升常驻、
  30 天未再命中自动撤下，**人工动过的开关双向豁免**；记忆可绑**有效性锚点**（环境变量 / 工具清单 /
  插件版本），所绑值变化即标 `stale` 并撤常驻；新增查询日志与来源字段，面板从「审核队列」变为
  「审计台」（隔离区 / 常驻 / 冷数据分组）。旧存储照常读写，启动时一次性迁移——旧 `suggested`
  逐条过危险检测后放行或隔离，迁移前自动备份。
- **@max-null/dsh-skills 0.1.0 → 0.1.1**：包内 8 个 skill 的现状数字改为命令现取（原先写死的
  计数已经过时）、修掉一处死链与重复说明段；新增 `prepack` 清 `__pycache__`——npm 的 `files`
  白名单优先于 `.gitignore`，0.1.0 实测把一个 `.pyc` 打进了 tarball。
- **第三方预制插件对齐 npm 最新**（沿用「第三方更新到 npm 最新」的既定规则，四者
  peerDependencies 与 engines 均未变）：`@changfenhuang/dsh-genui` 0.10.0 → 0.11.0
  （新增 `katex` 依赖，公式渲染）、`@playwright/mcp` 0.0.80 → 0.0.81（底层 playwright
  1.63 → 1.64 alpha）、`dsh-context` 0.52.1 → 0.52.2、`dsh-dream-skin` 9.14.2 → 9.15.2。

## 工程与门禁

- **`ssid-release` skill**：发版冒烟脚本新增 `dismissChangelog()`（识别「思灵已更新」并关掉，
  否则更新日志弹窗会盖住骨架断言造成假 FAIL）；更正弹窗已读状态的实际位置——它在壳的共享
  状态文件 `~/.ssid/changelog-seen.json`，不随 profile 隔离。
- **手册 §7 新增坑 #30、#31、#32**（patch 合并越界、MCP CLI 缺失、部署校验点必须覆盖归档尾部），
  §8 索引同步；决策库索引重建。
- 新增三份记录：pwsh 工具间歇性 `spawn EPERM` 排查记录、OpenClaw 2.0 调查报告、
  记忆机制「自动生效 + 后审核」改造计划（后者含 4 项待拍板决策）。

## 更新说明

- 老用户安装 v0.3.2：启动时版本指纹不一致 → 自动重部署运行环境（约 30 秒，可取消）。
- 本版起，运行环境解压不完整会让部署**明确失败并报出缺哪些路径**，不再带着半截环境启动。
- 已装 0.3.1 且遇到启动失败的机器，可先用 `shell/fix-mcp-startup.ps1` 恢复，再升级到本版。

## 下载与校验

- 优先使用免安装版（zip）：解压即用，绕过安装器/签名拦截；NSIS 安装版报
  「不支持的 16 位应用程序」= 下载文件损坏（非兼容问题），删后重下或换 zip。
- 资产（GitHub Release 页）：
  - `ssid-shell-0.3.2-win.zip`（410.9 MB）
  - `ssid-shell-setup-0.3.2.exe`（361.0 MB）
  - 附 `latest.yml` 与 `ssid-shell-setup-0.3.2.exe.blockmap`（在线增量更新所需）
- SHA256（`certutil -hashfile <文件> SHA256`）：
  - `ssid-shell-0.3.2-win.zip`：`8C9CF229C0D7B7977C297EECCDF22F0C8BEFD998DF098AC34624DC8A4435924C`
  - `ssid-shell-setup-0.3.2.exe`：`096CB086BD80642D5D0A9DFBD52B8D59B1C97F1DDA757B09C6EAEF14C0749FAA`
