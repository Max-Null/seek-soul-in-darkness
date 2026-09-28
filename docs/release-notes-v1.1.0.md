# v1.1.0 思灵（SSiD）

> 状态：**已发布**（2026-09-29）。相对 v1.0.0 的改动，分组依据 `.ssid-build/checkout` 的
> `git log d24c3a7ede~1..HEAD` 与 `seek-soul-in-darkness` 的 `git log v1.0.0..HEAD` 提炼。
> 本版是 **1.0.0 换代之后的第一次内核跟进**：随包内核从 **0.1.7-rc.2 升到 0.2.0-rc.1**
> （上游 `dsh-v0.1.7-rc.2..dsh-v0.2.0-rc.1` 共 261 个提交、20 项新特性）。
> 产品版本与内核版本仍是**两条线**：本版产品 `1.1.0`，内核 `0.2.0-rc.1`。

## 这一版换了什么

- **内核 0.1.7-rc.2 → 0.2.0-rc.1**：随包内核整体前进一个 minor。上游在此期间的主要新能力
  （桌面用户可感知的部分）：
  - **Schedule 成为可选 bundle**：定时跟随能力从内核核心拆成可选包，配套的设置页与行开关一并到位。
  - **插件管理器两处改进**：bundle 可以在自己的页面上列出它拥有的行；以及当一个 bundle
    整体切换其行时，拒绝单独切换其中一行（避免出现语义矛盾的状态）。
  - **会话日志上传**（General 设置里的偏好项）与 **OTel 遥测**：桌面端的产品分析经 OTel 上报，
    会话日志事件走字节有界的 OTLP 通道。
  - **桌面前端**：运行状态条完整回归、会话运行时在记录下方显示鲸尾动画、进程行 shimmer 统一、
    Windows 上对话框与浮动面板不再压到 caption 区。
  - **反馈问卷**默认预填账号、版本与桌面设备信息；并提供一组 Windows 沙箱 ACL 拒绝的诊断技能。
- **出厂插件集紧跟内核**：随包插件集（A′ 形态）的声明整体对齐新内核，见「修复」一节的
  peer 适配说明。

## 新增与调整

- **Host 子进程输出落盘**：Host 的 stdout/stderr 现在写入日志文件，异常不再「无处可查」。
  此前 Host 侧出问题只能看到主进程的崩溃记录，Host 自己的输出没有落点。
- **开发启动器读 DSH 版本而非产品版本**：`pnpm run dev:desktop` 此前会用产品版本号去解析
  内核包集，在两条版本线分开之后就找不到了，dev 启动因此失败。

## 修复

- **启动链上的静默 TypeError**：一处未捕获的类型错误会让整个 `main-startup` 测试文件超时，
  真因被超时表象盖住。
- **出厂插件的内核兼容性（本版最关键的一项）**：内核用它自己的
  `plugin-compatibility.ts` 逐个检查插件 `peerDependencies` 里的 `@deepseek-ai/dsh-*` 声明，
  判据是标准 semver（`{ includePrerelease: true }`）。**`^0.1.x` 形式的 caret 展开为
  `>=0.1.x <0.2.0-0`，不含 `0.2.0-rc.1`** —— 判定失败的 bundle 会被跳过（不进 fiber graph，
  也不出现在「did not activate」列表里，现象上等同于「装了但没生效」）。
  本版把出厂插件的声明统一改为 **`>=0.1.x <0.3.0`** 的显式区间（下界保留原值，只放宽上界，
  因此在新旧内核上都能加载）：涉及 `dsh-chat-rail`、`dsh-chinese-thinking`、`dsh-tone-layer`、
  `dsh-draft-polish`、`dsh-guardian`、`dsh-habit`、`dsh-plugin-center`、`dsh-skill-mcp-center`、
  `dsh-capture`、`dsh-achievements` 与内置专属插件 `dsh-ssid-panels`。
- **两条落后于 npm 的精确 pin**：`dsh-allostasis` 0.1.1 → **0.2.0**、
  `dsh-node-appearance` 0.6.0 → **0.7.1**（两者在 npm 上早已发布，装版一直钉在旧版）。
- **随包插件集补齐 node_modules 条目**与未签名 dir 打包脚本。
- **端到端回归里发现并修掉的一类 README 错误**（用户可见）：多处插件文档把用户引向不存在的
  东西，例如把配置位置写成 `cordis.yml`（实际生效的是 `cordis.patch.yml`）、把收集的持久化
  位置写成 `localStorage`（实际在 host 文件里）、把已变动的设置入口写成旧路径。这些是各插件
  自己的文档，随插件发版一并修正。

## 更新说明

- **升级路径与 v1.0.0 相同**：覆盖安装即可，配置、会话与工作区数据保留。
  会话格式已是 v4，内核只前进一个 minor，**不需要迁移**。
- **单实例**：与仍在运行的其他版本**不能并行**（同一个单实例锁）；升级前请先退出旧版。
- **首次启动会重新装载插件集**：随包插件集的声明有较大变动（内核跟进 + 上表列出的插件升版），
  首启会按新的声明重建 profile 里指向插件集的链接。已有会话不受影响。
- **插件作者的兼容性提醒**：如果你自己写过 DSH 插件，请检查
  `package.json` 里 `@deepseek-ai/dsh-*` 的 peer 声明。**`^0.1.x` 形式在新内核下会被判为
  不兼容而静默跳过**；改成 `>=0.1.x <0.3.0` 形式即可同时兼容 0.1.7-rc.2 与 0.2.0-rc.1。
  注意 `@deepseek-ai/cordis`、`cosmokit`、`schemastery`、`cordis-plugin-*` **不在**这项检查的
  命名空间内，保持 caret 即可。
- **不买证书的既定取舍**：安装包未签名，Windows SmartScreen 会拦截，选择「仍要运行」即可。

## 下载与校验

- 资产（[GitHub Release v1.1.0](https://github.com/Max-Null/seek-soul-in-darkness/releases/tag/v1.1.0)）：
  - `ssid-1.1.0-win-x64-unsigned.exe`（NSIS 安装包）
  - 附 `latest.yml` 与 blockmap（在线增量更新所需）
- SHA256（`certutil -hashfile <文件> SHA256`）——**以本页与 Release 页为准**：
  - `ssid-1.1.0-win-x64-unsigned.exe`：
    `4470A357CA198151E58BEB4137C80F9C860DBCEEEA6D1BF7A25891B541CE1B40`（449775055 字节）
- 说明：**包内那份「更新日志」（关于 SSiD）不着录校验和**。安装包的哈希取决于内嵌内容，
  而包里又装着一份更新日志，把最终哈希写进包内会**再次改变**哈希；真实校验和以本页与
  GitHub Release 页为准。
