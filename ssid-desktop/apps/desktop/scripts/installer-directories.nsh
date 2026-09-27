!include "LogicLib.nsh"

; 目录式安装：先把旧安装改名让开，再把新负载**直接**解压到最终目录。
;
; 为什么不做「解压到 `.new-<guid>` 再改名就位」：那多出一次目录改名，而失败的往往是改名本身 ——
; 实测 2026-09-28 目标目录为空、`RMDir` 静默失败后，`Rename` 就再也过不去，安装只能到 96% 才报错。
; 现在的顺序把事情压到一次改名，并且在解压 427 MB 之前就报出失败。
; 原子性由 `dshRollbackDirectories` 保住：解压失败时删掉半成品、把 `.old-<guid>` 改回来。
Var dshFinalDirectory
Var dshOldDirectory
Var dshOldMoved
; 本次是否已开始往最终目录写内容 —— 回滚据此决定要不要删它。
Var dshWroteFinal
; 让路失败的描述，直接作为提示正文（不再复用与原因无关的文案）。
Var dshPrepareError

!macro dshExtractPayload FILE
  !ifmacrodef customInstallerExtract
    !insertmacro customInstallerExtract "${FILE}"
  !else
    nsExec::ExecToStack '"$PLUGINSDIR\dsh-7za.exe" x -y -bd -bb0 "-o$INSTDIR" "${FILE}"'
    Pop $R0
    Pop $R1
  !endif
  ${If} $R0 != 0
    DetailPrint $R1
    Call dshRollbackDirectories
    !ifmacrodef customInstallerExtractFailed
      !insertmacro customInstallerExtractFailed "${FILE}"
    !else
      MessageBox MB_OK|MB_ICONEXCLAMATION "$(decompressionFailed)" /SD IDOK
    !endif
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

; 释放 7-Zip、记录最终目录、让开旧安装。在 `setLinkVars` 之后、负载解压之前执行。
!macro dshStageApplication
  StrCpy $dshFinalDirectory $INSTDIR
  System::Call 'ole32::CoCreateGuid(g .r0) i .r1'
  ${If} $1 != 0
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $dshOldDirectory "$INSTDIR.old-$0"
  StrCpy $dshOldMoved ""
  StrCpy $dshWroteFinal ""
  StrCpy $dshPrepareError ""
  File /oname=$PLUGINSDIR\dsh-7za.exe "${DSH_SEVENZIP_PATH}"
  !ifdef DSH_SEVENZIP_LICENSE_DIR
    File /oname=7zip-installer-LICENSE.txt "${DSH_SEVENZIP_LICENSE_DIR}\LICENSE.txt"
    File /oname=7zip-installer-COPYING.txt "${DSH_SEVENZIP_LICENSE_DIR}\COPYING"
  !endif
  !ifdef UNINSTALLER_ICON
    File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"
  !endif
  ; 先腾地方。失败就在这里说清楚，不必先白解压 427 MB 再报一句无关的话。
  Call dshPrepareDirectories
  ${If} ${Errors}
    SetErrorLevel 2
    MessageBox MB_OK|MB_ICONEXCLAMATION "$dshPrepareError" /SD IDOK
    Quit
  ${EndIf}
  SetOutPath $INSTDIR
!macroend

Function .onGUIEnd
  Call dshCleanupDirectories
FunctionEnd

Function dshCleanupDirectories
  ${If} $dshFinalDirectory != ""
    Call dshRollbackDirectories
  ${EndIf}
FunctionEnd

; 让路：把已存在的最终目录改名到 `.old-<guid>`。
;
; 空目录也走改名而不是删除 —— `RMDir` 对「任何句柄打开着的空目录」同样拒绝删除且不报错，
; 失败的删除会让最终目录原地不动（实测 2026-09-28 正是如此）。改名接受非空目录，只需要句柄释放，
; 而上面的 `SetOutPath $PLUGINSDIR` 已经把它自己的那个句柄放掉了。
Function dshPrepareDirectories
  SetOutPath $PLUGINSDIR
  ${IfNot} ${FileExists} "$dshFinalDirectory"
    ClearErrors
    Return
  ${EndIf}
  StrCpy $R0 $dshFinalDirectory
  StrCpy $R1 $dshOldDirectory
  Call dshRenameWithRetry
  ${If} ${Errors}
    StrCpy $dshPrepareError "cannot move the existing installation aside: $\"$dshFinalDirectory$\" -> $\"$dshOldDirectory$\" (still in use?)"
    SetErrors
    Return
  ${EndIf}
  StrCpy $dshOldMoved "1"
  ; 让路成功，接下来必然往最终目录写新负载 —— 回滚要据此清理它。
  StrCpy $dshWroteFinal "1"
  ClearErrors
FunctionEnd

; 只清理本次安装创建或改动过的东西：先删半成品，再把旧安装改回来。
Function dshRollbackDirectories
  SetOutPath $PLUGINSDIR
  ${If} $dshWroteFinal == "1"
    RMDir /r "\\?\$dshFinalDirectory"
    StrCpy $dshWroteFinal ""
  ${EndIf}
  ${If} $dshOldMoved == "1"
    ClearErrors
    Rename $dshOldDirectory $dshFinalDirectory
    ${If} ${Errors}
      ; 别的进程挡着恢复：把完整备份留在原处，用户还能手工改回来。
      DetailPrint $dshOldDirectory
      Return
    ${EndIf}
    StrCpy $dshOldMoved ""
  ${EndIf}
  StrCpy $INSTDIR $dshFinalDirectory
FunctionEnd

; 目标目录可能被短暂占用：正在退出的进程、杀毒扫描、资源管理器窗口都会让改名失败一瞬间。
; 重试几次，中间结束从安装目录启动的进程 —— 它们同样持有那里的句柄。
; 实测 2026-09-28：空目录上的 RMDir 与单次 Rename 均失败，而安装器不在跑时手工改名可以成功。
; 入参：$R0 源，$R1 目标。成功清错误标志，重试用尽置错误标志。
Function dshRenameWithRetry
  StrCpy $R2 0
  dshRenameRetry:
    ClearErrors
    Rename $R0 $R1
    ${IfNot} ${Errors}
      ClearErrors
      Return
    ${EndIf}
    IntOp $R2 $R2 + 1
    ${If} $R2 >= 3
      SetErrors
      Return
    ${EndIf}
    !insertmacro DshStopInstalledProcesses
    Sleep 700
    Goto dshRenameRetry
FunctionEnd

; 安装成功后的收尾：旧安装还在就删掉，并撤销回滚标记 —— 否则 GUI 退出时会把刚装好的目录删掉。
!macro dshFinishDirectories
  StrCpy $dshWroteFinal ""
  ${If} $dshOldMoved == "1"
    RMDir /r "\\?\$dshOldDirectory"
    StrCpy $dshOldMoved ""
  ${EndIf}
!macroend
