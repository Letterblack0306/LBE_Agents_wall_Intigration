[CmdletBinding()]
param(
    [switch]$Remove,
    [switch]$SystemWide
)

$ErrorActionPreference = 'Stop'

$lbeRoot = Split-Path -Parent $PSScriptRoot
$targetPath = $lbeRoot

$pathScope = if ($SystemWide) { 'Machine' } else { 'User' }
$pathEnv = [Environment]::GetEnvironmentVariable('Path', $pathScope)

Write-Host "LBE Path Installer" -ForegroundColor Cyan
Write-Host "====================" -ForegroundColor Cyan
Write-Host ""
Write-Host "LBE Root: $lbeRoot" -ForegroundColor Gray

if ($Remove) {
    Write-Host ""
    Write-Host "Removing LBE from PATH..." -ForegroundColor Yellow
    
    $currentPaths = $pathEnv -split ';' | Where-Object { $_ -ne $targetPath -and $_ -ne "$targetPath\" }
    $newPath = $currentPaths -join ';'
    
    [Environment]::SetEnvironmentVariable('Path', $newPath, $pathScope)
    
    # Refresh current session PATH
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Process')
    
    Write-Host "LBE removed from PATH ($pathScope scope)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Please restart your terminal for changes to take effect." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "Adding LBE to PATH..." -ForegroundColor Yellow
    
    $existingPaths = $pathEnv -split ';' | Where-Object { $_ -ne '' }
    $newPath = ($existingPaths + $targetPath) -join ';'
    
    [Environment]::SetEnvironmentVariable('Path', $newPath, $pathScope)
    
    # Update current session PATH
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Process')
    
    Write-Host ""
    Write-Host "LBE added to PATH ($pathScope scope)" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now type 'lbe' from any terminal to open LBE CLI!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  lbe              - Open LBE in current directory"
    Write-Host "  lbe <path>       - Open LBE in specified directory"
    Write-Host ""
}

# Verify
$verifyPath = [Environment]::GetEnvironmentVariable('Path', $pathScope)
if ($verifyPath -like "*$targetPath*") {
    Write-Host "[OK] PATH verified" -ForegroundColor Green
} else {
    Write-Host "[ERROR] PATH verification failed. Please restart terminal." -ForegroundColor Red
}
