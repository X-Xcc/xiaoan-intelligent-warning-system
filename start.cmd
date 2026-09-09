@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\start.ps1"
if errorlevel 1 (
  echo.
  echo Startup failed. See the error above and README.md.
)
pause
