@echo off
setlocal
for /f "tokens=2 delims=:" %%P in ('chcp') do set "original_code_page=%%P"
chcp 65001 >nul
call "%~dp0一键启动稳定版.cmd" %*
set "result=%errorlevel%"
chcp %original_code_page% >nul
exit /b %result%
