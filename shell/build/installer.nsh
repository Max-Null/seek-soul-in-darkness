; SSiD 安装器定制（v0.1.4）：
; 1. 安装前强杀运行中的思灵——close-to-tray 拦截 WM_CLOSE 让进程退不掉，
;    旧版卸载器检测到运行中的进程会报「思灵无法关闭」卡死（进度约 50%）。
; 2. 安装详情区强制展开 + 步骤清单：卡住时最后一行即卡点，便于反馈定位。
;
; 机制说明（三次编译实测 + NSIS 官方文档）：
; - ShowInstDetails 是 page-callback-only 指令，在 .onInit / Section / 普通
;   Function 里均为编译错误；官方文档指明 section 内应使用 SetDetailsView
;   来覆盖详情区显示状态（"sections can override this using SetDetailsView"）。
; - customInstall 在 installSection.nsh 的 Section 内展开，SetDetailsView /
;   DetailPrint 在此上下文合法。
; - customInit 仅安装器调用（uninstaller.nsh 不调用），taskkill 只发生在安装时；
;   卸载器构建时本文件同样被 include，但宏只定义不展开，无语法影响。

!macro customInit
  ; 向导一启动就杀运行中的思灵（静默：详情页此时未创建，ExecToLog 不可用）。
  ; 仅杀「思灵.exe」，不碰 electron.exe（避免误伤其他 Electron 应用）；
  ; /T 连进程树一起杀；进程不存在时返回 128，不影响流程。
  nsExec::Exec 'taskkill /F /IM "思灵.exe" /T'
!macroend

!macro customInstall
  ; 安装段：展开详情区 + 打印步骤清单与进度流水。
  SetDetailsView show
  DetailPrint "========================================"
  DetailPrint "思灵安装步骤清单："
  DetailPrint "  [1/5] 关闭正在运行的思灵（安装前已执行）"
  DetailPrint "  [2/5] 卸载旧版本（如已安装）"
  DetailPrint "  [3/5] 复制程序文件"
  DetailPrint "  [4/5] 注册安装信息与快捷方式"
  DetailPrint "  [5/5] 完成"
  DetailPrint "========================================"
  DetailPrint ">>> 正在执行 [3/5] 复制程序文件 / [4/5] 注册安装信息 ..."
!macroend
