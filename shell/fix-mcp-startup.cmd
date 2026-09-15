@echo off
chcp 65001 >nul
setlocal
title SSiD startup fix

echo.
echo   SiD / SSiD startup fix  (MCP entry referencing a missing CLI)
echo   ------------------------------------------------------------
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-mcp-startup.ps1" %*
set RC=%ERRORLEVEL%

echo.
if "%RC%"=="0" (
  echo   Done. Close SSiD completely, then open it again.
) else (
  echo   Script exited with code %RC% - read the messages above.
)
echo.
pause
endlocal
