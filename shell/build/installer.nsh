; SSiD 安装器定制（v0.1.4）：
; 1. 安装前强杀运行中的思灵——close-to-tray 拦截 WM_CLOSE 让进程退不掉，
;    旧版卸载器检测到运行中的进程会报「思灵无法关闭」卡死（进度约 50%）。
; 2. 详情区强制展开 + 步骤清单：卡住时最后一行即卡点，便于反馈定位。
;
; 钩子宏约定（electron-builder）：customInit 在 .onInit 内执行（向导启动时），
; customInstall 在安装段执行。

!macro customInit
  ; 详情区默认折叠，强制展开让用户能看到步骤流水
  ShowInstDetails show
  DetailPrint "========================================"
  DetailPrint "思灵安装步骤清单："
  DetailPrint "  [1/5] 关闭正在运行的思灵"
  DetailPrint "  [2/5] 卸载旧版本（如已安装）"
  DetailPrint "  [3/5] 复制程序文件"
  DetailPrint "  [4/5] 注册安装信息与快捷方式"
  DetailPrint "  [5/5] 完成"
  DetailPrint "========================================"
  DetailPrint ">>> 正在执行 [1/5] 关闭正在运行的思灵 ..."
  ; 仅杀「思灵.exe」，不碰 electron.exe（避免误伤其他 Electron 应用）。
  ; /T 连进程树一起杀；进程不存在时 taskkill 返回 128，ExecToLog 只记录不中断。
  nsExec::ExecToLog 'taskkill /F /IM "思灵.exe" /T'
  DetailPrint ">>> [1/5] 完成"
!macroend

!macro customInstall
  DetailPrint ">>> 正在执行 [3/5] 复制程序文件 / [4/5] 注册安装信息 ..."
!macroend
