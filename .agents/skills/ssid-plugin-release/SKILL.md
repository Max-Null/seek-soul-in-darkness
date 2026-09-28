---
name: ssid-plugin-release
description: "`@max-null/*` 单个插件的收尾与发布：README 与实现核对、版本决策、L1 门槛、提交、推送、tag、GitHub Release、npm publish 交接、SSiD 侧 vendor 同步。触发词：用户说『插件收尾/插件发布/发布插件/更新 tag/更新 release』，或一次列出一串收尾动作（『更新 readme+提交+推送+更新 tag+更新 release+发布』）时使用。与 ssid-release 分工：那个管 SSiD 壳发版（安装包），本文管插件发版（npm 包）。"
---

# 插件收尾与发布（`@max-null/*`）

> **与 `ssid-release` 的分工**：`ssid-release` 管 **SSiD 壳**（安装包、`latest.yml`、asar 内核）；本文管**单个插件**（npm 包）。插件发完 npm 之后，按 §9 判断要不要同步 SSiD 侧的 vendor——**那是另一件事，别合并**。
>
> **正本与生效副本**：正本在 `seek-soul-in-darkness/.agents/skills/ssid-plugin-release/`（受 git 管）；**实际生效的是 `~/.dsh/skills/ssid-plugin-release/`**。改完正本必须同步过去（`Copy-Item`），否则改了不生效、且没有任何提示。
>
> 路径基准：插件源码在 `H:\MaxNull\WorkStation\max-null-plugins\<name>\`；SSiD 侧在 `H:\MaxNull\WorkStation\seek-soul-in-darkness\`。

## 0. 这套流程防的是什么

用户往往一次说一串：「更新 readme + 提交 + 推送 + 更新 tag + 更新 release + 发布」。逐条执行**必然**会漏掉 §9——**npm 发了但 vendor 没跟，装版不会变**，而且要等下次发版才暴露。所以逐节过一遍，每节要么做，要么明确报告「不适用」。

## 1. 版本决策

- **判据是「有没有新的用户可见能力」，不是改了多少行**。一次改几十个文件但全是内部整理不该进位；加了新行为则 patch 装不下。
- patch = 修复 + 攒小改；minor = 功能增强；major = 破坏性 / 大重构。
- **没发布过的版本保持原号**：`npm view <pkg> version` 查不到就等于没发布，别为「显得正式」跳号。
- 只改 `package.json` 的 `version` 那一行——**别做整文件 JSON 重排**，diff 会失控：

  ```powershell
  node -e "const fs=require('fs');let s=fs.readFileSync('package.json','utf8');s=s.replace(/(""version""\s*:\s*"")[^""]+("")/,(m,a,b)=>a+'X.Y.Z'+b);fs.writeFileSync('package.json',s)"
  ```

## 2. README 与实现核对（**是核对，不是「更新」**）

**先假定它写错了，再去找证据。** README 烂掉的方式通常不是「少写了新功能」，而是**把用户引向不存在的东西**。

- 逐条对照**代码或上游接口定义**，不是对照自己的记忆。凡是提到 API 名、方法名、字段名、文件路径、数量上限、数据存储位置的句子，都回源码里验一遍。
  - 真实教训（2026-09-29）：`dsh-quick-toolbar` 的 README 两处写着「点条目即切过去（`sessions.open`）」，而 `ISessions` 接口**根本没有 `open`**（其 JSDoc 写着 "navigation belongs to view owners"）——那个调用从未生效过，README 却在推荐它。
- 改了用户可见行为 → 同步 `## 截图` 与 `docs/shots/`。**截图要先确认状态再截**（例如二级列得先 `data-open="1"`），否则会截到没展开的形态而不自知。
- 引用的文件路径要确认存在——改名或删除后，README 里常留下死路径。
- 文中出现的用例数、版本号这类数字顺手核准。

## 3. L1 门槛

```powershell
pnpm typecheck && pnpm test && pnpm build
```

三者都在包目录里跑，且**必须重新 build**：`files` 收的是 `lib/` 或 `dist/`，忘了 build 就会把旧产物发出去。

## 4. 提交

- **提交前先看 `git status`**：工作树里可能有**不是你的改动**（用户或别的会话正在做）。`git add -A` 会一并带走——认出来不是自己的，要么先问，要么只 `git add` 自己那几个文件。
- 提交信息走**文件**（`git commit -F <file>`），避开 PowerShell 的引号与编码把中文弄坏。
- 写**为什么**和**判据来源**，不写「更新了 X」这类从 diff 一眼可见的事。

## 5. 推送

```powershell
git push origin main
```

## 6. tag

**先看现状再决定打哪个**——tag 落后于版本是常态（两个 `@max-null` 插件都落后过好几个版本）：

```powershell
git tag --sort=-creatordate | Select-Object -First 6
git ls-remote --tags origin
```

- 命名 `vX.Y.Z`，与 `package.json` 的 `version` 一致。
- 补打历史版本要谨慎：那会让 release 列表出现一批没有说明的孤儿。

## 7. GitHub Release

**先看有没有**——可能一个都没有，那就是从无到有，而不是「更新」：

```powershell
gh release list --repo Max-Null/<repo> --limit 6
```

用 `gh release create vX.Y.Z --title ... --notes ...`；说明按惯例分组（新增 / 调整 / 修复），**从 `git log --oneline <上个 tag>..HEAD` 提炼，不凭记忆**。

## 8. npm publish（**由用户手动，铁律 9**）

开发会话**不执行** publish。把该给的证据备齐再交接：

```powershell
node -e "console.log('local =', require('./package.json').version)"
npm view <pkg> version      # npm 上的现状
npm pack --dry-run          # 包内容：files 覆盖、产物是刚构建的、LICENSE/README 由 npm 自动带入
```

然后给用户确切命令：

```sh
cd <包目录>
npm publish
```

## 9. SSiD 侧 vendor 同步（**最容易漏的一步**）

**npm 发布 ≠ 装版更新。** 装版从 SSiD 的 vendor 取插件；vendor 不动，装版就不会变。

- 先判断该插件在不在 vendor 里：`ls shell/profile-template/vendor`。当前 7 个：`dsh-capture`、`dsh-context-doctor`、`dsh-quick-toolbar`、`dsh-ssid-env`、`dsh-ssid-panels`、`dsh-ssid-pwsh-retry`、`dsh-ssid-zh-ui`。
- **`dsh-quick-toolbar` 的 vendor 是精简副本**：只收 `lib/` + `cordis.patch.yml` + `package.json`。别按「整目录相等」比。
- **`dsh-quick-toolbar` 不走 `sync:vendor`**：它在清单里登记为 `vendor-only`，而 `sync-vendor.mjs` 只处理 `mode: "full"` 且有 `source` 的包（当前是 `dsh-ssid-panels`、`dsh-ssid-zh-ui`、`dsh-ssid-pwsh-retry`、`dsh-ssid-env`）——脚本明确不碰它。**它的新产物要手工复制到两处**：
  - `shell/profile-template/vendor/dsh-quick-toolbar`（发版基准）
  - `~/.dsh/profiles/web/vendor/dsh-quick-toolbar`（web 运行时）
  - `~/.dsh/profiles/ssid` 下**没有** vendor 目录——该 profile 走 `link:`。

  复制范围就是精简副本的全貌，**4 个文件**：`lib/`（整目录）+ `cordis.patch.yml` + `package.json`。
- **门禁在这一点上是盲的**：`check-vendor-sync` 对 `vendor-only` 包只做**三处 vendor 互比、不比源**，两处都停在旧产物时它们彼此一致、门照样全绿。**「`check:rules` 全绿」不能当作「vendor 是新的」的证据**——要自己比 `lib/client.js` 的大小或版本（2026-09-29 实测：两处都停在 0.10.1 而源已 0.11.0，门是绿的）。
- 不在 vendor 里的插件（`dsh-allostasis` 目前只发 npm）→ **这一节不适用，但要明说「不适用」**，不要略过。
- 顺带确认 `shell/profile-template/package.json` 的 `dependencies` + `dsh.profile.bundles` 里的声明：**精确 pin，无 `^`**，要新版本得显式改那一行。

## 10. 收尾自检

发完之后逐条回答，缺哪条补哪条：

| 问题 | 节 |
|---|---|
| README 里每个 API 名、路径、上限都对得上实现吗？ | §2 |
| 产物是这次构建的吗？ | §3 |
| 工作树里有没有混进别人的改动？ | §4 |
| tag 打了吗？指向这次提交吗？ | §6 |
| Release 建了吗？说明是提炼的还是凭记忆的？ | §7 |
| npm 命令交给用户了吗？包内容核对过吗？ | §8 |
| vendor 同步了，还是明确判定不适用？ | §9 |
