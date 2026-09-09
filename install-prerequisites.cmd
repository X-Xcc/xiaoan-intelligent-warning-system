@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\native\bootstrap.ps1" -InstallMissing
pause
