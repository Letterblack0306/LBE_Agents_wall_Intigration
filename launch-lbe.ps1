# LBE Production Launcher
# Wires the Rust TUI to the LBE Python backend with provider support

param(
    [Parameter(Position = 0)]
    [string]$Workspace = (Get-Location).Path,
    
    [string]$Provider = 'gemini',
    [string]$Model = 'gemini-3-flash-preview',
    [string]$ApiKey = '',
    
    [switch]$Headless,
    [string]$SessionId = ''
)

$ErrorActionPreference = 'Stop'

$WallRoot = 'C:\Agents-Memory-Tool-v6-integration'
$LbeExe = 'C:\LBE-TUI-Lab\target\release\lbe.exe'

# Resolve workspace
$workspaceRoot = (Resolve-Path -LiteralPath $Workspace -ErrorAction Stop).Path

# Database path
$dbDir = Join-Path $WallRoot 'state'
if (-not (Test-Path $dbDir)) { New-Item -ItemType Directory -Path $dbDir -Force | Out-Null }
$databasePath = Join-Path $dbDir 'workspace.db'

# Workspace identity
$sha = [Security.Cryptography.SHA256]::Create()
try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($workspaceRoot.ToLowerInvariant())
    $hex = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
    $workspaceId = "workspace-$($hex.Substring(0, 24))"
}
finally { $sha.Dispose() }

# Session ID
if (-not $SessionId) {
    $SessionId = "lbe-$( [guid]::NewGuid().ToString('N') )"
}

# Provider config
$providerConfigPath = Join-Path $WallRoot "provider-$Provider.json"

if ($ApiKey) {
    $providerConfig = @{
        endpoint = switch ($Provider) {
            'gemini' { 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' }
            'openai' { 'https://api.openai.com/v1/chat/completions' }
            'anthropic' { 'https://api.anthropic.com/v1/messages' }
            default { 'http://localhost:1234/v1/chat/completions' }
        }
        model = $Model
        timeout_seconds = 120
        api_key = $ApiKey
    }
    $providerConfig | ConvertTo-Json -Depth 5 | Set-Content $providerConfigPath -Encoding UTF8
}

# Set environment
$env:LBE_RUNTIME = 'real'
$env:LBE_WALL_ROOT = $WallRoot
$env:LBE_TARGET_WORKSPACE = $workspaceRoot
$env:LBE_WALL_DATABASE = $databasePath
$env:LBE_SESSION_ID = $SessionId
$env:LBE_PROVIDER_CONFIG = $providerConfigPath

Write-Host "LBE Production Launcher"
Write-Host "========================"
Write-Host "Session: $SessionId"
Write-Host "Workspace: $workspaceId ($workspaceRoot)"
Write-Host "Database: $databasePath"
Write-Host "Provider: $Provider / $Model"
Write-Host ""

if ($Headless) {
    Write-Host "Running headless..."
    & $LbeExe run $args --json
} else {
    Write-Host "Starting TUI (exit with Ctrl+C)..."
    & $LbeExe
}