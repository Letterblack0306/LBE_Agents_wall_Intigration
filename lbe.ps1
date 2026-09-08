# LBE CLI - Lockstep Boundary Engine
# LBE-NATIVE INTERFACE (NOT Cline)

param(
    [string]$Workspace = $PWD.Path,
    [string[]]$Arguments = @()
)

$ErrorActionPreference = 'Continue'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Provider configuration resolution
# Cline providers.json is the source of truth for provider settings
$clineProvidersPath = Join-Path $env:USERPROFILE '.cline\data\settings\providers.json'
if (Test-Path $clineProvidersPath) {
    $env:LBE_PROVIDER_CONFIG = $clineProvidersPath
    Write-Host "  Provider config: $clineProvidersPath" -ForegroundColor Green
} else {
    Write-Host "  Provider config: NOT FOUND (run 'lbe provider select' to configure)" -ForegroundColor Yellow
}

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

# Run the LBE-native CLI
& "$scriptDir\lbe-cli.ps1" -Workspace $Workspace -Arguments $Arguments