# 执行记录：预设插件更新检查 + dsh-better-sidebar 升级 0.13.1

> 日期：2026-08-19
> 状态：已完成
> 执行人：MaxNull（AI 代执行）
> 关联：SSiD 预设插件清单（shell/profile-template/package.json）

---

## 一、检查结果（全部 14 个 registry 依赖 + 1 个 vendor + 2 个官方 bundle）

| 包 | 模板声明 | dev 实际 | npm latest | 结论 |
|---|---|---|---|---|
| @huanlin/dsh-plugin-better-sidebar-plugin-office | ^0.1.0 | 0.1.0 | 0.1.0 | ✅ 最新 |
| @max-null/dsh-chat-rail | ^0.1.0 | 0.1.0 | 0.1.0 | ✅ 最新 |
| @max-null/dsh-chinese-thinking | ^0.2.0 | 0.2.0 | 0.2.0 | ✅ 最新 |
| @max-null/dsh-guardian | ^0.1.0 | 0.1.0 | 0.1.0 | ✅ 最新 |
| @max-null/dsh-habit | ^0.1.0 | 0.1.0 | 0.1.0 | ✅ 最新 |
| @max-null/dsh-memory | ^0.2.0 | 0.2.2 | 0.2.2 | ✅ 最新（dev 已升） |
| @max-null/dsh-plugin-center | ^0.1.5 | 0.1.5 | 0.1.5 | ✅ 最新 |
| @max-null/dsh-skill-mcp-center | ^0.1.0 | 0.1.0 | 0.1.0 | ✅ 最新 |
| @max-null/dsh-node-appearance | ^0.1.1 | 0.1.1 | 0.1.1 | ✅ 最新（本次会话已升） |
| **dsh-better-sidebar** | ^0.13.0 | 0.13.0 | **0.13.1** | ⚠️ **本次升级** |
| dsh-excel-panel | ^0.6.1 | 0.6.1 | 0.6.1 | ✅ 最新 |
| dsh-sidebar-qa | ^0.2.0 | 0.2.0 | 0.2.0 | ✅ 最新 |
| dsh-skin | ^0.4.1 | 0.4.1 | 0.4.1 | ✅ 最新 |
| dsh-video-preview | ^0.1.1 | 0.1.1 | 0.1.1 | ✅ 最新 |
| @max-null/dsh-ssid-panels（vendor） | file: 0.1.2 | — | 不发布 npm | ✅ 源码构建与 vendor MD5 全等 |

官方 bundle（@deepseek-ai/dsh-base / dsh-web-app）随 DSH 内核分发，不在检查范围。
dev profile 的 `dsh-sidebar-preview-select`（link: 本地源码）为 dev 专属实验插件，npm 404、不在模板，未纳入。

## 二、唯一可更新项：dsh-better-sidebar 0.13.0 → 0.13.1

- 0.13.1 发布于 2026-08-18（<7 天，需豁免）；peer/deps 声明与 0.13.0 同代（rc.7 系，与当前 DSH 兼容）
- 模板声明 `^0.13.0` 已允许 0.13.1（发布自动取 0.13.1），**模板 package.json 无需改**

## 三、改动清单

| 文件 | 改动 |
|---|---|
| `~/.dsh/profiles/ssid/pnpm-workspace.yaml` | minimumReleaseAgeExclude 加 `dsh-better-sidebar@0.13.1` |
| `shell/profile-template/pnpm-workspace.yaml` | 同上（发布侧豁免，保证 prepare-runtime 构建不被 age 策略拦截） |
| dev profile | `pnpm update dsh-better-sidebar` → 实装 0.13.1，lockfile 更新 |

## 四、验证

1. `pnpm update` 成功（exit 0），node_modules 实装 **0.13.1**
2. `pnpm peers check`：与升级前完全一致（8 项既有问题，无新增）
3. 两处 pnpm-workspace.yaml YAML 校验通过

## 五、备注

- 下次发布 SSiD 安装包时 runtime 自动包含 0.13.1（模板 ^0.13.0 解析到 latest）。
- 更新检查方式备忘：`npm view <pkg> version` 批量对比模板声明与 dev 实装，见本文档第一节表格。
