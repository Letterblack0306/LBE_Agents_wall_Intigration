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

REM Show LBE branding header
echo.
echo  ============================================================
echo  ==  LBE - Lockstep Boundary Engine                        ==
echo  ==  Accountable AI Agent Terminal                        ==
echo  ==  LETTERBLACK - LBE-NATIVE (NOT CLINE)                 ==
echo  ============================================================
echo.
echo  Workspace: %WORKSPACE%
echo.

REM Run the NEW LBE-native CLI (NOT Cline)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%lbe-cli.ps1" -Workspace "%WORKSPACE%"

endlocal
