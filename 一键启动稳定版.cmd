@echo off
setlocal
title XiaoAn - Stable Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\native\start.ps1" -Force -EnableCameras -OpenBrowser %*
set "result=%errorlevel%"
if not "%result%"=="0" pause
exit /b %result%
