# v0.3.3 思灵（SSiD）

> 状态：**已发布**（2026-09-18）。按 `git log v0.3.2..HEAD` 分组。
> 归档指纹 `0.3.3-0.1.5-rc.2-586fb1bf` · Windows 三层内核哈希 `a9ea6f602e69e772`。
> 本版是补丁版：一个新内置插件、一批预制插件对齐 npm 最新，加一条让门禁终于能维持住的修正。

## 新增

- **内置插件 `dsh-ssid-env`（运行环境自述）**：往系统提示里加一节，说明当前跑在思灵壳里
  而不是裸 DSH web，并给出判据——**非 SSiD 环境下它自己沉默**，不污染普通 web 会话。
  同批定下「一个适配面一个插件、不合并」的分合判断：合并能省的成本已被 manifest +
  `sync:vendor` + `check-vendor-sync` 这套工具吸收，代价（独立回滚、故障隔离、
  `pwsh-retry` 必须挂在 bundles 末尾的加载顺序语义）却无法自动化。
- **`shell/scripts/heal-workspace-registry.mjs`**：工作区登记的补录工具。侧栏工作区分组
  比实际少（会话掉出 `WorkStation` 分组）时的对账脚本，来源见 `docs/排查/2026-09-17-多实例共用storages.md`。

## 内置升级

- **`@max-null/dsh-tone-layer` 0.1.0（首次进发布版）**：语气层，按会话上下文调整回复口吻。
- **`@max-null/dsh-memory` 0.7.0 → 0.9.1**：静默记忆机制继续推进（写入即生效、命中凭据规则
  即隔离、锚点失效自动撤常驻）。
- **`@max-null/dsh-plugin-center` 0.2.20 → 0.3.0**、**`@max-null/dsh-skill-mcp-center` 0.5.0 → 0.5.1**、
  **`@max-null/dsh-skills` 0.1.1 → 0.1.2**、**`ds-harness-remote` 0.4.13 → 0.4.14**。
- **预制第三方对齐 npm 最新**：`dsh-context` 0.52.2 → **0.53.3**（本版显式改 pin——
  声明写的是 `^0.x` 形态，**不跨 minor**，不显式改就仍会解析回旧版）、
  `dsh-dream-skin` 9.15.2 → 9.16.0。归档前的 33 项依赖已逐条与 npm latest 比对，一致。

## 工程与门禁

- **`check-vendor-sync` 改为对行尾码免疫**（本次实测逼出来的修正）：指纹原先逐字节算，
  而「四份 vendor 逐文件一致」这条要求在 Windows 上**结构性不可维持**——源与模板是 git
  检出（`core.autocrlf=true` → CRLF），profile 里 `file:./vendor/<pkg>` 的实体却由 pnpm
  物化（行尾归一成 LF）。于是门稳定报 6 处「漂移」，而内容逐份全等；每次 `pnpm install`
  又把它造回来，真漂移反而淹没在假信号里。现在指纹只对**可解码 UTF-8 文本**归一 CRLF / 孤立 CR，
  二进制逐字节不变，内容差异（末尾换行、空格、正文）与从前一样照报。新增
  `scripts/check-vendor-sync.spec.mjs` 守住这四条。
- **`sync-vendor` 与门共用同一实现**，因此同步结论同步受益：本版实跑 dry-run
  已无假差异。
- **手册 §7 新增坑 #36**（vendor 四份一致必须对行尾免疫，判据与处置见该条）；#35 为压缩阈值
  生效层在 preset、host 层那条被 `web-app` 禁用；另登记三条排查纪律、插件安装链、
  `dsh-ssid-env` 与 `dsh-skills 0.1.2`；决策库索引重建（89 篇）。
- **新增三份上游观察记录**：genui 文字换行缺口、`connection-rpc` 通道注册缺陷、
  `ds-harness-remote` 授权失效调查。

## 修复

- **会话取证扫描工具 + 长会话输出退化的根因记录**：压缩阈值与「清醒区」错配
  （`docs/排查/`、工具 `shell/scripts/session-degeneration-scan.mjs`）。
- **DSH 内核崩溃退出排查记录**：原子写 rename 的 EPERM 家族（`docs/排查/`）。

## 更新说明

- 老用户安装 v0.3.3：启动时版本指纹不一致 → 自动重部署运行环境（约 30 秒，可取消）。
- 本版**新增一个内置插件**（`dsh-ssid-env`）与**一个新预制插件**（`dsh-tone-layer`），
  重部署后两者随归档一起落位，不需要手动安装。
- `dsh-context` 从 0.52.2 直接跳到 0.53.3（跨了两个 minor），其面板「上下文」标签的行为以
  0.53.3 为准。
- 已装 v0.3.2 的用户可直接增量更新；低于 v0.3.0 的建议走完整安装包。

## 下载与校验

- 优先使用免安装版（zip）：解压即用，绕过安装器/签名拦截；NSIS 安装版报
  「不支持的 16 位应用程序」= 下载文件损坏（非兼容问题），删后重下或换 zip。
- 资产（GitHub Release 页，本版起 Windows 与 macOS 同发布）：
  - `ssid-shell-0.3.3-win.zip`（411.0 MB）、`ssid-shell-setup-0.3.3.exe`（361.1 MB）
  - macOS（arm64，CI 产出）：`ssid-shell-0.3.3-arm64.dmg`（384.6 MB）、
    `ssid-shell-0.3.3-arm64-mac.zip`（383.5 MB）
  - 附各平台的 `latest.yml` / `latest-mac.yml` 与 blockmap（在线增量更新所需）
- SHA256（`certutil -hashfile <文件> SHA256`）——**以本页与 Release 页为准**：
  - `ssid-shell-0.3.3-win.zip`：`723A2B1EB7518BEA52DC9D40D4C40064E07F8C607DC2A30FDF307489F5DE937B`
  - `ssid-shell-setup-0.3.3.exe`：`EC300FA7A8DA92841F19B8DC7BD59E80A1734A9D013CF0ECF5D09E85E9924FDA`
- 说明：**包内那份「更新日志」（关于 SSiD）不着录校验和**。安装包的哈希取决于内嵌归档，
  而归档里又装着一份更新日志——三者互相依赖，把最终哈希写进包内会**再次改变**哈希。因此
  包内只给占位符（v0.3.2 起即如此），真实校验和以本页与 GitHub Release 页为准。
