# 社区插件评估：DSH-better-sidebar 与 OpenViking

> 日期：2026-08-16
> 触发：用户分享两个社区仓库
> 状态：评估完成，方向待用户拍板

## 一、DSH-better-sidebar（omdsh-dev，1.6k★，MIT）

### 是什么

**服务化的侧边栏框架**：`ctx.betterSidebar.registerTab` / `registerFileViewer`
开放给所有插件，内置 7 tab + 6 viewer 与三方插件完全对等。内置能力：

- 文件工作台：懒加载目录树 + CodeMirror 编辑 + md/HTML/PDF/Office 预览
- 内嵌浏览器（沙箱 iframe）、真实终端（xterm+node-pty）、Git 面板
  （diff/暂存/提交/还原）、后台任务页（subagent 拓扑）
- 双工作台（右侧栏+底部面板，拖拽分栏）、会话隔离持久化、
  按需加载（核心 325KB）、声明式设置、zh/en 多语言

### 关键事实（推翻本仓库此前决策）

1. **第三方 DSH client 插件是可行的**——此前 SSiD 方案文档否决了 client
   插件路线（"tsdown clientBundle + modules 静态模块表属 DSH 仓库内设施"），
   **结论错误**。better-sidebar 是独立仓库的 client 插件，依赖
   `@deepseek-ai/*` npm 已发布版本（^0.1.0-rc.6）构建出自己的
   `lib/client.js`。DSH npm rc 已发布这一事实当时没查到。
2. 它在 **web profile** 挂载（`dsh plugin --profile web add`），渲染在官方
   web UI 窗口内——SSiD 壳加载的正是官方 web UI，**同样可用**。

### 与 SSiD 侧栏的重叠与冲突

| 能力 | SSiD 自研侧栏（BrowserView+IPC） | better-sidebar |
|---|---|---|
| 文件树/预览 | 本轮刚做（树+懒加载+6 格式预览） | 内置且更成熟（+CodeMirror 编辑、软链接处理） |
| 终端/Git/浏览器 | 无 | 内置 |
| 记忆/状态/习惯/余额面板 | SSiD 独有 | 无，但 registerTab 可注册 |
| 品牌壳（托盘/启动页/logo） | SSiD 独有 | 覆盖不了（壳层） |

**空间冲突**：better-sidebar 渲染在官方 UI 窗口内右侧；SSiD 自研侧栏是
窗口最右的 BrowserView——两者并存会挤占窗口（两个侧栏）。

### 方向建议（倾向切换，待用户拍板）

按 SSiD 原则「DSH+插件解决得了的事不重复造」：

1. **放弃自研侧栏功能层**（文件树/预览——正好是今天刚做的，沉没成本最小）
2. **安装 better-sidebar** 进 ssid profile（dependencies + patch 挂载 + pnpm install）
3. **SSiD 独有面板迁移**为 better-sidebar 的 registerTab 插件
   （@max-null/dsh-ssid-panels：记忆/状态/习惯/余额四 tab），
   复用 dsh-memory/dsh-guardian/dsh-habit 的 host 服务
4. **品牌壳保留**（托盘/启动页/logo/标题/打包）——这是插件覆盖不了的层

风险与前置验证：
- better-sidebar 装进 ssid profile 后与 SSiD 自研侧栏的冲突处理（先停自研侧栏）
- 它的 host 半（/sidebar/* 路由、终端 WebSocket）在 electron 单进程下的表现需实测
- @max-null 面板插件的 client 构建链（better-sidebar 同款，需研读其 tsdown 配置）

## 二、OpenViking（volcengine，28.6k★，AGPLv3，Python）

### 是什么

自进化上下文数据库：`viking://` 虚拟文件系统统一记忆/资源/技能，
L0（摘要~100t）/L1（概览~2k）/L2（详情）三层按需加载省 token；
目录递归向量检索 + 可观测轨迹；**会话提交后异步提取偏好与经验
（"Sessions become memory"）**。LoCoMo 基准：用户记忆准确率
24–57% → 80–83%。有 dsh-plugin topic（DSH 集成）。pip 安装跑本地 server。

### 与 SSiD 自学习闭环的关系

| 维度 | SSiD（dsh-memory + dsh-habit） | OpenViking |
|---|---|---|
| 检索 | BM25 + 明文（**拒绝向量，用户拍板**） | 向量 + 目录递归 |
| 记忆形态 | 扁平卡片，两级人工闸门 | viking:// 树 + 分层加载 |
| 沉淀方式 | 纠错信号→flash 判断→人工确认 | 会话自动提取（无人工闸门） |
| 知识/技能层 | 无 | 资源/技能 RAG |
| 部署 | DSH 插件（无外部进程） | 独立 Python server |

### 方向建议（暂不替换，跟踪观察）

- **短期不替换 dsh-memory/dsh-habit**：人工闸门与 BM25 是既定决策
  （"模型不自我提升"），刚发布且验证通过
- **跟踪点**：OpenViking 的 DSH 插件集成形态（是 MCP/工具还是 DSH 插件）、
  其"会话→记忆自动提取"与 dsh-habit 纠错闭环的互补性
- **候选场景**：SSiD 缺"知识库/RAG"层时，OpenViking 的资源层是现成答案
  （自托管 AGPL 可接受）

## 三、行动建议（待用户拍板）

1. 侧栏方向：切换 better-sidebar + SSiD 面板插件化（本仓库最大收益项）
2. OpenViking：登记观察，不立即集成
