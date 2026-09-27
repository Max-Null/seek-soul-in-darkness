; Compile against the production directory transaction using a private payload and target.
Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "Desktop directory replacement smoke"
OutFile "${OUTPUT_FILE}"
LoadLanguageFile "${NSISDIR}\Contrib\Language files\English.nlf"
LangString decompressionFailed ${LANG_ENGLISH} "Payload extraction failed"

!macro installApplicationFiles
  !insertmacro dshExtractPayload "${PAYLOAD_FILE}"
!macroend
!ifdef SOURCE_DLL
  LoadLanguageFile "${NSISDIR}\Contrib\Language files\SimpChinese.nlf"
  !include "..\..\installer\strings.nsh"
  !define DSH_INSTALLER_LOG_DIR "${REPORT_DIR}"
  !include "..\..\scripts\installer.nsh"
!else
  !include "..\..\scripts\installer-directories.nsh"
!endif

Section
  InitPluginsDir
  !ifdef SOURCE_DLL
    File "/oname=$PLUGINSDIR\window-frame.dll" "${SOURCE_DLL}"
  !endif
  StrCpy $INSTDIR "${TARGET_DIR}"
  ; 让路：目标已存在时先改名到 `.old-<guid>`。失败（例如里面有文件被打开）就在这里以
  ; errorlevel 2 结束，旧版本原样保留 —— 这正是 `locked` 场景期望的结果。
  !insertmacro dshStageApplication
  !ifdef CANCELLED
    SetErrorLevel 2
    Call dshCleanupDirectories
    Quit
  !endif
  ; 负载直接解压进最终目录；解压失败由 `dshExtractPayload` 负责回滚。
  !insertmacro installApplicationFiles
  IfErrors failed
  !insertmacro dshFinishDirectories
  SetErrorLevel 0
  Quit
  failed:
  SetErrorLevel 2
  Quit
SectionEnd
