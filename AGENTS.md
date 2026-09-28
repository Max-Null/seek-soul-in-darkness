# seek-soul-in-darkness — SSiD 壳库指令

思灵（SSiD）桌面壳库：`ssid-desktop/`（**当前壳** —— 对官方 DSH 桌面端底座的改造源码，构建与落点见其 `README.md`）、`shell/`（**自建壳时代产物，已归档**；仅 `profile-template/` 与 `scripts/` 仍在维护）、`plugins/`（内置专属插件）、`docs/`（规范/决策）。

> **开发规范第一入口：`docs/SSiD开发手册.md`**（铁律速查 → 工作区规范 → 三环境流转 → 运行模式 → 插件升级 → 内核/归档 → 壳-内核契约 → 坑 → 内置插件规范）。`docs/决策/` 为历史决策与执行记录。

## 硬约束：不改 DSH 源码

`deepseek-harness/` 与 `dsh-web-runtime/` 里的 DSH 源码**只引用不改**（用户长期约定，工作区铁律 2.0）——目的是跟随 DSH 版本迭代；改了源码就再也跟不上上游，还会让 dev（tsx 跑 checkout 源码）与装版（加载 profile 里的官方 npm 包）跑**行为不同的实现**。

需要适配时只改我们自己的东西：profile 的 `cordis.patch.yml` patch 条目、`max-null-plugins/` 下的插件源码、本库的壳代码（**当前在 `ssid-desktop/`**，自建壳时代的留在 `shell/`）。机械检查：`node shell/scripts/check-dsh-checkout-clean.mjs`（已接入 `npm run check:rules` 的 `dsh-clean` 门）。

**读 DSH 源码做判断前先 `git status`**：工作树脏时先查改动来历（`docs/决策/` + `git log`/`stash` + `.build/` 下的 patch 脚本），否则会把补丁版行为当成官方行为（2026-09-14 的 405 排查即因此绕圈）。涉及运行时行为时，以**目标环境实际加载的产物**为准（`~/.dsh/profiles/<p>/node_modules/**/lib/*.js`），而不是 checkout 源码。

## 常用命令（shell/ 目录）

```sh
npm run check:rules     # 六个门（含 dsh-clean）
npm test                # 门禁脚本自测
npm run sync:vendor     # vendor 同步
```

> ⚠️ `shell/scripts/` 里的 **`prepare-runtime.mjs` 与 `verify-release.mjs` 服务于自建壳时代的 `dsh-runtime.tar.gz` 归档**——fork 形态不再产出该归档（内核随包进 asar 的 `dsh/`），这两个脚本已无对象。**`ssid-release` skill 已改写为 fork 版**（自建壳那套收缩到文末「附：自建壳时代」一节），照搬那节里的步骤才会走弯路。

自建壳时代的 `npm start` / `npm run typecheck` / `npm run smoke` / `npm run bundle-kernel` 已随运行时归档，`shell/package.json` 里不再有这些脚本。**当前壳的构建入口与落点见 `ssid-desktop/README.md`**——构建在带 DSH 全历史的开发主轴 checkout（`.ssid-build/checkout`，分支 `ssid-desktop-fork`）里做，不在本工作区直接构建。

## 内置专属插件（plugins/）

- 源头 + 同步链与发版纪律见手册 §10：不发布 npm、vendor 各份指纹一致、改后必同步运行时实体。
- 当前：dsh-ssid-panels（0.1.11）、dsh-ssid-zh-ui（0.1.0）——源码在 `plugins/`，与 vendor 各份**逐文件全等**（含 `src/`、`tests/`）。**「三处 vendor」随 A′ 随包插件集收缩成两处**：运行时 profile 里已没有 `vendor/`（出厂插件改走 `link:` 指向 `<resources>/ssid-plugins/node_modules/<pkg>`），实际比对面是 **源 + 发版基准 `shell/profile-template/vendor` + web 运行时 `~/.dsh/profiles/web/vendor`**。
- dsh-quick-toolbar（原 dsh-header-unify）已于 2026-08-30 **迁出独立**，源头在 `max-null-plugins/dsh-quick-toolbar`，`plugins/` 下不保留副本（`plugins/dsh-quick-toolbar` 残骸已于 2026-09-10 清理）；SSiD 侧仍 vendor 集成，同步链 = 独立仓库构建产物 → vendor 各份。
- 该插件的 vendor 是**精简副本**：只收 `lib/` + `cordis.patch.yml` + `package.json`，源码/测试/截图/README 都不进 vendor——核对时不要按"整目录相等"比。

## 文档约定

- 规范修订/新决策 → 先增补手册（含变更记录），配套决策记录进 `docs/决策/`（日期-标题.md）。
- 发版走 `ssid-release` skill + `docs/发版流程规范.md`；npm 发布由用户手动（F2A）。
