; SSiD 安装器定制（v0.1.5 修复）：
; 1. 安装前强杀运行中的思灵（close-to-tray 拦截 WM_CLOSE，模板自带杀进程
;    流程无效 → 弹 appCannotBeClosed「思灵无法关闭」卡死）。
; 2. 详情区步骤清单 + 进度条上方状态标签双位置展示当前步骤。

!include "LogicLib.nsh"
;
; 机制（模板源码查证 + 本地 makensis 探针逐条验证 + 用户实测）：
; - common.nsh 顶层 ShowInstDetails nevershow：详情区默认不给看；
;   SetDetailsView show（Section 内合法）实测可展开列表。
; - nevershow 下 DetailPrint 文本被运行时丢弃（实测列表空）→ 直接对
;   SysListView32（控件 1016）发 LVM_* 消息（wiki：它就是标准列表控件）。
; - LVM_INSERTITEMW 插入行实测可见；LVM_SETITEMTEXT 更新最后一项 +
;   WM_SETTEXT 同步状态标签（1006）。
; - 常量全部用字面量：WinMessages.nsh 的 !define 无 ifndef 保护，重复定义
;   编译报错（实测）。
;   0x000C=WM_SETTEXT, 0x1004=LVM_GETITEMCOUNT, 0x102E=LVM_SETITEMTEXT,
;   0x104D=LVM_INSERTITEMW, 1=LVIF_TEXT。
; - customCheckAppRunning：CHECK_APP_RUNNING 在卸载旧版之前于 Section 内
;   展开；定义本宏后模板跳过自带杀进程流程（!ifmacrondef 分支）。
; - 卸载器构建同样 include 本文件：宏不展开即无影响。
;
; ★ v0.1.5 修复（2026-08-19 用户首次安装 25% 闪退）：
;   a) SSID_LIST_ADD 原实现 `SendMessage ... 0x104D 0 $1 $1` 中 $1 同时作
;      lParam 与返回值寄存器——LVM_INSERTITEMW 返回新行索引并覆盖 $1（结构
;      体指针），随后 System::Free $1 释放的是行索引（0x0/0x1/0x2...）而非
;      堆指针 → 无效释放/堆损坏 → 复制大文件（首次安装约 200MB+）中段崩溃。
;      修复：返回值写入独立变量 $R2，结构体指针保持 $R1 不变。
;   b) SSID_STEP_UPDATE 原实现 LVITEM.mask=0 → LVM_SETITEMTEXT 永不生效
;      （需 mask=LVIF_TEXT）→ 状态标签/列表文本实际从未更新。修复：mask=1，
;      文本用 System::Call 的 w 类型（宽字符）内联分配，&t1024 改 w。
;   c) 状态标签 1006 的对话框句柄：FindWindow 结果与 $HWNDPARENT 不同
;      （探针实测），先试 $HWNDPARENT 再回退 FindWindow。

; 向详情列表（1016）追加一行。行号用 LVM_GETITEMCOUNT 动态查询。
; 返回值（新行索引）写 $R2，结构体指针保持 $R1 再 System::Free。
!macro SSID_LIST_ADD text
  Push $R0
  Push $R1
  Push $R2
  SendMessage $mui.InstFilesPage.Log 0x1004 0 0 $R0
  System::Call '*(i 1, i R0, i 0, i 0, i 0, w "${text}", i 0, i 0, i 0, i 0, i 0, i 0, i 0) p.R1'
  System::Call 'user32::SendMessage(i $mui.InstFilesPage.Log, i 0x104D, i 0, i R1) i.R2'
  System::Free $R1
  Pop $R2
  Pop $R1
  Pop $R0
!macroend

; 更新「当前步骤」：详情列表最后一项（LVM_SETITEMTEXT，mask=LVIF_TEXT）+ 
; 进度条上方状态标签（WM_SETTEXT）。每次现取句柄，寄存器 Push/Pop 保护。
!macro SSID_STEP_UPDATE text
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  ; 1) 进度条上方的状态标签（控件 1006）
  FindWindow $R2 `#32770` `` $HWNDPARENT
  ${If} $R2 == 0
    StrCpy $R2 $HWNDPARENT
  ${EndIf}
  GetDlgItem $R1 $R2 1006
  ${If} $R1 != 0
    SendMessage $R1 0x000C 0 `STR:${text}`
  ${EndIf}
  ; 2) 详情列表最后一项（控件 1016）— mask=1(LVIF_TEXT) + 宽字符文本
  GetDlgItem $R1 $R2 1016
  ${If} $R1 != 0
    System::Call 'user32::SendMessage(i R1, i 0x1004, i 0, i 0) i.R0'
    IntOp $R0 $R0 - 1
    ${If} $R0 >= 0
      System::Call '*(i 1, i 0, i 0, i 0, i 0, w "${text}", i 0, i 0, i 0, i 0, i 0, i 0, i 0) i.R3'
      System::Call 'user32::SendMessage(i R1, i 0x102E, i R0, i R3)'
      System::Free $R3
    ${EndIf}
  ${EndIf}
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
  ; 文件复制与注册之后：分步推进 4/5、5/5，各停留 1.2s 保证肉眼可见
  ; （此前单次更新在 Section 尾部秒切 finish 页，实测一闪而过看不到）。
  !insertmacro SSID_STEP_UPDATE ">>> [2/5][3/5] 完成；正在执行 [4/5] 注册安装信息与快捷方式 ..."
  Sleep 1200
  !insertmacro SSID_STEP_UPDATE ">>> [4/5] 完成；[5/5] 全部完成，即将结束 ..."
  Sleep 1200
!macroend
