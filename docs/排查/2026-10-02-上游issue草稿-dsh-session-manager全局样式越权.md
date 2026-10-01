# 上游 issue 草稿：dsh-session-manager 全局样式越权

- **提交目标**：https://github.com/hkkz9522/dsh-session-manager/issues
- **环境**：DSH 0.2.0-rc.1（SSiD 1.1.5）· dsh-session-manager 0.6.1
- **源码位置**：`lib/client.js:547`，注入为 `<style data-plugin="dsh-session-manager" data-plugin-css="dsh-session-manager/session-manager">`
- **状态**：待提交（草稿由 SSiD 工作区整理，提交由用户执行）

---

## [bug] 无作用域的全局 `!important` 命中官方与其他插件的元素：`z-index` 抬到 20000、官方消息气泡被加边框

### 现象

插件注入的样式里有一条**没有作用域前缀**的规则（原文为单行压缩，此处展开）：

```css
[role=tooltip], .bubble, [class*=bubble], .tooltip, .sm-tooltip {
  z-index: 20000 !important;
  box-shadow: none !important;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.15)) !important;
  border-top-width: 1px !important;
  border-left-width: 1px !important;
  border-right-width: 1px !important;
  border-bottom-width: 1px !important;
  filter: none !important;
}
```

五个选择器里只有 `.sm-tooltip` 属于本插件，其余四个命中的都是**别人的元素**：

| 选择器 | 实际命中 |
| --- | --- |
| `.bubble` / `[class*=bubble]` | DSH 官方消息气泡（CSS module 类名形如 `J9hlTW_bubble`、`h5HCPa_bubble`，含 `bubble` 子串，因此被 `[class*=bubble]` 子串匹配） |
| `[role=tooltip]` | DSH 官方悬停浮层（`packages/client/ui-primitives` 的 Tooltip） |
| `.tooltip` | 其他插件使用同名类名的 tooltip |

### 实测影响

1. **官方消息气泡被强加一圈 1px 边框。** 官方 `.bubble` 规则里没有 `border` 声明；`box-shadow` / `filter` 本来就是 `none`，所以这条规则里真正生效的是 `border`。在 DevTools 中选中任意用户消息即可看到。
2. **所有 `[role=tooltip]` 元素被抬到 20000。** DSH 官方没有 z-index token 层（`ui-sidebar-right/README.md` 明写），浮层档位散落在各 CSS module 里，最高档是 Toast / ContextMeter 的 **1100**（Modal / ImageLightbox 1000，Menu / HoverCard 100/101）。20000 会压过模态框与 toast。
3. **用户报障：浮层遮挡输入区。** 官方 composer 是 `position: absolute/sticky; z-index: 7`（`*_composerSeat`），任何 100 以上的浮层都能压住它。此条的归因尚未完全坐实，见文末「待确认」。

### 期望

插件只影响自己命名空间下的元素。

### 推荐修复

1. **收窄选择器**：删掉 `[role=tooltip]`、`.bubble`、`[class*=bubble]`、`.tooltip` 四个选择器，只保留 `.sm-tooltip`（以及 `.sm-` 前缀下的其他类）。
2. **取值回到官方档位**：推荐 **`z-index: 1100`** —— 与官方 Toast / ContextMeter 同级，仍在 Modal(1000) 之上，不越出官方梯度。

```css
.sm-tooltip {
  z-index: 1100 !important;
  box-shadow: none !important;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.15)) !important;
  filter: none !important;
}
```

3. **顺带建议**：本插件自己的面板与对话框用的是 9999–10010 一档（`.sm-panelDialog` 9999、`.sm-confirmDialog` 10000、`.sm-migrateDialog` 10001、`.sm-annotationDialog` 10002、`.sm-annotationSurface` 10003、`.sm-annotationToggleOpen` 10004、`.sm-updateDialogLayer` 10010），而 DSH 官方右侧面板只有 10/40、Modal 1000。层级整体高于宿主梯度会让「谁盖住谁」变得不可预测。把面板压回官方档位（1000/1100 一带）比把别人的元素抬到 20000 更稳。

### 复现

1. 安装 `dsh-session-manager@0.6.1`，打开任意会话。
2. DevTools 中选中一条用户消息 → 样式面板会显示这条规则命中（`[class*=bubble]`），元素被加上 1px 边框。
3. Console：`getComputedStyle(document.querySelector('[class*=bubble]')).zIndex` → `"20000"`。

### 待确认（提交前可删）

- 「浮层遮挡输入区」这一条：官方 `.bubble` 规则里**没有 `position`**（计算值 `static`），因此 `z-index` 对气泡本身是空转；遮挡的那枚元素尚未定位到具体是哪一枚。若作者需要复现细节，可追问命中的元素身份。

---

## 附：本次取证过程（不进 issue 正文）

- 装版真实产物（`resources/app.asar`）内 `z-index:20000` / `zIndex:20000` **零命中**；官方 `.bubble` 两条规则（`J9hlTW_bubble`、`h5HCPa_bubble`）均无 `position`。
- profile 实体与随包插件集一致：`~/.dsh/profiles/ssid/node_modules/dsh-session-manager` 是指向 `<resources>/ssid-plugins/node_modules/dsh-session-manager` 的 junction，版本 0.6.1，两处 `lib/client.js:547` 逐字节相同。
- 用户侧截图（遮挡输入区）由用户提供，未纳入草稿正文；如需附图，可按工作区惯例提交到某个分支后用 `raw.githubusercontent.com` 链接嵌入。
