# ssid-desktop —— 思灵对官方 DSH 桌面端的改造源码

本目录是**思灵（SSiD）换用官方 DSH 桌面端底座后，我们对它的全部改造**。它**不是可独立构建的工程**：只含改过的文件，需要叠在对应版本的 DSH 源码上才能构建。

## 两个落点，各司其职

跟官方升级和对外发布是两件事，需要两个落点，**不是二选一**：

| 落点 | 角色 | 能做什么 |
|---|---|---|
| `Max-Null/deepseek-harness` 分支 `ssid-desktop-fork` | **开发主轴** | **只有它带 DSH 的全历史** —— 跟官方升级在这里做（`git fetch upstream --tags && git rebase`） |
| 本目录 | **对外快照** | 读得懂、能 diff、能提 issue；**单独 clone 构建不了**（缺 DSH 的 `packages/`） |

**两份会漂移**，这是这种分工的固有代价。收尾时按逐文件 SHA256 比对同步（纪律见开发手册坑 #45），不要靠印象。

## 改了什么

逐条改动、原因与 dev 实机验证证据见 [`SSID-CHANGES.md`](./SSID-CHANGES.md)。要点：

- **壳功能移植**：自建壳时代的保活、截图、原生通知、CodeGraph 适配、MCP env 注入、无边框自绘标题栏、托盘
- **品牌与产品名**：产品名「思灵」、appId `com.maxnull.ssid`、图标与托盘位图
- **profile 交付链**（A′ 方案）：`profile-seed.ts` 首启把随包插件集接进 profile（建目录链接 + 补 bundles 声明），`prepare-ssid-plugins.ts` 产出插件集，`electron-builder-config.mjs` 把它挂进 `extraResources`

## 与 `shell/` 的关系

`shell/` 是**自建壳时代**的产物，已归档在：

- tag **`v0.4.0-selfbuilt`**
- 分支 **`archive/selfbuilt-shell`**

其中两处**仍在 `main` 上继续维护**，不要跟着归档：

| 路径 | 为什么留 |
|---|---|
| `shell/profile-template/` | **发版基准** —— `apps/desktop/scripts/prepare-ssid-plugins.ts` 的默认路径指着它（硬编码），门里的 `plugin-peers`、`profile-sync` 也依赖它 |
| `shell/scripts/` | **`check:rules` 七个门 + 发版脚本**（`sync:vendor`、`verify:release`），以及它们依赖的 `shell/lib/` |

## 构建

构建要用带 DSH 历史的那个 checkout（即上面的开发主轴），入口在 `apps/desktop`：

```sh
pnpm run package:win:x64:dir:unsigned   # 出未签名的解包目录，用于验证
pnpm run package:win:x64:unsigned       # 出未签名 NSIS 安装包
```

`prepare:ssid-plugins` 可用 `SSID_PROFILE_TEMPLATE_DIR` 指向另一份 profile 模板做临时验证，**不必改发版基准**。
