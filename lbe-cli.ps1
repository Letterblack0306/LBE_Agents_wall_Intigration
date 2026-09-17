# LBE CLI - Lockstep Boundary Engine
# Canonical LBE-branded terminal launcher.
# LBE owns session identity, policy, authorization, execution, receipts, evidence,
# persistence, validation, and completion. The Rust binary is only the UI client.

[CmdletBinding()]
param(
    [string]$Workspace = (Get-Location).Path,
    [string[]]$Arguments = @(),
    [string]$WallRoot = $(if ($env:LBE_WALL_ROOT) { $env:LBE_WALL_ROOT } else { '' }),
    [string]$Database = $(if ($env:LBE_WALL_DATABASE) { $env:LBE_WALL_DATABASE } else { '' }),
    [string]$SessionId = $(if ($env:LBE_SESSION_ID) { $env:LBE_SESSION_ID } else { '' })
)

$ErrorActionPreference = 'Stop'

function Resolve-RequiredDirectory([string]$Path, [string]$Name) {
    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "$Name is not configured. Set LBE_WALL_ROOT for the installed LBE runtime."
    }
    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    if (-not (Test-Path -LiteralPath $resolved.Path -PathType Container)) {
        throw "$Name is not a directory: $($resolved.Path)"
    }
    return $resolved.Path
}

$workspaceRoot = (Resolve-Path -LiteralPath $Workspace -ErrorAction Stop).Path
if (-not (Test-Path -LiteralPath $workspaceRoot -PathType Container)) {
    throw "Workspace is not a directory: $workspaceRoot"
}

$wallRoot = Resolve-RequiredDirectory $WallRoot 'LBE_WALL_ROOT'
$python = if ($env:LBE_WALL_PYTHON) {
    $env:LBE_WALL_PYTHON
} else {
    (Get-Command python -ErrorAction Stop).Source
}
if (-not (Test-Path -LiteralPath $python -PathType Leaf) -and $python -notmatch '^[^\\/:]+$') {
    throw "LBE_WALL_PYTHON is unavailable: $python"
}

if ([string]::IsNullOrWhiteSpace($Database)) {
    $Database = Join-Path $wallRoot '.lbe\lbe.sqlite3'
}
$databaseParent = Split-Path -Parent $Database
if (-not (Test-Path -LiteralPath $databaseParent -PathType Container)) {
    New-Item -ItemType Directory -Path $databaseParent -Force | Out-Null
}

$workspaceId = if ($env:LBE_PROJECT_WORKSPACE_ID) {
    $env:LBE_PROJECT_WORKSPACE_ID
} else {
    $bytes = [Text.Encoding]::UTF8.GetBytes($workspaceRoot.ToLowerInvariant())
    $hash = [Security.Cryptography.SHA256]::HashData($bytes)
    $hex = [BitConverter]::ToString($hash).Replace('-', '').ToLowerInvariant()
    "workspace-$($hex.Substring(0, 24))"
}

$providerConfig = Join-Path $env:USERPROFILE '.cline\data\settings\providers.json'
if (-not (Test-Path -LiteralPath $providerConfig -PathType Leaf)) {
    throw "Provider configuration is required but was not found: $providerConfig"
}
$env:LBE_PROVIDER_CONFIG = [IO.Path]::GetFullPath($providerConfig)

$sessionListArgs = @(
    '-m', 'lbe_guard_inspector.cli', '--format', 'json',
    'session', 'list',
    '--database', $Database,
    '--project-workspace-id', $workspaceId
)
$sessionListOutput = & $python @sessionListArgs 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "LBE session listing failed: $([Environment]::NewLine)$($sessionListOutput -join [Environment]::NewLine)"
}
try {
    $sessionList = ($sessionListOutput -join [Environment]::NewLine) | ConvertFrom-Json -ErrorAction Stop
} catch {
    throw "LBE session-list response was not valid JSON"
}
$session = @($sessionList.sessions) |
    Where-Object {
        if (-not $_.session_id -or -not $_.canonical_workspace_root) { return $false }
        $storedRoot = ([string]$_.canonical_workspace_root).Replace('/', '\').TrimEnd('\')
        $currentRoot = $workspaceRoot.Replace('/', '\').TrimEnd('\')
        return $storedRoot -ieq $currentRoot
    } |
    Sort-Object updated_at -Descending |
    Select-Object -First 1

if ($session) {
    $SessionId = [string]$session.session_id
} else {
    $SessionId = "lbe-$([guid]::NewGuid().ToString('N'))"
    $createArgs = @(
        '-m', 'lbe_guard_inspector.cli', '--format', 'json',
        'session', 'create',
        '--database', $Database,
        '--workspace', $workspaceRoot,
        '--project-workspace-id', $workspaceId,
        '--session-id', $SessionId,
        '--mode', 'audit',
        '--permission', 'read_only',
        '--runtime-policy', 'audit'
    )
    $createOutput = & $python @createArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "LBE session creation failed: $([Environment]::NewLine)$($createOutput -join [Environment]::NewLine)"
    }
}

$env:LBE_RUNTIME = 'real'
$env:LBE_WALL_ROOT = $wallRoot
$env:LBE_WALL_PYTHON = $python
$env:LBE_WALL_DATABASE = $Database
$env:LBE_SESSION_ID = $SessionId
$env:LBE_TARGET_WORKSPACE = $workspaceRoot
$env:LBE_PROJECT_WORKSPACE_ID = $workspaceId

$lbeExe = Join-Path $PSScriptRoot 'lbe.exe'
if (-not (Test-Path -LiteralPath $lbeExe -PathType Leaf)) {
    throw "LBE client binary is unavailable: $lbeExe"
}

Write-Host "LBE" -ForegroundColor Cyan
Write-Host "Workspace: $workspaceRoot" -ForegroundColor Gray
Write-Host "Session:   $SessionId" -ForegroundColor Gray
Write-Host "Runtime:   LBE authoritative runtime" -ForegroundColor Gray
Write-Host "Provider:  discovered from configured Cline provider settings" -ForegroundColor Gray

& $lbeExe '--workspace' $workspaceRoot @Arguments
exit $LASTEXITCODE
