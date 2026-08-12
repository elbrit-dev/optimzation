@echo off
REM Account Audit Dashboard — double-click to run.
REM Opens the browser, then keeps the server in this window. Close it to stop.
cd /d "%~dp0"
start "" http://127.0.0.1:4820
node server.mjs
pause
