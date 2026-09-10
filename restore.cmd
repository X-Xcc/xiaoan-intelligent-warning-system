@echo off
setlocal
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0deploy\native\restore.ps1" %*
if errorlevel 1 pause
