# LBE CLI - Lockstep Boundary Engine
# LBE-NATIVE single command: resolve workspace -> authoritative LBE session -> real runtime env -> lbe.exe (Rust UI)
# LBE remains the authority for session, authorization, execution, receipts, evidence, persistence, validation, completion.
# This launcher only composes the product; it does not fabricate runtime truth or launch a second authority.

[CmdletBinding()]
param(
    [Parameter(Position = 0)][string]$Workspace = (Get-Location).Path,
    [string]$Database = '',
    [string]$SessionId = '',
    [string]$AgentWallRoot = '',
    [string]$AgentWallPython = '',
    [switch]$Plan,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
)
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Resolve-Strict([string]$Path, [string]$Label) {
    if (-not $Path) { throw "$Label is required" }
    return (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
}
function New-WorkspaceIdentity([string]$Path) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($Path.ToLowerInvariant())
        $hex = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
        return "workspace-$($hex.Substring(0, 24))"
    } finally { $sha.Dispose() }
}

# Step 1 — resolve the user's target workspace
$workspaceRoot = Resolve-Strict $Workspace 'Workspace'

# Step 2 — resolve the LBE agent-wall (runtime) root: explicit -> env -> sibling of this repo
if (-not $AgentWallRoot) { $AgentWallRoot = $env:LBE_AGENT_WALL_ROOT }
if (-not $AgentWallRoot) {
    $sibling = Join-Path $scriptDir '..\..\LBE_Presistent_Agent_wall'
    if (Test-Path -LiteralPath $sibling) { $AgentWallRoot = $sibling }
}
$wallRoot = Resolve-Strict $AgentWallRoot 'Agent Wall root'

# Step 3 — resolve the runtime python interpreter
$python = if ($AgentWallPython) { Resolve-Strict $AgentWallPython 'Agent Wall Python' }
else {
    $venv = Join-Path $wallRoot '.venv\Scripts\python.exe'
    if (Test-Path -LiteralPath $venv) { $venv } else { (Get-Command python -ErrorAction Stop).Source }
}

# Step 4 — resolve/create the authoritative LBE session
$databasePath = if ($Database) { [IO.Path]::GetFullPath($Database) }
else { Join-Path (Join-Path $scriptDir '.lbe') 'lbe.sqlite3' }
New-Item -ItemType Directory -Path (Split-Path -Parent $databasePath) -Force | Out-Null
$workspaceId = New-WorkspaceIdentity $workspaceRoot
if (-not $SessionId) {
    $session = "lbe-$([guid]::NewGuid().ToString('N'))"
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
} else { $session = $SessionId }

# Step 5 — bind the Rust client to the authoritative runtime
$env:LBE_RUNTIME = 'real'
$env:LBE_WALL_ROOT = $wallRoot
$env:LBE_WALL_PYTHON = $python
$env:LBE_WALL_DATABASE = $databasePath
$env:LBE_SESSION_ID = $session
$env:LBE_PROJECT_WORKSPACE_ID = $workspaceId
$env:LBE_TARGET_WORKSPACE = $workspaceRoot

# Provider configuration: Cline providers.json is the source of truth. Absent -> UI shows "Provider: NOT CONFIGURED".
$clineProviders = Join-Path $env:USERPROFILE '.cline\data\settings\providers.json'
if (-not $env:LBE_PROVIDER_CONFIG -and (Test-Path -LiteralPath $clineProviders)) {
    $env:LBE_PROVIDER_CONFIG = $clineProviders
}

# Step 6 — launch the LBE Rust client
$lbeExe = Join-Path $scriptDir 'lbe.exe'
if (-not (Test-Path -LiteralPath $lbeExe -PathType Leaf)) {
    throw "LBE client missing: $lbeExe (build with: cargo build)"
}
$clientArgs = @('--workspace', $workspaceRoot)
if ($Plan) { $clientArgs += '--agent', 'plan' }
if ($Arguments) { $clientArgs += $Arguments }
& $lbeExe @clientArgs
exit $LASTEXITCODE