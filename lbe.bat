@echo off
REM ============================================================
REM LBE CLI - Lockstep Boundary Engine
REM LBE-NATIVE INTERFACE (NOT Cline)
REM ============================================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "WORKSPACE=%1"

if "%WORKSPACE%"=="" (
    set "WORKSPACE=%CD%"
)

REM Provider configuration resolution
REM Cline providers.json is the source of truth for provider settings
set "CLINE_PROVIDERS=%USERPROFILE%\.cline\data\settings\providers.json"
if exist "%CLINE_PROVIDERS%" (
    set "LBE_PROVIDER_CONFIG=%CLINE_PROVIDERS%"
    echo   Provider config: %CLINE_PROVIDERS%
) else (
    echo   Provider config: NOT FOUND
)

REM Show LBE branding header
echo.
echo  ============================================================
echo  ==  LBE - Lockstep Boundary Engine                        ==
echo  ==  Accountable AI Agent Terminal                        ==
echo  ==  LETTERBLACK - LBE-NATIVE (NOT CLINE)                 ==
echo  ======================================================
echo.
echo  Workspace: %WORKSPACE%
echo.

REM Run the LBE-native CLI
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%lbe-cli.ps1" -Workspace "%WORKSPACE%"

endlocal