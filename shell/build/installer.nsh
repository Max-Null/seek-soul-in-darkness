; SSiD 安装器定制（v0.1.4）：
; 1. 安装前强杀运行中的思灵——close-to-tray 拦截 WM_CLOSE，模板自带的
;    _CHECK_APP_RUNNING 杀不掉它（优雅 kill 无效 → 循环强杀 → 仍失败 →
;    弹 appCannotBeClosed「思灵无法关闭」卡死，进度约 50%）。customInit
;    （向导启动即杀）治本。
; 2. 安装详情区展开 + 步骤清单。
;
; 关键机制（查证 app-builder-lib 26 模板源码）：
; - common.nsh 顶层 `ShowInstDetails nevershow` 在我们 include 之后执行，
;   会覆盖我们顶层的 `show`（顶层指令按序执行，后者胜），且 nevershow
;   连「显示详情」按钮都不给——这解释了用户实测看不到详情区。
; - 钩子 customCheckAppRunning：allowOnlyOneInstallerInstance.nsh 的
;   CHECK_APP_RUNNING 宏在 installSection.nsh 卸载旧版之前展开于 Section
;   上下文，且 `!ifmacrondef customCheckAppRunning` 检测到我们先定义则
;   跳过模板自带的 _CHECK_APP_RUNNING 流程（它的杀进程逻辑对 close-to-tray
;   无效），改为展开我们的宏。Section 内 SetDetailsView（官方文档：sections
;   can override the default details view）可覆盖 nevershow、DetailPrint 合法。
; - 卸载器构建时本文件同样被 include：宏只定义不展开（uninstaller 不调用
;   CHECK_APP_RUNNING/customInit），无编译影响。

!macro customCheckAppRunning
  ; Section 内、卸载旧版之前：再杀一次（双保险，覆盖 UAC 内外层差异），
  ; 然后展开详情区 + 恢复打印（模板 installSection 非静默时 SetDetailsPrint
  ; none）+ 打印步骤清单与当前卡点标注。
  nsExec::Exec 'taskkill /F /IM "思灵.exe" /T'
  SetDetailsView show
  SetDetailsPrint textonly
  DetailPrint "========================================"
  DetailPrint "思灵安装步骤清单："
  DetailPrint "  [1/5] 关闭正在运行的思灵（已完成）"
  DetailPrint "  [2/5] 卸载旧版本（如已安装）"
  DetailPrint "  [3/5] 复制程序文件"
  DetailPrint "  [4/5] 注册安装信息与快捷方式"
  DetailPrint "  [5/5] 完成"
  DetailPrint "========================================"
  DetailPrint ">>> 开始 [2/5] 卸载旧版本 ..."
!macroend

!macro customInit
  ; 向导一启动就杀运行中的思灵。仅杀「思灵.exe」，不碰 electron.exe
  ; （避免误伤其他 Electron 应用）；/T 连进程树一起杀；进程不存在时
  ; 返回 128，不影响流程。
  nsExec::Exec 'taskkill /F /IM "思灵.exe" /T'
!macroend

!macro customInstall
  ; 文件复制与注册之后：打印后续步骤完成（详情区已由 customCheckAppRunning 展开）。
  SetDetailsView show
  SetDetailsPrint textonly
  DetailPrint ">>> [2/5][3/5] 完成；正在执行 [4/5] 注册安装信息与快捷方式 ..."
!macroend
