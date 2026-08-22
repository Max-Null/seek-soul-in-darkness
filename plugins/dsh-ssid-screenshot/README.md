# @max-null/dsh-ssid-screenshot

思灵（SSiD）快捷截图引用：托盘菜单「截图引用」或全局快捷键（默认 `Ctrl+Shift+A`）
触发全屏截图浮层，左键拖拽框选一块区域（支持多显示器），确认后进入**标注**：
在截图上拖拽画红框强调重点，回车/双击/「完成」后图片自动进入 **当前会话的输入框**
（作为图片附件草稿，可加文字、可删除，回车才发送）。

## 操作

1. 打开任意 DSH 会话（没有会话时截图不会进入任何地方）。
2. 托盘图标 →「截图引用」，或按全局快捷键（在 设置 → 通用 修改）。
3. 屏上出现冻结帧 + 十字准星：
   - **左键拖拽** 框选区域 → **双击 / 回车** 确认进入标注；**右键 / Esc** 直接取消。
   - 标注页：**左键拖拽** 在截图上画红框（可多个）；**回车 / 双击 /「完成」** 发送；
     **右键 / Esc /「撤销」** 删最后一个框；无框时 **右键 / Esc /「重选」** 回框选。
   - 框选无操作时右键/Esc 取消整次截图。
4. 图片出现在输入框图片位；可追加文字后回车发送。

## 设置（设置 → 通用）

- **截图时隐藏思灵窗口**：开 = 冻结帧不含思灵自身（引用其他应用）；关 = 冻结帧包含
  思灵（可框选对话内容）。默认开。
- **截图全局快捷键**：Electron accelerator 语法（如 `Control+Alt+B`），回车/失焦即
  保存并立即重注册。

## 实现要点（维护者）

- 截屏/框选/标注/裁剪全部在**壳层**（`shell/main.mjs` + `shell/screenshot.html`）：
  `desktopCapturer.getSources` 逐屏抓帧（物理像素 1:1）→ 每屏一个全屏无边框置顶
  浮层（不侵入 DSH 页面 DOM）→ 标注 canvas 合成（原图分辨率画 3px 红框）。
- 壳层经 `mainView.webContents.executeJavaScript` 派发 `ssid:screenshot`
  CustomEvent（与 `ssid:titlebar` 同一通道先例）。
- 本插件只负责接收并投递：`new DataTransfer()` + `DragEvent('drop')` 走 DSH 官方
  composer 图片 intake（ui-attachment 的 document 级 drop 处理器）。无 DSH 核心
  改动；数量/大小/类型限制与官方拖拽一致。
- host 半 `/ssid/api/screenshot/{get,set,trigger}`（trusted-fence 同 panels）；
  壳能力经 `ssid.shell.screenshot` 服务注入（bare dsh web 时降级）。
- 浮层 3 分钟无交互自动取消（防卡屏；交互随时重置）。

## 已知边界

- 无当前会话时截图静默丢弃（浮层文案已提示「先打开一个会话」）。
- 模型不支持图片时由 DSH 官方提示。
- 快捷键默认 `Control+Shift+A`，可在 设置 → 通用 修改。
