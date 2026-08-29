# seek-soul-in-darkness — SSiD 壳库指令

思灵（SSiD）Electron 桌面壳库：`shell/`（main.mjs Electron 壳 + kernel.ts 内核启动 + scripts/ 归档构建）、`plugins/`（内置专属插件）、`docs/`（规范/决策）。

> **开发规范第一入口：`docs/SSiD开发手册.md`**（铁律速查 → 工作区规范 → 三环境流转 → 运行模式 → 插件升级 → 内核/归档 → 壳-内核契约 → 坑 → 内置插件规范）。`docs/决策/` 为历史决策与执行记录。

## 常用命令（shell/ 目录）

```sh
npm start              # dev 裸跑（app.isPackaged=false；改代码即热更新）
npm run typecheck      # shell 代码类型检查（改 kernel.ts/main.mjs 后必跑）
npm run smoke          # 无 Electron 内核冒烟（需 SSID_MCP_NODE/SSID_MCP_PW_CLI 环境，见手册）
npm run bundle-kernel  # 重打包 kernel.bundle.mjs（kernel.ts 改动后、发版前必做）
node scripts/prepare-runtime.mjs   # 重建 dsh-runtime.tar.gz（发版收尾；SSID_REGISTRY 见手册）
```

## 内置专属插件（plugins/）

- 源头 + 同步链与发版纪律见手册 §10：不发布 npm、vendor 四份 MD5 一致、改后必同步运行时实体。
- 当前：dsh-ssid-panels（0.1.9）、dsh-ssid-zh-ui（0.1.0）。
- dsh-quick-toolbar（原 dsh-header-unify）已于 2026-08-30 **迁出独立**（仓库 `max-null-plugins/dsh-quick-toolbar`，独立化设计中——设计文档 doc/设计/）；SSiD 暂仍 vendor 集成（同步链：独立仓库构建产物 → 三处 vendor）。

## 文档约定

- 规范修订/新决策 → 先增补手册（含变更记录），配套决策记录进 `docs/决策/`（日期-标题.md）。
- 发版走 `ssid-release` skill + `docs/发版流程规范.md`；npm 发布由用户手动（F2A）。
