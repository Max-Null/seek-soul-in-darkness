; SSiD 安装器定制（v0.1.4）：
; 1. 安装前强杀运行中的思灵（close-to-tray 拦截 WM_CLOSE，模板自带杀进程
;    流程无效 → 弹 appCannotBeClosed「思灵无法关闭」卡死）。
; 2. 详情区步骤清单。
;
; 机制（查证模板源码 + 用户实测两轮）：
; - common.nsh 顶层 ShowInstDetails nevershow 覆盖一切默认设置，且 nevershow
;   模式下 DetailPrint 文本被运行时彻底丢弃（实测：SetDetailsView show 能
;   展开列表但列表空、DetailPrint 不进列表、也不进页面文本区）。
; - 因此放弃 DetailPrint，改为直接向详情列表控件（SysListView32，MUI SHOW
;   回调取句柄到 $mui.InstFilesPage.Log）用 LVM_INSERTITEMW 插入行——完全
;   绕开打印机制。
; - 钩子 customCheckAppRunning：CHECK_APP_RUNNING 在卸载旧版之前于 Section
;   内展开（installSection.nsh 35 行），定义本宏后模板跳过自带的杀进程流程
;   （!ifmacrondef 分支），改跑我们的：taskkill + 展开列表 + 插入清单行。
;   卡死在卸载步时清单已在列表中，最后一行即卡点。
; - 卸载器构建同样 include 本文件：宏不展开即无影响（$mui.InstFilesPage.Log
;   只在宏体内引用）。

; 常量直接用字面量（LVIF_TEXT=0x0001、LVM_INSERTITEMW=0x104D）：WinMessages.nsh
; 的 !define 无 ifndef 保护，任何重复定义都会编译报错（卸载器构建实测）。

; 向详情列表追加一行（$R9 为行号计数器，由调用方归零）。
!macro SSID_LIST_ADD text
  System::Call '*(i 1, i $R9, i 0, i 0, i 0, w "${text}", i 0, i 0, i 0, i 0, i 0, i 0, i 0) p.r1'
  SendMessage $mui.InstFilesPage.Log 0x104D 0 $1 $1
  System::Free $1
  IntOp $R9 $R9 + 1
!macroend

!macro customCheckAppRunning
  ; Section 内、卸载旧版之前：杀进程（双保险）+ 展开详情列表 + 插入清单。
  nsExec::Exec 'taskkill /F /IM "思灵.exe" /T'
  SetDetailsView show
  StrCpy $R9 0
  !insertmacro SSID_LIST_ADD "========================================"
  !insertmacro SSID_LIST_ADD "思灵安装步骤清单："
  !insertmacro SSID_LIST_ADD "[1/5] 关闭正在运行的思灵 —— 已完成"
  !insertmacro SSID_LIST_ADD "[2/5] 卸载旧版本（如已安装）"
  !insertmacro SSID_LIST_ADD "[3/5] 复制程序文件"
  !insertmacro SSID_LIST_ADD "[4/5] 注册安装信息与快捷方式"
  !insertmacro SSID_LIST_ADD "[5/5] 完成"
  !insertmacro SSID_LIST_ADD "========================================"
  !insertmacro SSID_LIST_ADD ">>> 开始 [2/5] 卸载旧版本 ..."
!macroend

!macro customInit
  ; 向导一启动就杀运行中的思灵。仅杀「思灵.exe」，不碰 electron.exe
  ; （避免误伤其他 Electron 应用）；/T 连进程树一起杀；进程不存在时
  ; 返回 128，不影响流程。
  nsExec::Exec 'taskkill /F /IM "思灵.exe" /T'
!macroend

!macro customInstall
  ; 文件复制与注册之后：追加后续步骤完成行（列表已由上面展开）。
  !insertmacro SSID_LIST_ADD ">>> [2/5][3/5] 完成；正在执行 [4/5] 注册安装信息与快捷方式 ..."
!macroend
