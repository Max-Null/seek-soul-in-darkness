# dsh-plugin-center 0.2.13：禁用功能失效修复方案

> 日期：2026-08-25
> 状态：方案（未实施，仓库 `Max-Null/dsh-plugin-center`）
> 关联：`docs/发版流程规范.md`（发布链）、本次 SSiD 排查（dsh-web-preview-panel 移出预制）

---

## 1. 背景与现象

SSiD v0.1.12 安装版中，用户在插件中心**禁用 `dsh-web-preview-panel` 并重启思灵**后，
该插件**依旧正常加载**。排查发现 `~/.dsh/profiles/ssid/cordis.patch.yml` 中累积了
两条无意义禁用行：

```yaml
- id: 719442de
  disabled: true

- id: 3af69980
  disabled: true
```

## 2. 根因（已实证）

### 2.1 完整链路

1. **社区插件安装清单的标准格式是无 id 的 insert 子条目**：
   `dsh-web-preview-panel` 包自带 `cordis.patch.yml`（`dsh plugin add` 生成的安装清单）：
   ```yaml
   - insert:
       - name: dsh-web-preview-panel
   ```
2. **DSH loader 对无 id 条目分配随机运行时 id**：
   `@deepseek-ai/cordis-plugin-loader/lib/index.js` L190-192：
   ```js
   if (!options.id) do
     options.id = Math.random().toString(16).slice(2, 10);
   while (this.store[options.id]);
   ```
   → 每次启动随机（`719442de` / `3af69980` 即此类 id，不随启动复用）。
3. **插件中心用随机 id 作为禁用键**：`dist/engine.js` 的 `listInstalled` 返回
   `entryId: entry.id`（运行时 id）；UI 禁用 → `setDisabled(profileDir, <随机hex>, true)`；
   `dist/toggle.js` L159-163 在 patch 文件中找不到 `- id: <随机hex>` 行时**无脑追加**：
   ```yaml
   - id: <随机hex>
     disabled: true
   ```
4. **重启后失效**：条目拿到**新**随机 id；旧禁用行匹配不到任何条目，
   `@deepseek-ai/dsh-app-boot/lib/index.js` 的 `applyEntryPatches` L92-95 对未命中
   patch 仅 `warn("patch: entry %C not found", id)` 后**静默跳过** → 插件照常加载。
   用户再次禁用 → 又追加一行新随机 id → 垃圾行累积（文件里两条即两次禁用痕迹）。

### 2.2 实验验证（`@deepseek-ai/dsh-app-boot` 的 `composeEntries` 实测）

```text
场景 A（现状）：insert 无 id + 随机 id 禁用行
  [warn] patch: entry "719442de" not found
  [warn] patch: entry "3af69980" not found
  → 组合结果中 dsh-web-preview-panel 条目照常存在（禁用无效）

场景 B（修复）：insert 子条目带稳定 id + `- id: dsh-web-preview-panel / disabled: true`
  → 组合结果：{ id, name, disabled: true }（禁用生效）
```

**结论**：问题不是"插件中心不写禁用"，而是**禁用键（随机运行时 id）在重启后失效**。
所有以无 id 形式挂载的插件（即全部 `dsh plugin add` 安装的社区插件）都会命中此 bug；
只有带显式 `id` 的条目（如 SSiD 预制的 `mcp-playwright`）禁用正常。

## 3. 修复方案（改动点）

### 3.1 `src/toggle.ts`（构建产物 `dist/toggle.js`）

去掉"无脑追加"，改为按 name 寻址 insert 子条目；都找不到时拒绝（不再写文件）。

```ts
// setDisabled(profileDir, entryId, name, disabled) 内，现有「按 - id: X 行替换」逻辑之后：
if (!patched) {
  // 新增：按 name 找 insert 子条目行（4 空格缩进），原地升级为带稳定 id
  const child = /^ {4}- name: X$/m  // 用注入的 name 匹配
  if (child 命中) {
    // 替换前：'    - name: dsh-web-preview-panel'
    // 替换后：'    - id: dsh-web-preview-panel\n      name: dsh-web-preview-panel'
    // 然后追加：'- id: dsh-web-preview-panel\n  disabled: true'
    patched = true
  } else {
    return { ok: false, detail: 'no patch row or insert child matches', nowDisabled: null }
  }
}
```

- `readDisabledState`（L66-91）无须改动：禁用后文件里总有 `- id: X / disabled: true`
  行可读，启用（`disabled: false`）复用同一寻址。
- **禁止任何静默追加**：这是垃圾行唯一的产生源。

### 3.2 `src/engine.ts`（构建产物 `dist/engine.js`，L381-390 setToggle）

调 `setDisabled` 前检查 patch 文件中是否存在 `- id: <entryId>` 行，不存在则把寻址
键换成该条目的 `name`（`listInstalled` 的 view 已带 `entry.options.name`）：

```ts
const patchText = readFileSync(join(this.baseUrl, 'cordis.patch.yml'), 'utf8')
const hasRow = new RegExp(`^- id: ${escapeRegExp(id)}$`, 'm').test(patchText)
const key = hasRow ? id : name          // name 来自 view（entry.options.name）
await setDisabled(this.baseUrl, key, name, disabled)
```

### 3.3 RPC 与 UI 透传 name

- `src/rpc.ts`（`dist/rpc.js`）：`setDisabled` 请求体增加 `name` 字段转发。
- `client.js` L1041 附近 `const id = p.entryId`：禁用/启用请求带上 `p.name`
  （列表数据 `buildInstalledPlugin` 已含 `name`，仅需透传）。

### 3.4 防御性兜底（可选）

`setDisabled` 入口：`entryId` 形如 8 位 hex（`/^[0-9a-f]{8}$/`）且 patch 文件中无
对应 `- id:` 行 → 直接拒绝：

```ts
return { ok: false, detail: 'entry has no stable patch id (random runtime id); ' +
  'edit cordis.patch.yml to give its insert child an explicit id:', nowDisabled: null }
```

## 4. 验证口径

1. 单元：`setDisabled(profileDir, <随机hex>, 'dsh-web-preview-panel', true)` →
   文件出现 `- id: dsh-web-preview-panel / disabled: true`，且**无随机 id 行写入**；
2. 组合：`composeEntries([[patch]])` 后条目带 `disabled: true`（场景 B 已验证该形态命中）；
3. 回归：带 id 条目（`mcp-playwright`）禁用/启用行为不变；重复禁用 → "already disabled"；
   不存在的条目 → 返回拒绝（不写文件）。

## 5. 发布链（按 `docs/发版流程规范.md`）

1. 改源码 → `pnpm build`（tsc + esbuild）；
2. **npm publish `@max-null/dsh-plugin-center@0.2.13`（必须在归档重建之前）**；
3. SSiD profile pin `^0.2.10` 经 caret 自动解析到 0.2.13（0.x caret 不跨 minor，
   0.2.13 在 `^0.2.10` 范围内）；
4. `node scripts/prepare-runtime.mjs` 重建归档 → 185 MB 完整性检查；
5. 抽查清单第 3 条（plugin-center version == npm 最新）。

## 6. SSiD 侧已做动作（本仓库，2026-08-25）

- `shell/profile-template/package.json`：删除 `dsh-web-preview-panel` 依赖（移出预制）；
- `shell/profile-template/cordis.patch.yml`：删除 web-preview 挂载 insert（Playwright MCP 保留）；
- `docs/发版流程规范.md`：常见坑新增「cordis.patch.yml 的 insert 子条目必须带显式 id」；
- 本机安装版 profile（`~/.dsh/profiles/ssid`）：移出挂载 + 清理两条无效禁用行（热更生效）、
  删除依赖声明；
- **临时解法（已装用户、不等发版）**：手动把 `- insert:` 下的 `    - name: xxx`
  改为两行 `    - id: xxx` + `      name: xxx`，插件中心禁用即可生效。

## 7. 波及面

- 全部以 `dsh plugin add` 标准格式（无 id insert）安装的社区插件——禁用功能均失效；
- 带显式 id 的条目（SSiD 预制、部分插件自带 id 的清单）不受影响；
- 修复后旧版本已写入的随机 id 垃圾行可手动清理（无功能影响）。
