# LBE CLI - Lockstep Boundary Engine
# LBE-NATIVE INTERFACE (NOT Cline)

param(
    [string]$Workspace = $PWD.Path,
    [string[]]$Arguments = @()
)

$ErrorActionPreference = 'Continue'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# LBE Branding
Write-Host ''
Write-Host '  ============================================================' -ForegroundColor Cyan
Write-Host '  ==  LBE - Lockstep Boundary Engine                        ==' -ForegroundColor Cyan
Write-Host '  ==  Accountable AI Agent Terminal                        ==' -ForegroundColor Yellow
Write-Host '  ==  LETTERBLACK - LBE-NATIVE (NOT CLINE)                ==' -ForegroundColor Magenta
Write-Host '  ============================================================' -ForegroundColor Cyan
Write-Host ''
Write-Host "  Workspace: $Workspace" -ForegroundColor Gray
Write-Host ''

# Run the NEW LBE-native CLI (NOT Cline)
& "$scriptDir\lbe-cli.ps1" -Workspace $Workspace -Arguments $Arguments