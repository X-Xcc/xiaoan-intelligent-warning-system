@echo off
setlocal
set "ROOT=%~dp0"
schtasks.exe /Create /F /SC ONLOGON /RL LIMITED /TN "XiaoAn Native Force Start" /TR "\"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe\" -NoProfile -ExecutionPolicy Bypass -File \"%ROOT%deploy\native\start.ps1\" -Force -EnableCameras -OpenBrowser"
if errorlevel 1 exit /b %errorlevel%
echo XiaoAn native force start task installed.
exit /b 0
