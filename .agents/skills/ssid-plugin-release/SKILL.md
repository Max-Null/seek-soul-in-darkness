---
name: ssid-plugin-release
description: "`@max-null/*` 单个插件的收尾与发布：README 与实现核对、版本决策、L1 门槛、提交、推送、一次触发完成 npm publish + tag + Release、SSiD 侧 vendor 同步。触发词：用户说『插件收尾/插件发布/发布插件/更新 tag/更新 release』，或一次列出一串收尾动作（『更新 readme+提交+推送+更新 tag+更新 release+发布』）时使用。与 ssid-release 分工：那个管 SSiD 壳发版（安装包），本文管插件发版（npm 包）。"
---

# 插件收尾与发布（`@max-null/*`）

> **与 `ssid-release` 的分工**：`ssid-release` 管 **SSiD 壳**（安装包、`latest.yml`、asar 内核）；本文管**单个插件**（npm 包）。插件发完 npm 之后，按 §9 判断要不要同步 SSiD 侧的 vendor——**那是另一件事，别合并**。
>
> **正本与生效副本**：正本在 `seek-soul-in-darkness/.agents/skills/ssid-plugin-release/`（受 git 管）；**实际生效的是 `~/.dsh/skills/ssid-plugin-release/`**。改完正本必须同步过去（`Copy-Item`），否则改了不生效、且没有任何提示。
>
> 路径基准：插件源码在 `H:\MaxNull\WorkStation\max-null-plugins\<name>\`；SSiD 侧在 `H:\MaxNull\WorkStation\seek-soul-in-darkness\`。

## 0. 这套流程防的是什么

用户往往一次说一串：「更新 readme + 提交 + 推送 + 更新 tag + 更新 release + 发布」。逐条执行**必然**会漏掉 §9——**npm 发了但 vendor 没跟，装版不会变**，而且要等下次发版才暴露。所以逐节过一遍，每节要么做，要么明确报告「不适用」。

2026-10-21 起，tag 与 Release 由 publish workflow 一并完成（§6/§8）：用户这么说时，不要再去手工建 tag/Release，把那一串收敛成「提交 → 推送 → 触发 workflow → 验收三件产物」。

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

## 6. tag 与 GitHub Release（已并入 workflow，不再手工建）

`vX.Y.Z` 的 tag 与同名 Release 由 publish workflow 的最后一步创建（见 §8），**不要手工再建一遍**。手工只用于**补历史**或排查：

```powershell
git tag --sort=-creatordate | Select-Object -First 6
git ls-remote --tags origin
gh release list --repo Max-Null/<repo> --limit 6
```

- 命名 `vX.Y.Z`，与 `package.json` 的 `version` 一致，指向「发布时刻的 HEAD」。
- 补打历史版本要谨慎：那会让 release 列表出现一批没有说明的孤儿。
- **先看现状**：tag 落后于版本是常态（两个 `@max-null` 插件都落后过好几个版本）。

## 7. Release 的说明从哪来

workflow 用 `scripts/release-notes.mjs <version>` 从 `CHANGELOG.md` 提取 `## [<version>]` 段；找不到（或该仓没有 CHANGELOG）时退回 GitHub 自动生成的 notes，**不会阻断发布**。所以：

- **发版前确认 CHANGELOG 有这一版**——缺了不会失败，但 Release 会变成一串 commit 标题。2026-10-21 批量升级时实测：9 个仓没有 CHANGELOG，`dsh-chinese-thinking` 与 `dsh-tone-layer` 的 CHANGELOG 落后一版。
- 纯文档的连续补丁可以合并成一个 Release（如 0.5.3 / 0.5.4 并入 0.5.5），但**行为变更必须各有一个**——否则 release 列表里会出现没有独立说明的版本。
- **Release 建完把 Latest 指对**：GitHub 把「最后创建的」标为 Latest，补旧版本后要 `gh release edit <最新> --latest` 纠回。
- **判据**：`gh release list` 的第一条必须等于刚发的版本；不是就补。

## 8. 发布（GitHub Actions + OIDC，一个触发点做三件事）

**不在本地跑 `npm publish`。** 版本提交与推送后，触发仓库里的 publish workflow：

```powershell
gh workflow run publish.yml -R Max-Null/<repo> -f dry-run=false
```

它依次做：`install --frozen-lockfile → typecheck → test → build → npm publish --provenance → 打 vX.Y.Z tag → 建 GitHub Release`。**publish 失败则后面的步骤不执行**，不会留下「有 tag 没包」的版本；tag 与 Release 各自幂等（已存在就跳过，不覆盖指向）。

**触发权在开发会话**（2026-10-21 用户明示「改成由你来操作就好」）：触发、打 tag、建 Release 都由会话执行，用户只发起一次「发版」指令。控制点仍是「人发起」，不是自动——**不要**加 `push: tags` 触发器。

发布前核对本地包内容（产物是这次构建的、`files` 覆盖对）：

```powershell
node -e "console.log('local =', require('./package.json').version)"
npm pack --dry-run
```

**硬前提：npm 侧的 Trusted Publisher 必须已为该包配好**（2026-10-19 在 `dsh-allostasis` 上实际踩过；2026-10-28 在 `dsh-plugin-center` 上又踩一次——那个仓此前的 tag/Release 都是手工建的，workflow 从未真正 publish 过，trust 一直是空的）。查法：

```powershell
npm trust list @max-null/<pkg>   # 需要 2FA；输出 "No trust configurations found" 就是没配
```

**只有网页配得可靠**：`https://www.npmjs.com/package/@max-null/<pkg>/access`（打不开就进包页 → **Settings** → **Trusted publishing**）→ 选 **GitHub Actions**，字段是这些：

- `Organization or user` 与 `Repository` 是**两栏**，不是一个 `owner/repo`（旧文档的写法对不上现在的 UI）。
- `Workflow filename` 只填文件名 `publish.yml`（带 `.yml`，不要写 `.github/workflows/` 路径）。
- `Environment` **留空**：workflow 里没有定义 environment，填了就永远匹配不上。
- `Allowed actions` **必须勾上 allow `npm publish`**：2026-09-03 之后新建的配置默认**只给 `npm stage publish`**。不勾这一项，前面的字段全对也会被拒（E404），看起来和「trust 没配」一模一样。

**新配置有 2 天验证期**：必须在 2 天内完成首次成功发布，否则自动过期、且不能编辑，只能删掉重建。配完立刻触发 workflow，别隔天再跑。

**别信 CLI**：`npm trust github <pkg> --file publish.yml --repo <repo> --yes` 在 2FA 下会中途弹 OTP，失败时**不报错**，事后 `trust list` 仍是空——看起来像成功。

**怎么判定真发成功**：workflow 日志里必须同时出现 `npm notice Publishing to https://registry.npmjs.org/ ...` 与 `+ @max-null/<pkg>@X.Y.Z`。只有 provenance 签名行而**没有** `Publishing to` 那行 = 授权被拒（E404），是 trust 没配；**有** `Publishing to` 而随后仍 E404 = 权限层被拒，先查 `Allowed actions` 有没有勾 `npm publish`，再查 `Environment` 是否留空。

**registry 有延迟**：`dist-tags` 更新实测要 **2–4 分钟**（同一个包先后两次分别是 2 分钟和 4 分钟），中间的 404 不代表失败；要绕本地缓存就直接查官方源。

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
| workflow 跑完了吗？tag 指向这次提交吗？ | §6 |
| Release 建了吗？notes 来自 CHANGELOG 还是自动生成？Latest 指对了吗？ | §7 |
| npm / tag / Release 三件都验收了吗？ | §8 |
| vendor 同步了，还是明确判定不适用？ | §9 |
