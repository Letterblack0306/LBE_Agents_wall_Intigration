[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('check', 'prove', 'build', 'package', 'install')]
    [string]$Command = 'check',
    [string]$AgentWall = 'C:\Agents-Memory-Tool-v6-integration',
    [string]$LbeTui = 'C:\LBE-TUI-Lab',
    [string]$OutputRoot = '',
    [string]$InstallRoot = '',
    [string]$Workspace = '',
    [string]$Database = '',
    [string]$CapabilityRegistry = '',
    [string]$BirdEyeServer = '',
    [string]$BirdEyePython = '',
    [switch]$Fetch
)

$ErrorActionPreference = 'Stop'
$script:Product = 'LetterBlack LBE'
$script:SchemaVersion = 1

function Invoke-Git([string]$Root, [string[]]$Arguments) {
    $output = & git -C $Root @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') failed in $Root`n$($output -join "`n")" }
    return ($output -join "`n").Trim()
}

function Get-Repo([string]$Root, [string]$ExpectedRemote) {
    if (-not (Test-Path (Join-Path $Root '.git'))) { throw "not a Git repository: $Root" }
    $branch = Invoke-Git $Root @('branch', '--show-current')
    $head = Invoke-Git $Root @('rev-parse', 'HEAD')
    $remote = Invoke-Git $Root @('config', '--get', 'remote.origin.url')
    $remoteHead = try { Invoke-Git $Root @('rev-parse', 'origin/main') } catch { $null }
    $status = @(git -C $Root status --short)
    $worktrees = @(git -C $Root worktree list --porcelain | Where-Object { $_ -like 'worktree *' })
    [ordered]@{
        path = $Root
        repository = $remote
        expected_repository = $ExpectedRemote
        repository_match = ($remote -match [regex]::Escape($ExpectedRemote))
        branch = $branch
        branch_is_main = ($branch -eq 'main')
        head = $head
        origin_main = $remoteHead
        dirty = ($status.Count -gt 0)
        dirty_entries = $status
        worktree_count = $worktrees.Count
        single_worktree = ($worktrees.Count -le 1)
    }
}

function Test-PathText([string]$Root, [string]$Pattern) {
    return [bool](rg -n --hidden --glob '!target/**' --glob '!.git/**' $Pattern $Root 2>$null)
}

function Get-Manifest([hashtable]$Wall, [hashtable]$Tui) {
    [ordered]@{
        schema_version = $script:SchemaVersion
        product = $script:Product
        generated_at_utc = [DateTime]::UtcNow.ToString('o')
        source = [ordered]@{
            agent_wall = [ordered]@{ repository = $Wall.repository; commit = $Wall.origin_main; source_ref = 'origin/main' }
            client = [ordered]@{ repository = $Tui.repository; commit = $Tui.origin_main; source_ref = 'origin/main' }
        }
        contracts = [ordered]@{
            core_lbe_runtime = 'PROVEN'
            provider_continuation = 'PROVEN'
            session_persistence_recovery = 'PROVEN_BASELINE'
            tool_registry_receipts = 'PROVEN_BASELINE'
            rust_real_attachment = 'PROVEN'
            readonly_tools = 'PROVEN'
            approval_core = 'PROVEN_CLOSED'
            approval_product_bridge = 'PROVEN_MISSING'
            workspace_patch_live = 'UNPROVEN'
            cross_process_exactly_once = 'UNPROVEN'
            persisted_mcp_ordering = 'OPEN'
            installed_pty = 'UNPROVEN'
            installed_restart_resume = 'UNPROVEN'
        }
        blocking_seams = @('approval_product_bridge', 'workspace_patch_live', 'cross_process_exactly_once', 'installed_pty', 'installed_restart_resume')
        ownership = [ordered]@{
            agent_wall_runtime_authority = $true
            rust_client_projection_only = $true
            verifier_runtime_authority = $false
        }
    }
}

function Write-Json([object]$Value, [string]$Path) {
    $Value | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Invoke-Check {
    $wall = Get-Repo $AgentWall 'LBE_Presistent_Agent_wall'
    $tui = Get-Repo $LbeTui 'LBE_Agents_wall_Intigration'
    if ($Fetch) {
        Invoke-Git $AgentWall @('fetch', 'origin', 'main') | Out-Null
        Invoke-Git $LbeTui @('fetch', 'origin', 'main') | Out-Null
        $wall = Get-Repo $AgentWall 'LBE_Presistent_Agent_wall'
        $tui = Get-Repo $LbeTui 'LBE_Agents_wall_Intigration'
    }

    $checks = [ordered]@{
        agent_wall_single_worktree = $wall.single_worktree
        tui_single_worktree = $tui.single_worktree
        agent_wall_has_product_entry = Test-Path (Join-Path $AgentWall 'lbe_guard_inspector/product_entry.py')
        agent_wall_has_tool_command = Test-PathText (Join-Path $AgentWall 'lbe_guard_inspector') 'def _tool|--operation-id'
        tui_has_real_wrapper = Test-PathText (Join-Path $LbeTui 'src') 'RealLbeWrapper'
        tui_uses_product_entry = Test-PathText (Join-Path $LbeTui 'src') 'product_entry'
        tui_has_no_local_authorizer = -not (Test-PathText (Join-Path $LbeTui 'src') 'class AuthorizationResolver|struct AuthorizationResolver|GovernedToolOrchestrator|AuthorizationDecision')
    }
    $manifest = Get-Manifest $wall $tui
    $result = [ordered]@{ status = if (($checks.Values -contains $false) -or -not $wall.repository_match -or -not $tui.repository_match) { 'FAIL' } else { 'PASS_WITH_OPEN_GATES' }; repositories = @($wall, $tui); checks = $checks; manifest = $manifest }
    $result | ConvertTo-Json -Depth 12
}

function New-CleanSource([string]$Root, [string]$Ref, [string]$Destination) {
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $archive = Join-Path ([IO.Path]::GetTempPath()) (([guid]::NewGuid().ToString('N')) + '.tar')
    try {
        & git -C $Root archive --format=tar -o $archive $Ref
        if ($LASTEXITCODE -ne 0) { throw "unable to archive $Root at $Ref" }
        & tar -xf $archive -C $Destination
        if ($LASTEXITCODE -ne 0) { throw "unable to extract $archive" }
    } finally { Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue }
}

function Invoke-Prove {
    $wall = Get-Repo $AgentWall 'LBE_Presistent_Agent_wall'
    $tui = Get-Repo $LbeTui 'LBE_Agents_wall_Intigration'
    $report = [ordered]@{
        status = 'PROOF_REQUIRED'
        source_commits = [ordered]@{ agent_wall = $wall.origin_main; client = $tui.origin_main }
        checks = [ordered]@{
            source_pinned = [bool]($wall.origin_main -and $tui.origin_main)
            cross_workspace_runtime = 'NOT_RUN'
            approval_product_bridge = 'PROVEN_MISSING'
            workspace_patch_live = 'NOT_RUN'
            receipt_evidence_correlation = 'NOT_RUN'
            rust_projection = 'NOT_RUN'
        }
        next_required_acceptance = @('approve -> workspace.patch exactly once', 'duplicate replay -> same receipt with zero mutation', 'changed payload -> rejected', 'receipt/evidence -> Rust projection')
    }
    $report | ConvertTo-Json -Depth 10
}

function Invoke-Build {
    $out = if ($OutputRoot) { $OutputRoot } else { Join-Path $LbeTui 'dist\LetterBlack-LBE' }
    $temp = Join-Path ([IO.Path]::GetTempPath()) ('lbe-build-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temp -Force | Out-Null
    try {
        $wall = Get-Repo $AgentWall 'LBE_Presistent_Agent_wall'
        $tui = Get-Repo $LbeTui 'LBE_Agents_wall_Intigration'
        New-CleanSource $AgentWall 'origin/main' (Join-Path $temp 'lbe')
        New-CleanSource $LbeTui 'origin/main' (Join-Path $temp 'client')
        Push-Location (Join-Path $temp 'client')
        try { & cargo build --release; if ($LASTEXITCODE -ne 0) { throw 'Rust release build failed' } } finally { Pop-Location }
        Push-Location (Join-Path $temp 'lbe')
        try { & python -m pip wheel . --no-deps --no-build-isolation --wheel-dir (Join-Path $temp 'wheels'); if ($LASTEXITCODE -ne 0) { throw 'Agent Wall wheel build failed' } } finally { Pop-Location }
        $manifest = Get-Manifest $wall $tui
        New-Item -ItemType Directory -Path $out -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $out 'client'), (Join-Path $out 'lbe'), (Join-Path $out 'evidence') -Force | Out-Null
        Copy-Item (Join-Path $temp 'client\target\release\lbe.exe') (Join-Path $out 'client\lbe.exe')
        Copy-Item (Join-Path $temp 'wheels\*') (Join-Path $out 'lbe')
        Write-Json $manifest (Join-Path $out 'evidence\integration-manifest.json')
        Write-Output (Join-Path $out 'evidence\integration-manifest.json')
    } finally { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

function Invoke-Package {
    $out = if ($OutputRoot) { $OutputRoot } else { Join-Path $LbeTui 'dist\LetterBlack-LBE' }
    $manifestPath = Join-Path $out 'evidence\integration-manifest.json'
    if (-not (Test-Path $manifestPath)) { throw "build output missing: $manifestPath; run build first" }
    $manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
    if ($manifest.blocking_seams.Count -gt 0) { Write-Warning ('Product package is not acceptance-ready; open gates: ' + ($manifest.blocking_seams -join ', ')) }
    $hashes = [ordered]@{}
    Get-ChildItem $out -File -Recurse | ForEach-Object { $hashes[$_.FullName.Substring($out.Length + 1)] = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    Write-Json ([ordered]@{ product = $script:Product; package_status = 'BUILDABLE_NOT_RELEASE_ACCEPTED'; files = $hashes }) (Join-Path $out 'evidence\checksums.json')
    $zip = Join-Path (Split-Path $out -Parent) 'LetterBlack-LBE-2.0.x-win-x64.zip'
    if (Test-Path $zip) { Remove-Item -LiteralPath $zip -Force }
    Compress-Archive -Path (Join-Path $out '*') -DestinationPath $zip
    Write-Output $zip
}

function Resolve-LocalPython {
    if ($BirdEyePython) {
        $candidate = (Resolve-Path -LiteralPath $BirdEyePython -ErrorAction Stop).Path
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "configured BirdEye Python is not a file: $candidate" }
        return $candidate
    }
    foreach ($name in @('python', 'py')) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
    }
    return $null
}

function Resolve-LocalBirdEyeServer {
    if ($BirdEyeServer) {
        if (Test-Path -LiteralPath $BirdEyeServer -PathType Leaf) {
            return (Resolve-Path -LiteralPath $BirdEyeServer).Path
        }
        return $null
    }
    if ($env:LBE_BIRDEYE_MCP_SERVER) {
        if (Test-Path -LiteralPath $env:LBE_BIRDEYE_MCP_SERVER -PathType Leaf) {
            return (Resolve-Path -LiteralPath $env:LBE_BIRDEYE_MCP_SERVER).Path
        }
        return $null
    }
    $candidates = @(
        (Join-Path $AgentWall 'mcp\birdeye\mcp_server.py'),
        'C:\MCP Local\Letterblack_BirdEye\mcp_server.py'
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    return $null
}

function Invoke-Install {
    $out = if ($InstallRoot) { (Resolve-Path -LiteralPath $InstallRoot -ErrorAction SilentlyContinue).Path } else { Join-Path $LbeTui 'dist\LetterBlack-LBE-installed' }
    if (-not $out) { $out = $InstallRoot }
    if (-not $out) { throw 'install root could not be resolved' }
    $config = Join-Path $out 'config'
    New-Item -ItemType Directory -Path $config -Force | Out-Null

    $python = Resolve-LocalPython
    $server = Resolve-LocalBirdEyeServer
    $registryPath = if ($CapabilityRegistry) { $CapabilityRegistry } else { Join-Path $config 'capability-registry.json' }
    $workspacePath = if ($Workspace) { (Resolve-Path -LiteralPath $Workspace -ErrorAction Stop).Path } else { $null }
    $databasePath = if ($Database) { [IO.Path]::GetFullPath($Database) } else { Join-Path $out 'state\lbe.sqlite3' }

    $mcp = [ordered]@{
        schema_version = 1
        provider = 'birdeye'
        status = if ($server -and $python) { 'CONFIGURED' } else { 'UNAVAILABLE_CONFIGURATION_REQUIRED' }
        server = $server
        python = $python
        transport = 'stdio'
        authority = 'LBE ToolRegistry and authorization'
        index_owner = 'BirdEye MCP workspace/index projection'
        skills_role = 'procedural guidance only'
    }
    $runtime = [ordered]@{
        schema_version = 1
        product = $script:Product
        workspace = $workspacePath
        database = $databasePath
        capability_registry = $registryPath
        mcp_configuration = (Join-Path $config 'mcp.json')
        generated_at_utc = [DateTime]::UtcNow.ToString('o')
    }
    $terminalProfile = [ordered]@{
        name = 'LetterBlack LBE'
        source = 'LetterBlack LBE installer'
        commandline = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File lbe-launch.ps1'
        font = [ordered]@{
            face = 'Cascadia Mono'
            size = 12
            weight = 'normal'
        }
        note = 'Windows Terminal profile template; the host terminal remains user-configurable.'
    }
    if (-not (Test-Path -LiteralPath $registryPath)) {
        $registry = [ordered]@{ schema_version = 1; integrations = @() }
        Write-Json $registry $registryPath
    }
    Write-Json $mcp (Join-Path $config 'mcp.json')
    Write-Json $runtime (Join-Path $config 'runtime.json')
    Write-Json $terminalProfile (Join-Path $config 'windows-terminal-profile.json')
    $launcher = @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtime = Get-Content -LiteralPath (Join-Path $root 'config\runtime.json') -Raw | ConvertFrom-Json
$mcp = Get-Content -LiteralPath (Join-Path $root 'config\mcp.json') -Raw | ConvertFrom-Json
if (-not $runtime.workspace) { throw 'No workspace configured. Rerun install with -Workspace <path>.' }
$env:LBE_RUNTIME = 'real'
$env:LBE_TARGET_WORKSPACE = [string]$runtime.workspace
$env:LBE_WALL_DATABASE = [string]$runtime.database
$env:LBE_CAPABILITY_REGISTRY = [string]$runtime.capability_registry
if ($mcp.python) { $env:LBE_BIRDEYE_MCP_PYTHON = [string]$mcp.python }
if ($mcp.server) { $env:LBE_BIRDEYE_MCP_SERVER = [string]$mcp.server }
$client = Join-Path $root 'client\lbe.exe'
if (-not (Test-Path -LiteralPath $client -PathType Leaf)) { throw "Installed client not found: $client" }
& $client @Arguments
exit $LASTEXITCODE
'@
    Set-Content -LiteralPath (Join-Path $out 'lbe-launch.ps1') -Value $launcher -Encoding UTF8
    [ordered]@{
        status = $mcp.status
        install_root = $out
        python = $python
        birdeye_server = $server
        capability_registry = $registryPath
        mcp_config = (Join-Path $config 'mcp.json')
        runtime_config = (Join-Path $config 'runtime.json')
        terminal_profile = (Join-Path $config 'windows-terminal-profile.json')
        launcher = (Join-Path $out 'lbe-launch.ps1')
        note = if ($mcp.status -eq 'CONFIGURED') { 'MCP configuration generated from detected machine paths.' } else { 'Install completed without MCP activation; provide BirdEye server and Python paths, then rerun install.' }
    } | ConvertTo-Json -Depth 8
}

switch ($Command) {
    'check' { Invoke-Check }
    'prove' { Invoke-Prove }
    'build' { Invoke-Build }
    'package' { Invoke-Package }
    'install' { Invoke-Install }
}
