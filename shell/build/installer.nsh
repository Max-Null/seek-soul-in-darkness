; SSiD 安装器定制（v0.1.4）：
; 1. 安装前强杀运行中的思灵（close-to-tray 拦截 WM_CLOSE，模板自带杀进程
;    流程无效 → 弹 appCannotBeClosed「思灵无法关闭」卡死）。
; 2. 详情区步骤清单 + 进度条上方状态标签双位置展示当前步骤。
;
; 机制（模板源码查证 + 用户三轮实测 + NSIS wiki DetailUpdate 方案）：
; - common.nsh 顶层 ShowInstDetails nevershow：详情区默认不给看；
;   SetDetailsView show（Section 内合法）实测可展开列表。
; - nevershow 下 DetailPrint 文本被运行时丢弃（实测列表空）→ 直接对
;   SysListView32（控件 1016）发 LVM_* 消息（wiki：它就是标准列表控件）。
; - LVM_INSERTITEMW 插入行实测可见；但 customInstall（文件复制后）阶段
;   追加行不显示（跨段状态被模板宏破坏）→ 改用 NSIS wiki DetailUpdate
;   方案：LVM_SETITEMTEXT 更新最后一项 + WM_SETTEXT 更新状态标签（1006），
;   每次 FindWindow/GetDlgItem 现取句柄，寄存器 Push/Pop 保护。
; - 常量全部用字面量：WinMessages.nsh 的 !define 无 ifndef 保护，重复定义
;   编译报错（实测）。
;   0x000C=WM_SETTEXT, 0x1004=LVM_GETITEMCOUNT, 0x102E=LVM_SETITEMTEXT,
;   0x104D=LVM_INSERTITEMW, 1=LVIF_TEXT。
; - customCheckAppRunning：CHECK_APP_RUNNING 在卸载旧版之前于 Section 内
;   展开；定义本宏后模板跳过自带杀进程流程（!ifmacrondef 分支）。
; - 卸载器构建同样 include 本文件：宏不展开即无影响。

; 向详情列表（1016）追加一行。行号用 LVM_GETITEMCOUNT 动态查询。
!macro SSID_LIST_ADD text
  SendMessage $mui.InstFilesPage.Log 0x1004 0 0 $0
  System::Call '*(i 1, i $0, i 0, i 0, i 0, w "${text}", i 0, i 0, i 0, i 0, i 0, i 0, i 0) p.r1'
  SendMessage $mui.InstFilesPage.Log 0x104D 0 $1 $1
  System::Free $1
!macroend

; 更新「当前步骤」：详情列表最后一项（LVM_SETITEMTEXT）+ 进度条上方
; 状态标签（WM_SETTEXT）。NSIS wiki DetailUpdate 方案，每次现取句柄。
!macro SSID_STEP_UPDATE text
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  ; 1) 进度条上方的状态标签（控件 1006）
  FindWindow $R2 `#32770` `` $HWNDPARENT
  GetDlgItem $R1 $R2 1006
  SendMessage $R1 0x000C 0 `STR:${text}`
  ; 2) 详情列表最后一项（控件 1016）
  GetDlgItem $R1 $R2 1016
  System::Call '*(&t1024 "${text}") i.R2'
  System::Call '*(i 0, i 0, i 0, i 0, i 0, i R2, i 1024, i 0, i 0) i.R3'
  System::Call 'user32::SendMessage(i R1, i 0x1004, i 0, i 0) i.R0'
  IntOp $R0 $R0 - 1
  System::Call 'user32::SendMessage(i R1, i 0x102E, i R0, i R3)'
  System::Free $R3
  System::Free $R2
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend

!macro customCheckAppRunning
  ; Section 内、卸载旧版之前：杀进程（双保险）+ 展开列表 + 插入清单 +
  ; 状态标签置为当前步骤。
  nsExec::Exec 'taskkill /F /IM "思灵.exe" /T'
  SetDetailsView show
  !insertmacro SSID_LIST_ADD "========================================"
  !insertmacro SSID_LIST_ADD "思灵安装步骤清单："
  !insertmacro SSID_LIST_ADD "[1/5] 关闭正在运行的思灵 —— 已完成"
  !insertmacro SSID_LIST_ADD "[2/5] 卸载旧版本（如已安装）"
  !insertmacro SSID_LIST_ADD "[3/5] 复制程序文件"
  !insertmacro SSID_LIST_ADD "[4/5] 注册安装信息与快捷方式"
  !insertmacro SSID_LIST_ADD "[5/5] 完成"
  !insertmacro SSID_LIST_ADD "========================================"
  !insertmacro SSID_LIST_ADD ">>> 开始 [2/5] 卸载旧版本 ..."
  !insertmacro SSID_STEP_UPDATE ">>> 开始 [2/5] 卸载旧版本 ..."
!macroend

!macro customInit
  ; 向导一启动就杀运行中的思灵。仅杀「思灵.exe」，不碰 electron.exe
  ; （避免误伤其他 Electron 应用）；/T 连进程树一起杀；进程不存在时
  ; 返回 128，不影响流程。
  nsExec::Exec 'taskkill /F /IM "思灵.exe" /T'
!macroend

!macro customInstall
  ; 文件复制与注册之后：更新最后一项与状态标签为 [4/5] 进行中。
  !insertmacro SSID_STEP_UPDATE ">>> [2/5][3/5] 完成；正在执行 [4/5] 注册安装信息与快捷方式 ..."
!macroend
