---
name: mxy-upgrade-vue3
description: 将 Vue2 Options API 混搭语法升级为标准 Vue3 <script setup lang="ts"> 语法，消除 getCurrentInstance/proxy 等过渡模式
---

请对用户指定的文件执行以下步骤。支持的模式与 `mxy-organize-code` 技能一致：

- **单文件**：IDE 中打开的文件，或直接指定文件路径
- **多文件**：多个文件路径（空格/逗号分隔），或 glob 模式
- **目录**：指定目录路径，展开为该目录下所有 `.vue` 文件（排除 `node_modules`）

## 步骤 1：确定目标文件列表

与 `mxy-organize-code` 的步骤 1 逻辑完全一致。复用其 1a（收集）、1b（glob 展开，>15 个确认）、1c（类型校验——本技能仅处理 `.vue` 文件）。

额外做一步：排除已经是纯 `<script setup lang="ts">` 且未命中任何步骤 2 反模式的组件（此类文件无需转换，标记为"已是最新语法，无需升级"并在汇总报告中列出）。

## 步骤 2：审计反模式

逐文件扫描以下反模式，记录命中的类型和位置：

### 类型 A：`getCurrentInstance()` 获取 proxy

```ts
// ❌ 反模式
const { proxy } = getCurrentInstance()!;
// 或
const { proxy } = getCurrentInstance() as any;
const instance = getCurrentInstance();
```

**常见下游用法**（搜索这些以确认影响范围）：
- `proxy.$IS_MOBILE` — 移动端判断
- `proxy.$message` — 消息提示
- `proxy.$messageBox` — 确认弹窗
- `proxy.$notify` — 通知
- `proxy.$refs` — DOM/组件引用

### 类型 B：`defineComponent({name})` 独立调用

```ts
// ❌ 反模式：在 <script setup> 内部调用
defineComponent({
  name: 'MyComponent',
});

// ❌ 反模式：双重脚本块
<script lang="ts">
export default defineComponent({ name: 'MyComponent' });
</script>
<script setup lang="ts">
// ...
</script>
```

### 类型 C：`export default { setup() }` Options API 包装器

```ts
// ❌ 反模式
export default {
  name: 'MyComponent',
  props: { ... },
  emits: ['...'],
  components: { ... },
  setup(props, ctx) {
    // Composition API 逻辑
  },
};
```

### 类型 D：`export default { ... }` 不含 setup（传统 Options API）

```ts
// ❌ 反模式
export default {
  name: 'MyComponent',
  props: { ... },
  data() { return { ... } },
  computed: { ... },
  methods: { ... },
  mounted() { ... },
};
```

### 类型 E：模板中 `proxy.$IS_MOBILE` 内联判断

```html
<!-- ❌ 反模式：内联三元 -->
<el-dialog :width="proxy.$IS_MOBILE ? '90%' : '68%'" />
<el-table-column v-if="proxy.$IS_MOBILE" />
<el-table-column v-if="!proxy.$IS_MOBILE" label="..." />
```

### 类型 F：`components: {}` 局部注册（Vue2 遗留）

```ts
// ❌ 反模式：显式注册已在 <script setup> 中 import 的组件
export default {
  components: { MyChild },
  setup() { ... },
};
```

## 步骤 3：应用转换

按优先级从高到低执行转换。每个转换之间做一次语法自检（编译宏位置、import 完整性）。

### 转换 P0：`getCurrentInstance()` → 直接导入

这是最机械、最安全的转换，应首先执行。

**P0-1：`proxy.$IS_MOBILE`（JS/TS 中使用）**

```ts
// ❌ 删除
import { getCurrentInstance } from 'vue';
const { proxy } = getCurrentInstance()!;

// ✅ 新增
import { isMobile } from "@/utils";

// 然后全局替换 proxy.$IS_MOBILE → isMobile()
```

**注意**：如果 `getCurrentInstance` 还用于其他目的（`proxy.$message` 等），需一并处理完所有用法后再移除 import。

**P0-2：`proxy.$message` / `proxy.$messageBox` / `proxy.$notify`**

```ts
// ❌ 删除
proxy.$message.success('操作成功');
proxy.$messageBox.confirm('确定吗？');
proxy.$notify({ title: '提示', message: '...' });

// ✅ 新增 import
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';

// 替换
ElMessage.success('操作成功');
ElMessageBox.confirm('确定吗？');
ElNotification({ title: '提示', message: '...' });
```

**P0-3：`proxy.$refs` → 模板 ref**

```ts
// ❌ 删除
proxy.$refs.myInput.blur();

// ✅ 新增
const myInputRef = ref<HTMLInputElement | null>(null);
// 然后在模板中添加 ref="myInputRef"
myInputRef.value?.blur();
```

**P0-4：移除 `getCurrentInstance` import**

确认 `proxy` 的所有用法都已迁移后，删除 `getCurrentInstance` 的 import。

### 转换 P1：`defineComponent({name})` → `defineOptions`

```ts
// ❌ 删除
import { defineComponent } from 'vue';
defineComponent({ name: 'MyComponent' });

// ✅ 新增（vue 的 defineOptions 无需显式导入，编译器宏自动可用）
defineOptions({ name: 'MyComponent' });
```

**双重脚本块合并**：如果存在独立的 `<script lang="ts">` 仅用于 `export default defineComponent({name})`，将其删除，名称注册合并到 `<script setup>` 内：

```ts
// ❌ 删除整个 <script lang="ts"> 块
// ✅ 在 <script setup> 内添加
defineOptions({ name: 'MyComponent' });
```

### 转换 P2：`export default { setup() }` → `<script setup>`

这是结构性重写，必须谨慎。转换步骤：

1. **提取 props**：`props: { ... }` → `const props = defineProps({ ... })`
2. **提取 emits**：`emits: ['...']` → `const emit = defineEmits(['...'])`
3. **删除 `components: {}`**：`<script setup>` 中 import 的组件自动可用
4. **提取 setup 函数体**：将 `setup(props, ctx)` 函数体内的代码提升到 `<script setup>` 顶层
5. **处理 `ctx.emit()`**：在 Composition API 中直接调用 `emit()`（无需 `ctx.` 前缀）
6. **处理命名**：`name: '...'` → `defineOptions({ name: '...' })`
7. **删除 Options API 包装对象**：移除 `export default { ... }`

**验证清单（转换后立即检查）**：
- [ ] `defineProps` / `defineEmits` / `defineOptions` 在 `<script setup>` 顶层，不在函数体内
- [ ] 所有 `ctx.` 前缀已移除（`ctx.emit()` → `emit()`）
- [ ] `components: {}` 已删除，组件通过 import 自动可用
- [ ] 响应式变量（`ref`/`reactive`）名称与模板一致，无遗漏

### 转换 P3：模板中 `proxy.$IS_MOBILE` → 自适应组件

根据 AGENTS.md 的自适应弹窗约定，将模板中的内联 `proxy.$IS_MOBILE` 判断转换为 `<component :is>` 模式。

**P3-1：Dialog/Drawer 自适应**（最常遇到）

```html
<!-- ❌ 删除 -->
<el-dialog :width="proxy.$IS_MOBILE ? '90%' : '68%'" />

<!-- ✅ 替换为标准模式 -->
<component
  :is="containerComponent"
  v-model="visible"
  v-if="visible"
  v-bind="containerProps"
  :close-on-click-modal="false"
>
```

```ts
// ✅ 在 <script setup> 中添加
import { ElDialog, ElDrawer } from 'element-plus';
import { isMobile } from '@/utils';

const containerComponent = computed(() => (isMobile() ? ElDrawer : ElDialog));
const containerProps = computed(() => {
  if (isMobile()) {
    return { direction: 'btt', size: '85%', title: '标题' };
  }
  return { width: '68%', alignCenter: true, title: '标题' };
});
```

**Props 放置规则**（遵循项目约定）：

| 放置位置 | Props |
|----------|-------|
| `<component>` 标签上（静态） | `closeOnClickModal`, `beforeClose`, `showClose`, `destroyOnClose`, `class`, `v-loading` |
| `containerProps` computed 内（动态） | `title`, `width`, `direction`, `size`, `alignCenter` |

**P3-2：`v-if="proxy.$IS_MOBILE"` 列显隐控制**

```html
<!-- ❌ 删除 -->
<el-table-column v-if="proxy.$IS_MOBILE" />
<el-table-column v-if="!proxy.$IS_MOBILE" label="..." />

<!-- ✅ 方案：在 script 中定义 isMobile computed，模板中使用 -->
```

```ts
// ✅ 新增
const isMobileDevice = computed(() => isMobile());
```

```html
<!-- ✅ 模板中使用计算属性 -->
<el-table-column v-if="isMobileDevice" />
<el-table-column v-if="!isMobileDevice" label="..." />
```

**P3-3：`:width` 等属性的内联判断（非弹窗场景）**

```html
<!-- ❌ 删除 -->
<el-dialog :width="proxy.$IS_MOBILE ? '95%' : '800px'" />

<!-- ✅ 替换 -->
```

```ts
const dialogWidth = computed(() => (isMobile() ? '95%' : '800px'));
```

```html
<el-dialog :width="dialogWidth" />
```

**P3-4：完成后的清理**

确认模板中 `proxy.$IS_MOBILE` 已无残留（grep `proxy\.\$IS_MOBILE` 返回空），然后执行 P0-4 移除 `getCurrentInstance` import。

### 转换 P4：`components: {}` 清理

仅在 `<script setup>` 的 Options API 包装器中遇到。直接删除 `components: { ... }` 对象，保留 import 语句。

### 转换执行顺序总结

```
P0 (proxy 替换) → P1 (defineComponent → defineOptions) → P2 (Options API → script setup)
→ P3 (模板 proxy 清理) → P4 (components 清理)
```

如果文件不涉及某个转换（如无 P2），则跳过。**每个文件的所有转换完成后，做一次语法自检。**

### 转换 P5：新增 import 路径校验（硬约束）

在 `<script setup>` 中，所有使用的函数/常量必须有显式的 import。Options API 中通过 `this` / 全局属性访问的函数，转换后可能遗漏 import。以下场景必须逐一核查：

**P5-1：Options API 隐式可用的函数需要显式 import**

原代码中在 setup 函数体内直接使用但无 import 的标识符（可能来自全局 mixin、全局属性、或 Vue 原型扩展），必须找到正确的 import 路径并添加。

**验证方法**：对新增的每个 import，grep 其他 `.vue` 或 `.ts` 文件确认路径正确：

```bash
grep -r "import.*函数名" src --glob "*.vue" --glob "*.ts"
```

**P5-2：常见易错 import 路径速查**

| 函数/组件 | 正确导入路径 | 错误路径（易犯） |
|-----------|-------------|-----------------|
| `downLoadFileFixOSS` | `@/utils/request` | `@/utils` ❌ |
| `downLoadFile` | `@/utils/request` | `@/utils` ❌ |
| `ElMessageBox` | `element-plus` | 容易漏 import |
| `ElNotification` | `element-plus` | 容易漏 import |
| `ElLoading` | `element-plus` | 容易漏 import |
| `useImageByUrl` | `@/utils` | — |
| `usePdfByUrl` | `@/utils` | — |
| `isMobile` | `@/utils` | — |
| `mittBus` | `@/utils/mitt` | `@/utils` ❌ |

## 步骤 4：转换后验证（静态检查）

每个文件转换完成后，检查以下项目：

1. **编译宏位置**：`defineProps`/`defineEmits`/`defineOptions`/`withDefaults` 在 `<script setup>` 顶层，不是函数体内
2. **重复 import**：确认 `getCurrentInstance` 已完整移除；确认 `isMobile`、`ElMessage` 等新增的 import 不重复
3. **模板变量引用**：模板中所有的变量和函数都在 `<script setup>` 中有对应的定义或 import
4. **ref 命名规范**：新创建的模板 ref 遵循 `组件名 + Ref` 后缀（`xxxRef`）
5. **组件名注册**：原 `name: 'Xxx'` 已转为 `defineOptions({ name: 'Xxx' })`
6. **遗漏的 `proxy.`**：grep `proxy\.` 确认模板和脚本中都不再有未处理的 `proxy.` 引用
7. **新增 import 路径正确性**：对每个新增的 import，grep 确认导出源文件确实包含该名称（遵循 P5-2 速查表）
8. **原代码隐式依赖**：原 setup 函数体中使用的标识符如果在原 import 中找不到，说明来自全局/mixin，必须找到正确的 import 路径并添加

**如果验证发现问题，立即修复后再进入下一个文件。**

## 步骤 4.5：运行时编译验证（硬约束）

**全部文件转换完成后，必须执行以下验证**：

1. **启动 dev server**：`npm run dev`
2. **确认终端零编译错误**：检查 Vite 终端输出，如果出现红色错误（error），定位并修复
3. **打开浏览器验证**：导航到受影响的页面路由，确认页面可正常渲染，浏览器控制台无红色报错
4. **关键检查项**：
   - 无 `does not provide an export named` 错误（import 路径或名称错误）
   - 无 `is not a function` 错误（template ref 忘加 `.value`）
   - 无 `Cannot read properties of undefined` 错误（响应式变量未正确暴露到模板）

**运行时验证发现问题时**：定位具体文件 → grep 错误信息中的函数名/变量名 → 检查 import 路径 → 修复 → 刷新浏览器确认 → 继续检查下一个错误。

**验证通过后才能执行 git commit。禁止在运行时验证通过前提交。**

每个文件转换完成后，检查以下项目：

1. **编译宏位置**：`defineProps`/`defineEmits`/`defineOptions`/`withDefaults` 在 `<script setup>` 顶层，不是函数体内
2. **重复 import**：确认 `getCurrentInstance` 已完整移除；确认 `isMobile`、`ElMessage` 等新增的 import 不重复
3. **模板变量引用**：模板中所有的变量和函数都在 `<script setup>` 中有对应的定义或 import
4. **ref 命名规范**：新创建的模板 ref 遵循 `组件名 + Ref` 后缀（`xxxRef`）
5. **组件名注册**：原 `name: 'Xxx'` 已转为 `defineOptions({ name: 'Xxx' })`
6. **遗漏的 `proxy.`**：grep `proxy\.` 确认模板和脚本中都不再有未处理的 `proxy.` 引用

**如果验证发现问题，立即修复后再进入下一个文件。**

## 步骤 5：汇总报告

所有文件处理完成后，输出分类汇总报告：

```
📊 Vue3 语法升级完毕

✅ 已升级 (N个)：
  - src/business/common/ReceivePassiveForm/index.vue
    (移除 getCurrentInstance → isMobile/ElMessage, 1处模板 proxy.$IS_MOBILE → isMobile())
  - src/business/scbm/payPage/AdvancePaymentPay.vue
    (合并双重脚本块, defineComponent → defineOptions)

⏭️ 已跳过 (N个)：
  - src/pages/payHistory/index.vue     (已是最新语法，无需升级)
  - src/styles/theme.scss              (不是 .vue 文件)

❌ 失败 (N个)：
  - src/business/admin/legacy/index.vue  (data() 中使用了 this.$refs 循环引用，需人工审查)
```

**汇总规则**：

- ✅ **已升级**：实际应用了转换的文件，列出具体转换内容
- ⏭️ **已跳过**：无需升级的文件，注明原因
- ❌ **失败**：转换过程中发现复杂依赖或非标准模式，无法安全自动转换，必须注明具体阻塞点

## 步骤 5：汇总报告

所有文件处理完成后，输出分类汇总报告：

```
📊 Vue3 语法升级完毕

✅ 已升级 (N个)：
  - src/business/common/ReceivePassiveForm/index.vue
    (移除 getCurrentInstance → isMobile/ElMessage, 1处模板 proxy.$IS_MOBILE → isMobile())
  - src/business/scbm/payPage/AdvancePaymentPay.vue
    (合并双重脚本块, defineComponent → defineOptions)

⏭️ 已跳过 (N个)：
  - src/pages/payHistory/index.vue     (已是最新语法，无需升级)
  - src/styles/theme.scss              (不是 .vue 文件)

❌ 失败 (N个)：
  - src/business/admin/legacy/index.vue  (data() 中使用了 this.$refs 循环引用，需人工审查)

🔄 运行时验证：
  - Dev server 编译结果：通过 / 失败（N个错误）
  - 修复轮次：X 轮，N 个问题
```

**汇总规则**：

- ✅ **已升级**：实际应用了转换的文件，列出具体转换内容
- ⏭️ **已跳过**：无需升级的文件，注明原因
- ❌ **失败**：转换过程中发现复杂依赖或非标准模式，无法安全自动转换，必须注明具体阻塞点
- 🔄 **运行时验证**：记录 dev server 编译结果和修复轮次

## 与 mxy-organize-code 的关系

本技能和 `mxy-organize-code` 是两个独立的步骤：

```
mxy-upgrade-vue3 (语法升级)  →  运行时验证 (步骤4.5)  →  mxy-organize-code (注释+排序+清理)
```

- **不要**在运行时验证通过前执行 git commit
- **不要**在转换后自动执行整理代码（转换可能引入 bug，需人工先验证）
- **建议**用户在验证通过后手动运行 `mxy-organize-code`
- `mxy-organize-code` 的步骤 1b 会检测 Vue2 混搭模式，提示用户先运行本技能

## 约束

- **不改变任何运行时行为** — 仅调整语法和 API 调用方式，不改业务逻辑
- **不新增依赖** — 新 import 的来源（`@/utils`、`element-plus`）都是项目已有依赖
- **保留原有 import 路径风格** — 不强制统一 `@/stores` vs `@/stores/modules/xxx`
- **转换后必须语法自检** — 每个文件的每次转换都要验证编译宏位置和 import 完整性
- **顺序执行** — 批量模式下逐文件处理，不并行
- **遇到复杂模式时降级为标记** — 发现转换后可能产生 bug 的模式（如循环引用的 `data()`），标记为失败并说明阻塞点，不强行转换
- **保留 `$IS_MOBILE` 全局属性注册** — `main.ts` 中的 `app.config.globalProperties.$IS_MOBILE` 保持不变（本技能只迁移使用方，不修改框架级配置）
- **运行时验证为硬约束** — 全部文件转换后必须启动 dev server 验证零编译错误，禁止在验证通过前 git commit
- **新增 import 必须 grep 验证路径** — 遵循 P5-2 速查表，禁止凭记忆猜测 import 路径（如 `downLoadFileFixOSS` 来自 `@/utils/request` 而非 `@/utils`）
