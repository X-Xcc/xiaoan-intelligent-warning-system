@echo off
setlocal
call "%~dp0start.cmd" %*
exit /b %errorlevel%
