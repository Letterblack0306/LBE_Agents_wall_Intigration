@echo off
setlocal

cd /d C:\LBE-TUI-Lab

if not defined LBE_RUNTIME set "LBE_RUNTIME=real"
if not defined LBE_WALL_ROOT set "LBE_WALL_ROOT=C:\Agents-Memory-Tool-v6-integration"
if not defined LBE_TARGET_WORKSPACE set "LBE_TARGET_WORKSPACE=C:\LBE-TUI-Lab"
if not defined LBE_WALL_DATABASE set "LBE_WALL_DATABASE=C:\Agents-Memory-Tool-v6-integration\state\lbe-runtime.db"
if not defined LBE_SESSION_ID set "LBE_SESSION_ID=tui-local-coding-20260904"
if not defined LBE_PROVIDER_CONFIG set "LBE_PROVIDER_CONFIG=C:\Agents-Memory-Tool-v6-integration\reasoning-provider.json"
if not defined LBE_INPUT_TRACE set "LBE_INPUT_TRACE=1"
if not defined LBE_INPUT_TRACE_FILE set "LBE_INPUT_TRACE_FILE=%TEMP%\LetterBlack-LBE-input-trace.log"

where cargo >nul 2>nul
if errorlevel 1 (
  echo Rust Cargo was not found on PATH.
  echo Install Rust or open a shell where cargo is available.
  exit /b 1
)

echo Starting LetterBlack TUI from C:\LBE-TUI-Lab
echo Input trace: %LBE_INPUT_TRACE_FILE%
echo Mouse clicks: not wired; keyboard actions are traced below.
if exist target\release\lbe.exe (
  target\release\lbe.exe %*
) else (
  cargo run -- %*
)
exit /b %errorlevel%
