# plugin-center 0.1.7 本机重建：决策记录

> 日期：2026-08-19
> 状态：**实施完成，待 npm publish**（代码已构建 + 双验证全过 + 已提交 619a6e1）
> 关联：`docs/决策/2026-08-19-v0.1.6发布执行-环境核查与阻塞.md`、`docs/决策/2026-08-17-header按钮统一-调查与方案.md`

---

## 一、背景

v0.1.6 发布链待办 1 需要 `@max-null/dsh-plugin-center@0.1.7`（SSiD profile-template 声明 `^0.1.6`，归档重建需 npm 上存在）。

0.1.6/0.1.7 代码原开发于**另一台电脑**（不在手边，无法取得源码）：
- npm 最新仅 0.1.5；GitHub 远程仅 main=`ebc3c0d`（0.1.5）；本机仓库 `H:\MaxNull\WorkStation\dsh-plugin-center` 也是 0.1.5；安装版归档、profile 均 0.1.5——**五处一致，0.1.7 代码唯一存在于另一台电脑**。

## 二、决策（用户拍板）

**本机基于 0.1.5 源码重建 0.1.7 等价实现**。用户确认改动很小且记得全部内容：
> "就是把插件中心的按钮和磁侧边栏的按钮都移到标题栏了，正如 ssid 的代码展示的那样，没做别的"

即 0.1.7 的**功能契约**已由 SSiD 侧 `plugins/dsh-header-unify/lib/client.js` 和决策文档完整定义，本机实现只需满足该契约。

## 三、功能契约（来自 dsh-header-unify client.js + SSiD 决策文档）

| API | 行为 | 消费方 |
|---|---|---|
| `window.__pluginCenterOpen` | 打开插件中心 overlay（0.1.6 已有） | dsh-header-unify 老版回退 |
| `window.__pluginCenterToggle` | 开则关、关则开（0.1.7 新增） | dsh-header-unify 优先调用 |
| `window.__pluginCenterClose` | 关闭 overlay（0.1.7 新增） | dsh-header-unify 开侧栏/底栏前互斥调用 |
| 点遮罩关闭 | overlay 面板外点击遮罩即关闭（0.1.7 新增） | 用户交互 |

## 四、本机 0.1.5 现状（读源码确认）

`client/index.tsx`：
- `openOverlay()` / `closeOverlay()` 已存在（模块级 `overlayOpen` + `overlayListeners` 通知，138-139 行）
- `HeaderButton`（690 行）onClick 只 open，无 toggle
- `OverlayPanel`（702 行）`.pc-overlay` 遮罩**无** onClick 关闭
- `apply()`（794 行）未暴露任何 window API
- 构建：`npm run build` = tsc（src→dist）+ esbuild（client/index.tsx→client.js）

## 五、改动清单（本机重建）

1. ✅ `client/index.tsx`：
   - 新增 `toggleOverlay()`（`overlayOpen ? closeOverlay() : openOverlay()`）
   - `apply()` 内暴露 `window.__pluginCenterOpen/Toggle/Close`，含页面卸载清理（unload 时 delete，防泄漏/重复挂载）+ 重复 apply 守卫
   - `OverlayPanel`：`.pc-overlay` 加 `onClick={closeOverlay}`；`.pc-panel` 加 `onClick={e => e.stopPropagation()}`（面板内点击不触发关闭）
2. ✅ `package.json`：version 0.1.5 → 0.1.7
3. ✅ 构建：`npm run build`（tsc 通过 + client.js 45.6kb）
4. ✅ 验证：
   - `verify-globals.cjs`（新建）：**14 项全过**——API 暴露/可调用/unload 清理/重复守卫/遮罩关闭静态断言
   - SSiD 仓库 `plugins/dsh-header-unify/verify-header-unify.cjs`：**17 项全过**（消费方契约）
5. ✅ git 提交：`619a6e1`（client/index.tsx + package.json + verify-globals.cjs）
6. ⏳ 发布：用户本机 npm login（.npmrc token 已失效 401）→ `npm publish` → 确认 `npm view` 0.1.7
7. ⏳ 发布后继续发布链：清 pnpm metadata 缓存 → prepare-runtime（DSH_NODE/PNPM_CMD 已确认）→ 归档 boot 冒烟 → pack → 自测 → Release → 收尾
8. ⏳ 网络窗口补 push：`619a6e1` + tag `v0.1.7`（本机仓库 origin）

## 六、风险与注意

| 项 | 说明 |
|---|---|
| 与另一台电脑实现的差异 | 无法比对源码；功能契约一致即可（契约由 SSiD 侧定义），实现细节差异无影响 |
| 版本号一致性 | 本机重建后发布的 0.1.7 与另一台电脑未发布的 0.1.7 是同版本号不同实现——但另一台电脑版本从未发布，npm 上无冲突；用户后续拿到另一台电脑代码时如再发布需注意（可升 0.1.8 或直接以本机为准） |
| verify-header-unify.cjs | 该脚本是模拟环境（假 window），验证 dsh-header-unify 逻辑；plugin-center 侧需独立模拟脚本验证 |
| npm 凭据 | 用户手动 login；token 401 是用户侧问题 |
