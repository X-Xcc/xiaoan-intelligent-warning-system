@echo off
setlocal
schtasks.exe /Delete /TN "XiaoAn Native Force Start" /F
if errorlevel 1 exit /b %errorlevel%
echo XiaoAn native force start task removed.
exit /b 0
