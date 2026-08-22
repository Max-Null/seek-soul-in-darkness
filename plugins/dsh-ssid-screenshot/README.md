# @max-null/dsh-ssid-screenshot

DSH 双引擎快捷截图引用：框选屏幕任意区域（支持标注红框强调），图片自动进入
**当前会话的输入框**（作为图片附件草稿，可加文字、可删除，回车才发送）。

## 双引擎

| | 思灵壳（SSiD）内 | 纯 DSH（浏览器） |
| --- | --- | --- |
| 触发 | 托盘「截图引用」＋ 全局快捷键（设置→通用修改）＋ 输入框相机按钮 | 输入框相机按钮 |
| 捕获 | desktopCapturer 逐屏抓帧：多显示器、像素级 1:1、全屏无边框浮层 | `getDisplayMedia` 系统选择器（一次选一个屏幕） |
| 遮蔽 | 独立浮层窗口（DSH 页面零侵入） | 页面内全屏遮罩（框选 + 标注交互相同） |
| 隐藏窗口 | ✅（设置→通用「截图时隐藏思灵窗口」） | ❌（无此能力，设置行自动隐藏） |
| 投递 | 官方 composer 图片 intake（合成 drop，与拖拽等价） | 同左 |

运行时探测（host 的 shellAvailable）自动选择引擎；无壳时按钮点击即走浏览器捕获。

## 操作（思灵壳内）

1. 打开任意 DSH 会话（没有会话时截图不会进入任何地方）。
2. 托盘 →「截图引用」，或按全局快捷键（默认 `Ctrl+Shift+A`）。
3. 屏上出现冻结帧 + 十字准星：
   - **左键拖拽** 框选区域 → **双击 / 回车** 确认进入标注；**右键 / Esc** 直接取消。
   - 标注页：**左键拖拽** 在截图上画红框（可多个）；**回车 / 双击 /「完成」** 发送；
     **右键 / Esc /「撤销」** 删最后一个框；无框时 **右键 / Esc /「重选」** 回框选。
   - 框选无操作时右键/Esc 取消整次截图。
4. 图片出现在输入框图片位；可追加文字后回车发送。

## 操作（纯 DSH）

1. 打开任意 DSH 会话；点输入框相机按钮（润色按钮左侧）。
2. 浏览器弹出「选择要共享的屏幕」→ 选一个屏幕 → 捕获一帧后自动停止共享。
3. 页面全屏遮罩出现：**左键拖拽**框选 → **双击/回车**进标注 → **左键拖拽**画红框 →
   **回车/「完成」** 发送；**右键/Esc** 逐级回退。

## 设置（思灵壳内：设置 → 通用）

- **截图时隐藏思灵窗口**：开 = 冻结帧不含思灵自身（引用其他应用）；关 = 冻结帧包含
  思灵（可框选对话内容）。默认开。
- **截图全局快捷键**：Electron accelerator 语法（如 `Control+Alt+B`），回车/失焦即
  保存并立即重注册。

## 实现要点（维护者）

- 壳层（engine A）在 `shell/main.mjs` + `shell/screenshot.html`：`desktopCapturer`
  逐屏抓帧 → 每屏一个全屏无边框置顶浮层（不侵入 DSH 页面 DOM）→ 标注 canvas 合成
  （原图分辨率 3px 红框）→ `executeJavaScript` 派发 `ssid:screenshot` CustomEvent。
- 浏览器（engine B）在 `src/client/CaptureOverlay.tsx`：`getDisplayMedia` 抓帧 →
  `createPortal` 全屏遮罩（同一套框选/标注交互）→ 官方 drop intake。
- 投递：`delivery.ts` 的合成 drop（`new DataTransfer()` + `DragEvent('drop')`）走 DSH
  官方 composer 图片 intake（ui-attachment 的 document 级 drop 处理器）。无 DSH 核心
  改动；数量/大小/类型限制与官方拖拽一致。
- host 半 `/ssid/api/screenshot/{get,set,trigger}`（trusted-fence 同 panels）；
  壳能力经 `ssid.shell.screenshot` 服务注入（bare dsh web 时 shellAvailable=false，
  引擎 B 接管）。
- 浮层 3 分钟无交互自动取消（防卡屏；交互随时重置）。

## 已知边界

- 纯 DSH：一次一个屏幕（系统选择器选）；无法隐藏宿主窗口（设置行自动隐藏）；
  无法使用全局快捷键（无壳机制）。
- 无当前会话时截图静默丢弃（浮层文案已提示「先打开一个会话」）。
- 模型不支持图片时由 DSH 官方提示。
