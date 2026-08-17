; SSiD 安装器定制（v0.1.4）：
; 1. 安装前强杀运行中的思灵——close-to-tray 拦截 WM_CLOSE 让进程退不掉，
;    旧版卸载器检测到运行中的进程会报「思灵无法关闭」卡死（进度约 50%）。
; 2. 安装详情区默认展开 + 步骤清单：卡住时最后一行即卡点，便于反馈定位。
;
; 上下文合法性（本地 makensis 探针实测 + NSIS 官方文档）：
; - ShowInstDetails：仅顶层（文件作用域）合法；.onInit / Section / Function
;   均编译报错。顶层语义 = 详情区默认展开，正合需求。
; - SetDetailsView show：Section 内合法（官方文档：sections can override
;   the default details view）。
; - DetailPrint：.onInit / Section 均合法；.onInit 的输出缓冲进详情区，
;   instfiles 页显示时呈现——卡死在卸载步（customInstall 之前）时清单已在。
; - 模板 installSection.nsh 在非静默安装时执行 SetDetailsPrint none，
;   customInstall 里需恢复 textonly。
; - customInit 仅安装器调用；卸载器构建时本文件同样被 include，
;   顶层 ShowInstDetails 需 BUILD_UNINSTALLER 隔离。

!ifndef BUILD_UNINSTALLER
  ShowInstDetails show
!endif

!macro customInit
  ; 向导一启动就杀运行中的思灵。仅杀「思灵.exe」，不碰 electron.exe
  ; （避免误伤其他 Electron 应用）；/T 连进程树一起杀；进程不存在时
  ; 返回 128，不影响流程。
  nsExec::Exec 'taskkill /F /IM "思灵.exe" /T'
  ; 步骤清单（.onInit 缓冲进详情区，卸载卡死时可见，最后一行即卡点）
  DetailPrint "========================================"
  DetailPrint "思灵安装步骤清单："
  DetailPrint "  [1/5] 关闭正在运行的思灵"
  DetailPrint "  [2/5] 卸载旧版本（如已安装）"
  DetailPrint "  [3/5] 复制程序文件"
  DetailPrint "  [4/5] 注册安装信息与快捷方式"
  DetailPrint "  [5/5] 完成"
  DetailPrint "========================================"
  DetailPrint ">>> [1/5] 完成；开始 [2/5] 卸载旧版本 ..."
!macroend

!macro customInstall
  ; 模板非静默时 SetDetailsPrint none：恢复文本打印 + 保险再展开详情区。
  SetDetailsPrint textonly
  SetDetailsView show
  DetailPrint ">>> [2/5][3/5] 完成；正在执行 [4/5] 注册安装信息与快捷方式 ..."
!macroend
