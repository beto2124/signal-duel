@echo off
cd /d "%~dp0"
set "RUNTIME=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
if exist "%RUNTIME%\node.exe" set "PATH=%RUNTIME%;%PATH%"
node scripts/launch.mjs
if errorlevel 1 pause
