@echo off
setlocal
title XiaoAn - Starting
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\native\start.ps1" -OpenBrowser %*
set "result=%errorlevel%"
if not "%result%"=="0" pause
exit /b %result%
