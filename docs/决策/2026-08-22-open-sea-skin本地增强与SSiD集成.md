# open-sea-skin 本地增强与 SSiD 集成（2026-08-22）

## 背景

open-sea-skin（d-dev0101/open-sea-skin，WebGPU 海洋皮肤，release tarball 安装）加入 SSiD 预制后，用户要求：设置面板增加「启用开关（ossEnabled）」「自动昼夜循环开关（autoCycle）」「恢复默认」按钮。

## 决策：fork 本地构建，tarball 进归档

- **不改官方 release 依赖**（URL tarball 无法承载改动，也不维护外部 fork 发布链路）
- **本地 fork**：源码入库 `plugins/open-sea-skin/`（基于上游 main v1.2.1，去掉 .git），改动集中在 `shared/skin-core.js`
- **构建产物**：`node scripts/build-runtime.mjs && node scripts/build-dsh-bundle.mjs` → `plugin/client.js`（skin-core + localStorage adapter 拼接）
- **打包**：`npm pack` → `open-sea-skin-1.2.1.tgz`（383KB，24 文件，files 字段含 plugin/native-dist/cordis.patch.yml）
- **预制引用**：`shell/profile-template/package.json` 依赖 `open-sea-skin: file:./vendor/open-sea-skin-1.2.1.tgz`（tarball 存 `shell/profile-template/vendor/`）——归档构建离线可用，不依赖上游 release

## 改动内容（shared/skin-core.js）

1. **启用开关**：面板新增 checkbox，绑定 `ossEnabled`；`applyEnabled` 调整——禁用时**只卸载海洋背景（frame/glass），保留按钮/面板**（否则设置入口消失无法再启用；2026-08-22 实测原实现 `unmount()` 会把按钮一起移除）
2. **自动昼夜循环开关**：checkbox 绑定 `ossAutoCycle`（原面板无此开关，手动拖「日光」会置 false 且无法恢复）
3. **恢复默认按钮**：重置 state 为 DEFAULTS（45/55/72/循环开）→ 写 localStorage 5 键 → 同步 UI/玻璃/海洋/启用状态
4. 面板样式（.oss-switch / .oss-reset）沿用海洋主题（#8fe9e4 accent）

## SSiD 集成链路（标题栏入口）

- `shell/titlebar.html/js`：插件中心按钮左侧新增「海洋皮肤」按钮 → IPC `ssid:title:action('open-sea-skin')`
- `shell/main.mjs`：action 通用转发（无需改）→ mainView 派发 `ssid:titlebar` detail='open-sea-skin'
- `plugins/dsh-header-unify/lib/client.js`：监听该事件 → `document.getElementById('__open-sea-skin-btn__').click()`
- **隐藏原浮动按钮**：`visibility:hidden + pointer-events:none`（**不能用 display:none**——面板按按钮 rect 定位，display:none 后 rect 全 0 面板飞出视口，2026-08-22 实测）
- 标题栏 asar 热替换生效（`resources/app.asar` 解包→替换→重打包，原包备份 `app.asar.bak-0622`）；正式分发需 `npm run pack` 重新打安装包

## 配置存储与重置（实证自 plugin/client.js）

localStorage 5 键：`ossEnabled` / `ossSea` / `ossTime` / `ossGlass` / `ossAutoCycle`。
手动重置（DevTools console）：`['ossEnabled','ossSea','ossTime','ossGlass','ossAutoCycle'].forEach(k => localStorage.removeItem(k))` 后刷新。
面板「恢复默认」按钮等效实现（无需 DevTools）。

## 后续注意

- profile 的 node_modules/open-sea-skin 为手动替换的本地构建（1.2.1）；**执行 pnpm install 前须先完成归档流程**（否则被恢复为官方 1.2.0 URL 版）
- 归档构建（prepare-runtime）时 file: tarball 依赖随 profile-template 复制，离线可装
