@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\native\start.ps1"
if errorlevel 1 pause
