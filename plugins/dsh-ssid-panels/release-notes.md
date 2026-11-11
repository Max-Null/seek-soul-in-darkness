# v1.1.11 思灵（SSiD）

> 状态：**待发布**。内核跟进 0.2.2-rc.1（跨 minor）；随包插件集跟到最新；安装器品牌完成 8 语迁移。

## 这一版改了什么

### 一、内核跟进 0.2.2-rc.1

内置内核从 **0.2.1-rc.2** 直上 **0.2.2-rc.1**。

> 说明：v1.1.9 与 v1.1.10 从未对外发布（无 Release）。按「未外发版本合并重打」的既定做法，那两版的内核跟进（rc.4 / rc.5）连同它们的配套改动一并并入本版，**不再单独发布**。所以你从 v1.1.8 升上来，拿到的是从 rc.2 起算的全部内核变化。

这个区间里对思灵影响最大的三处：

**① 上游的 `installer/strings.nsh` 被删除，安装器文案迁进 `installer/locales/*.json`。** 我们原先在那份 `.nsh` 里做的品牌替换（中英各 3 处，共 6 处）必须重做到新位置——**失效是静默的**，不做也不报错，只是安装器界面弹回上游的英文产品名。

**② 这次做全了 8 个语种。** 上游新增的 `scripts/shipped-locales.spec.ts` 会断言 `installer/locales/` 与它自己的语言清单（8 语）对齐，所以那 6 个语种的文件不能删、只能一起改。共替换 24 处（8 文件 × 3 个键：`INSTALLER_LAUNCH_FAILED` / `INSTALLER_RUNNING` / `INSTALLER_PATH_OWNERSHIP`）。德语、日语、俄语的安装界面从此也显示「思灵」而不是上游产品名。

**③ 壳侧合进了上游 2.2 线的全部改动**（9 个文件、19 个冲突块）。其中两处值得记：`PROFILE_TEMPLATES` 的导出从 `app-boot` 挪到了 `official-bundles`（我方 `project-manager.ts` 的 import 随之调整）；主进程新增了插件操作诊断通道（`OperationJournal`），与思灵原有的 `host.log` 并存——两条传输层不同（IPC 消息 vs stdio 字节流），互不吞事件。

### 二、随包插件跟进最新

| 插件 | 从 | 到 |
|---|---|---|
| `@changfenhuang/dsh-genui` | 0.15.0 | **0.16.0** |
| `ds-harness-remote` | 0.6.0 | **0.6.4** |
| `dsh-better-sidebar`（vendor） | 0.28.2 | **0.30.1** |
| `dsh-context` | 0.78.2 | **0.83.1** |
| `dsh-dream-skin` | 10.31.0 | **11.7.0** |
| `dsh-wechat` | 0.14.0 | **0.16.2** |
| `@max-null/dsh-memory` | 0.20.0 | **0.22.1** |

`dsh-better-sidebar` 的 vendor 这次是**整包替换**（503 文件）：当前 vendor 与 npm 官方包逐字节相同、零本地定制，所以不需要保留任何补丁。它 0.30.1 的 host 侧 `inject` 已是 `["webServer","sessions","connection","tools"]`——上游自己把 `webRuntime` 换成了 `connection`。

`@max-null/dsh-memory` 0.22.x 带来跨环境记忆云同步（`memory_sync` / `memory_conflicts`）。**默认关闭**：没配 `memory.sync.remote` 就不注册那两个工具，模型看不到也就不会误调。

### 三、应用内菜单与安装器文案

- macOS 应用菜单的「关于」项跟着品牌走（显示「关于 思灵」）。
- macOS 的 `CFBundleLocalizations` 维持中英两语——思灵的界面字典只有这两语，多声明会让系统按未翻译的语种选中界面。
- 安装器 `uninstallDisplayName` 与版权行随产品名走（「Copyright © 2026 思灵」）。

## 升级说明

- **覆盖安装即可**，会话、工作区、插件配置与跨会话记忆都保留。
- **`@deepseek-ai/dsh-experimental-tool-worktree` 已从随包 bundle 清单里去掉**（它已被上游并入 forge-bundle，继续挂着是功能重复，内核的 Release 说明也要求摘）。**全新安装不受影响**——模板里本来就没有它。**从旧版升上来的已有安装**需要在 profile 的 `dsh.profile.bundles` 里手动摘一次：

  ```powershell
  node -e "const fs=require('fs'),os=require('os'),p=require('path').join(os.homedir(),'.dsh/profiles/ssid/package.json');const j=JSON.parse(fs.readFileSync(p,'utf8'));j.dsh.profile.bundles=j.dsh.profile.bundles.filter(b=>!b.includes('tool-worktree'));fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n','utf8')"
  ```

  改完要**重启一次思灵**——bundles 在启动时读取，不重启不报错、只是「Git 工作树」入口还在。
- **会话格式仍是 V4，普通会话双向可读。** 但 0.2.2 里 `independent-session-forks` 生效了：用本版产生过**普通 fork** 的会话，回退到旧内核可能读不了。回退边界要分开看——全局的「装回旧版安装包」是安全的，按会话生效的那条则不是。
- **`dsh-video-preview` 仍会停在 pending**：它的 `inject` 里写死了 0.2.1 就已删除的 `webRuntime`，作者尚未适配。它不影响界面与其余功能，属已知哑故障、**不是本版引入的**。
- **不买证书的既定取舍**：安装包未签名，Windows 的「无法验证发布者」提示点「运行」即可。
