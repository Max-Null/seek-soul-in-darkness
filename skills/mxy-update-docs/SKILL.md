---
name: mxy-update-docs
description: >
  根据项目实际情况更新 AGENTS.md，再根据 AGENTS.md 同步更新 README.md，保持项目文档同步。
  当用户提到"更新文档""同步文档""更新 AGENTS.md""更新 README""补文档""文档过时"时使用。
  不适用于新建项目的文档初始化（无 AGENTS.md 时先用 doc-coauthoring/ brainstorming 确定内容），
  也不适用于功能设计方案（用 mxy-design-doc）和 PPT/Word 等办公文档（用 pptx/docx）。
---

请严格执行以下步骤，不得跳过任何一步：

## 步骤 1：探索项目并更新 AGENTS.md
分析当前项目的代码结构、技术栈、依赖和关键设计，与项目根目录的 `AGENTS.md` 对比：
- 遍历 src/ 目录，确认实际目录结构是否与 AGENTS.md 中的项目结构一致
- 检查 package.json 中的依赖和 scripts 是否与 AGENTS.md 中的技术栈和开发命令一致
- 检查路由、Store、Hooks、组件等模块是否有新增/删除/重命名
- 检查业务模块目录是否有增减

发现差异后，先更新 `AGENTS.md`，确保其反映项目当前真实状态。更新原则：
- 保持 AGENTS.md 的排版风格和章节顺序不变
- 项目结构树以实际目录为准
- 技术栈以 package.json 为准
- 业务模块以实际目录为准

## 步骤 2：读取 AGENTS.md
读取更新后的 `AGENTS.md`，提取以下关键信息：
- 技术栈（框架/构建/语言/状态管理/路由/UI库/CSS/包管理/Node版本）
- 项目结构（src/ 目录树）
- 产品线与业务模块
- 核心功能描述（SSE 流式对话 / 切换企业 / 语音输入 / 多端适配）
- 安全机制
- 开发命令

## 步骤 3：读取 README.md
读取项目根目录的 `README.md`，逐段对比 AGENTS.md 中的信息。

## 步骤 4：识别差异
对比两个文件，找出 README.md 中以下章节是否过时：
- **技术栈表格**：依赖项是否与 AGENTS.md 一致
- **项目结构树**：src/ 下目录是否新增/删除/重命名
- **产品线表格**：业务模块是否增减
- **核心功能**：功能描述、关键文件列表、设计要点是否与 AGENTS.md 同步
- **安全章节**：安全机制描述是否完整
- **开发命令**：npm/pnpm scripts 是否有变化

## 步骤 5：更新 README.md
根据差异清单，逐章节更新 README.md。更新原则：
- 保持 README.md 的排版风格和章节顺序不变
- 技术细节以 AGENTS.md 为准，但表达方式保持面向用户（README 是给人看的，AGENTS.md 是给 AI 看的）
- 不要新增 AGENTS.md 中没有的信息
- 不要删除 README.md 中 AGENTS.md 未覆盖但仍有价值的内容
- 项目结构树中的注释（括号说明）保持简洁

### Mermaid 可视化图表规范（硬约束）

README.md 是给人看的，以下场景**必须**使用 Mermaid 图表替代纯文本描述：

| 场景 | 图类型 | 示例 |
|------|--------|------|
| 项目分层架构 | `graph TB` + `subgraph` | 用分组展示各层及依赖箭头 |
| 多参与者交互流程 | `sequenceDiagram` | SSE 流式对话、跨系统 SSO 跳转 |
| 单系统步骤流转（含分支） | `flowchart TD` | 切换企业 cleanup 步骤、登录鉴权 |
| 数据处理管线（横向） | `flowchart LR` | 语音输入音频管线、文件上传处理链 |

**选择原则：**
- 涉及 ≥2 个参与者（用户/前端/后端/第三方）→ `sequenceDiagram`
- 纯前端/纯后端内部步骤流转，有分支判断 → `flowchart TD`
- 数据/信号从左到右流经多个处理阶段 → `flowchart LR`
- 展示系统分层/模块分组关系 → `graph TB` + `subgraph`

**反模式：**
```
❌ 用纯文本箭头链描述流程：
用户点击 → A → B → C → 完成

❌ 用文本树形结构展示架构（仅限项目结构章节）：
src/
├── api/
├── components/
```

**节点文本换行：** 需要多行显示时用 `<br/>` 换行，不要在一行内堆砌过长文本。

**保持同步：** AGENTS.md 中新增或修改核心业务流程时，README.md 对应章节的 Mermaid 图必须同步更新。

## 步骤 6：输出更新摘要
用中文按以下维度总结本次更新：
- **AGENTS.md 更新**：AGENTS.md 中的变更内容
- **新增章节**：README.md 中全新的章节
- **内容同步**：从 AGENTS.md 同步过来的变更
- **结构调整**：章节顺序或格式调整
- **未改动**：保持不变的部分
