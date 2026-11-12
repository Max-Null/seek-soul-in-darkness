# 给 dsh-dream-skin 的新 issue 草稿（2026-11-12）

提交位置：<https://gitcode.com/LLLAAAAA/dsh-dream-skin/issues/new>
与既有 [#2](https://gitcode.com/LLLAAAAA/dsh-dream-skin/issues/2) / [PR #2](https://gitcode.com/LLLAAAAA/dsh-dream-skin/pull/2) 的关系：同一现象。#2 提的是「注册插槽 + 停用旧钩子」，本条补的是**宿主侧源码级根因**、**插槽方案的实测结果**，以及「旧钩子必须与插槽同一次改完」这条容易漏的约束。

---

## 标题

设置导航图标仍重复：宿主 0.2.2-rc.1 把图标下沉了一层，`> svg:first-child` 全面失效

## 正文（可直接粘贴）

```markdown
## 环境

- dsh-dream-skin **11.7.0**（npm 最新，即 `lib/client.js` 里 `[data-dsh-dream-skin-nav] > svg:first-child{display:none}` 这一版）
- DeepSeek Harness **0.2.2-rc.1**，Windows / Web 端
- 对照版本：0.2.1-rc.4（同一插件当时显示正常）

## 现象

设置面板里「个性化皮肤」一行同时出现**调色板**和宿主默认**齿轮**两个图标。#2 描述过这个现象；这里补的是宿主侧的源码级根因、以及插槽方案的实测结果。

## 根因（宿主两版源码对比）

同一文件 `packages/client/ui-settings-general/src/client/SettingsRoot.tsx`：

0.2.1-rc.4 —— svg 就是按钮的直接子元素：

```jsx
<button ...>
  {navIcon(row.id)}                       // <svg class="...navIcon" .../>
  <span className={css.navLabel}>{row.label}</span>
</button>
```

0.2.2-rc.1 —— 图标被 span 包住，并新增 `settings.section.icon` 插槽（`fallback` 仍是齿轮）：

```jsx
<button ...>
  <span className={css.navIcon} aria-hidden="true">
    {renderSlot('settings.section.icon', { size: 16, active: row.id === active },
      { only: row.id, fallback: navIcon(row.id) })}
  </span>
  <span className={css.navLabel}>{row.label}</span>
</button>
```

插件侧的钩子匹配的是 `[MARKER] > svg:first-child`（直接子元素），而当前 svg 已经在 `span.navIcon` 里，**选择器完全不命中**——齿轮不再被隐藏，`::before` 的调色板照旧绘制，于是两个图标并存。插槽本身不是重复的原因，重复来自「旧 DOM 钩子 + 新结构」共存。

## 推荐方案：注册 `settings.section.icon`（#2 已提，这里补验证）

```js
ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
  name: 'settings.section.icon',
  id: 'dream-skin',                 // 必须等于 settings.section 的 id
  order: 10,
  label: () => sectionNavLabel(),   // 与 section 同源
}, ({ size }) => <PaletteIcon size={size} />))
```

同时把旧钩子（`SETTINGS_NAV_MARKER` / `NAV_ICON_CSS` / `MutationObserver`）整段删掉——注册成功时宿主不会再渲染默认齿轮，旧钩子的 `::before` 反倒会变成新的重复源。

**已实测**：在 0.2.2-rc.1 的隔离实例里，另外四个用同一套 `::before + mask` 方案的插件（dsh-memory、dsh-skill-mcp-center、dsh-achievements、dsh-ssid-panels）改成插槽注册并删除旧钩子后，导航行 DOM 变为「一个 `span.navIcon` + 一个 `<svg>` + `::before` 为 `none`」，视觉上单图标；而 11.7.0 的「个性化皮肤」行仍是 `::before` 调色板（16px）+ 宿主 fallback 齿轮并存。改前改后在同一实例里是并行对照。

## 过渡方案（如果插槽重构要排队）

把选择器扩成两段，先止血：

```diff
- "[" + MARKER + "] > svg:first-child{display:none}"
+ "[" + MARKER + "] > svg:first-child," +
+ "[" + MARKER + "] > *:first-child > svg:first-child{display:none}"
```

旧结构走第一段，新结构走第二段。旁证：`@max-null/dsh-plugin-center` 早前因为另一次结构变化就是这么写的，它在 0.2.2-rc.1 下图标正常。

## 建议的落地顺序

1. 合 PR #2（插槽注册 + 删旧钩子），两者必须同一次改完——只删不移或只移不删都会留下一个重复源；
2. 发一个补丁版（如 11.7.1）：npm 上的 11.7.0 仍是双图标版本，装它的人每次开设置都会看到；
3. 若插槽重构排期较长，先合过渡方案里的一行选择器改动。
```

---

## 备注（不提交，给自己人看）

- 判断依据全部可从宿主源码读到：`.ssid-build/checkout` 的 `dsh-v0.2.1-rc.4` 与 `HEAD`（`dsh-v0.2.2-rc.1`）两版 `SettingsRoot.tsx`。
- 我方四处已改用插槽（`settings.section.icon`），dev 实测单图标；`dsh-plugin-center` 无需改动（它的两段式选择器本来就兼容）。
- 本 issue 通过 `scripts/gitcode.mjs issue --body-file …` 提交，正文取自上面这个 markdown 块。
