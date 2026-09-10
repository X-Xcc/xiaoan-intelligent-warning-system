@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\native\stop.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\native\start.ps1" -EnableCameras
if errorlevel 1 pause
