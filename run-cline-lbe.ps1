[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Workspace = (Get-Location).Path,
    [string]$Database = '',
    [string]$ProjectWorkspaceId = '',
    [string]$SessionId = '',
    [string]$AgentWallRoot = 'C:\Agents-Memory-Tool-v6-integration',
    [string]$AgentWallPython = '',
    [string]$Client = '',
    [switch]$Plan,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = 'Stop'

function Resolve-FullPath([string]$Path, [string]$Label) {
    if (-not $Path) { throw "$Label is required" }
    $resolved = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
    return $resolved
}

function New-WorkspaceIdentity([string]$Path) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($Path.ToLowerInvariant())
        $hex = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
        return "workspace-$($hex.Substring(0, 24))"
    }
    finally { $sha.Dispose() }
}

$workspaceRoot = Resolve-FullPath $Workspace 'Workspace'
$wallRoot = Resolve-FullPath $AgentWallRoot 'Agent Wall root'
$python = if ($AgentWallPython) {
    Resolve-FullPath $AgentWallPython 'Agent Wall Python'
} else {
    $command = Get-Command python -ErrorAction Stop
    $command.Source
}

$clientPath = if ($Client) {
    Resolve-FullPath $Client 'LBE CLI client'
} else {
    # Use system-installed Cline from npm
    $clineCommand = Get-Command cline -ErrorAction Stop
    $clineCommand.Source
}

$databasePath = if ($Database) {
    [IO.Path]::GetFullPath($Database)
} else {
    Join-Path $PSScriptRoot '.lbe\lbe.sqlite3'
}
New-Item -ItemType Directory -Path (Split-Path -Parent $databasePath) -Force | Out-Null

$workspaceId = if ($ProjectWorkspaceId) { $ProjectWorkspaceId } else { New-WorkspaceIdentity $workspaceRoot }
$session = if ($SessionId) { $SessionId } else { "cline-$([guid]::NewGuid().ToString('N'))" }

if (-not $SessionId) {
    $createArgs = @(
        '-m', 'lbe_guard_inspector.cli', '--format', 'json', 'session', 'create',
        '--database', $databasePath,
        '--workspace', $workspaceRoot,
        '--project-workspace-id', $workspaceId,
        '--session-id', $session,
        '--mode', 'coding',
        '--permission', 'write_allowed',
        '--runtime-policy', 'development'
    )
    $createOutput = & $python @createArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "LBE session creation failed:`n$($createOutput -join "`n")"
    }
}

$env:LBE_RUNTIME = 'real'
$env:LBE_WALL_ROOT = $wallRoot
$env:LBE_WALL_PYTHON = $python
$env:LBE_WALL_DATABASE = $databasePath
$env:LBE_SESSION_ID = $session
$env:LBE_PROJECT_WORKSPACE_ID = $workspaceId
$env:LBE_TARGET_WORKSPACE = $workspaceRoot

$clineArgs = @('--cwd', $workspaceRoot)
if ($Plan) { $clineArgs += '--plan' }
if ($Arguments) { $clineArgs += $Arguments } else { $clineArgs += '--tui' }

Write-Host "LBE session: $session"
Write-Host "LBE workspace: $workspaceId"
Write-Host "Workspace: $workspaceRoot"
& $clientPath @clineArgs
exit $LASTEXITCODE
