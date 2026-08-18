# 执行记录：dsh-chat-rail 加入 SSiD 预设插件

> 日期：2026-08-19
> 状态：已完成
> 执行人：MaxNull（AI 代执行）
> 前置决策：[2026-08-18-消息导航自研-放弃第三方rail.md](2026-08-18-消息导航自研-放弃第三方rail.md)（执行顺序的「装入 ssid profile 实测」落点）
> 关联清单：[SSiD-插件清单.md](../设计/SSiD-插件清单.md) 2.1 已就绪自研预制项

---

## 一、结论

`@max-null/dsh-chat-rail@0.1.0`（画卷式消息导航）已加入 SSiD 预设插件：
开发 profile 与发布模板两处同步，依赖安装成功、peer 无新增缺失、语法校验通过。

## 二、改动清单

| 文件 | 改动 |
|---|---|
| `~/.dsh/profiles/ssid/package.json`（开发 profile） | dependencies + `dsh.profile.bundles` 各加 `@max-null/dsh-chat-rail` |
| `~/.dsh/profiles/ssid/pnpm-workspace.yaml` | `minimumReleaseAgeExclude` 加 `@max-null/dsh-chat-rail@0.1.0`（新发布包豁免） |
| `shell/profile-template/package.json`（发布模板） | 同上 dependencies + bundles 两处 |
| `shell/profile-template/pnpm-workspace.yaml` | 同上豁免项 |

## 三、验证结果

1. **安装**：profile 内 `pnpm install` 成功（exit 0，+1 包），`node_modules/@max-null/dsh-chat-rail@0.1.0` 就位，包内容完整（`lib/index.mjs` host 半端 + `lib/client.js` client 半端 + `cordis.patch.yml` bundle patch）。
2. **Peer**：5 个 peer 全部满足——`@deepseek-ai/cordis@4.0.1`（cordis-plugin-group 带入）、`@deepseek-ai/dsh-session-projection@0.1.0-rc.7`（官方聚合包直接依赖）、`dsh-better-sidebar@0.13.0`、`react@18.3.1`、`react-dom@18.3.1`。`pnpm peers check` 无 chat-rail 相关条目（既有 missing peer 均为官方 rc.7 包间关系，与本次无关）。**prepare-runtime.mjs 的 MISSING_PEERS 无需补充**——chat-rail 的 peer 均由官方依赖树自动带入，runtime 构建（模板 + 官方包注入 + pnpm install）与开发 profile 同源。
3. **语法**：4 个改动文件 JSON/YAML 校验全过；chat-rail 的 cordis.patch.yml（`insert: chat-rail`）语法正确，与已加载插件同模式。
4. **插件测试**：dsh-chat-rail 仓库 `npm test` 通过（exit 0；该版本 tests 目录无 spec 用例）。

## 四、生效方式

bundle 声明在 DSH 进程启动时加载：**重启思灵（或当前 GUI 会话）后**，右侧画卷式消息导航 rail 生效。

## 五、备注

- dsh-chat-timeline（第三方）此前已移除（决策文档要求的执行步骤），本次 package.json 确认无残留。
- 下次发布 SSiD 安装包时，`prepare-runtime.mjs` 重新打包 runtime 即自动包含 chat-rail（模板已更新），无需其他手工步骤。
