# LBE CLI - Lockstep Boundary Engine
# LBE-NATIVE INTERFACE (NOT Cline)

param(
    [string]$Workspace = $PWD.Path,
    [string[]]$Arguments = @()
)

$ErrorActionPreference = 'Continue'

$FG = @{G='Green';A='Yellow';R='Red';M='Magenta';C='Cyan';W='White';GR='Gray'}

function Header {
    param($S, $R, $M)
    Write-Host ''
    Write-Host ('  ' + ('=' * 76)) -ForegroundColor $FG.G
    Write-Host '  ==  LBE - LOCKSTEP BOUNDARY ENGINE                       ==' -ForegroundColor $FG.G
    Write-Host '  ==  Accountable AI Agent Terminal                       ==' -ForegroundColor $FG.A
    Write-Host '  ==  LBE-NATIVE (NOT CLINE)                             ==' -ForegroundColor $FG.M
    Write-Host ('  ' + ('=' * 76)) -ForegroundColor $FG.G
    Write-Host ''
    Write-Host ('  SESSION: ' + $S + ' | RUNTIME: ' + $R + ' | MODE: ' + $M) -ForegroundColor $FG.GR
    Write-Host ('  ' + ('-' * 76)) -ForegroundColor $FG.GR
    Write-Host ''
}

function Footer {
    Write-Host ''
    Write-Host ('  ' + ('-' * 76)) -ForegroundColor $FG.GR
    Write-Host '  [/]Evidence [/]Memory [/]Skills [/]Audit [/]Govern [/]Help [/]Quit' -ForegroundColor $FG.GR
    Write-Host ''
}

function OK { param($M) Write-Host ('  [OK] ' + $M) -ForegroundColor $FG.G }
function ERR { param($M) Write-Host ('  [ERR] ' + $M) -ForegroundColor $FG.R }
function INF { param($M) Write-Host ('  [I] ' + $M) -ForegroundColor $FG.GR }
function PROMPT { Write-Host -NoNewline '  > ' -ForegroundColor $FG.A }

function BOX {
    param($T, $C)
    Write-Host ('  +' + ('-' * 60) + '+') -ForegroundColor $FG.GR
    Write-Host ('  |  ' + $T) -ForegroundColor $FG.A
    Write-Host ('  +' + ('-' * 60) + '+') -ForegroundColor $FG.GR
    foreach($L in ($C -split "`n")) { Write-Host ('  | ' + $L) -ForegroundColor $FG.W }
    Write-Host ('  +' + ('-' * 60) + '+') -ForegroundColor $FG.GR
}

function Do-Evidence {
    BOX 'EVIDENCE BROWSER' 'Querying through LBE governance...'
    try {
        $r = birdeye__workspace_identity -EA SilentlyContinue
        if ($r) { OK ('Connected: ' + $r.workspace); INF ('Branch: ' + $r.latest_git_branch_name) }
        else { INF 'Preview mode' }
    } catch { ERR $_ }
}

function Do-Memory {
    BOX 'MEMORY RECALL' 'Querying memory...'
    try {
        $r = birdeye__memory_search -Mode hybrid -Query 'recent' -k 5 -EA SilentlyContinue
        if ($r -and $r.results) { foreach ($i in $r.results) { Write-Host ('  | ' + $i.provenance) -ForegroundColor $FG.G } }
        else { INF 'No records' }
    } catch { ERR $_ }
}

function Do-Skills {
    BOX 'SKILLS REGISTRY' 'Querying skills...'
    try {
        $r = birdeye__skills -Operation status -EA SilentlyContinue
        if ($r) { OK ('Authority: ' + $r.authority); INF ('Files: ' + $r.files_tracked) }
        else { INF 'No skills' }
    } catch { ERR $_ }
}

function Do-Audit { BOX 'AUDIT TRAIL' 'Authorization: BOUNDED`nEvidence: ENFORCED`nReceipts: ENFORCED`nMutation: APPROVAL_REQUIRED' }
function Do-Governance { BOX 'GOVERNANCE' 'Authorization: BOUNDED`nMutation Policy: APPROVAL_REQUIRED`nEvidence: ENFORCED`nReceipts: ENFORCED`nSession: ACTIVE' }
function Do-Help { BOX 'HELP' '/evidence /memory /skills /audit /governance /mode [x] /clear /quit' }

function Do-Mode {
    param([string]$M)
    if ($M) { $script:mode = $M.ToUpper(); OK ('Mode: ' + $script:mode) }
    else {
        Write-Host ('  Current Mode: ' + $script:mode) -ForegroundColor $FG.A
        Write-Host '  Available: BUILD | PLAN | AUDIT | AUTOMATION | SUBAGENT | TEAM' -ForegroundColor $FG.GR
    }
}
function Start-Lbe {
    $sid = 'lbe-' + [guid]::NewGuid().ToString('N').Substring(0,8)
    $runtime = 'PREVIEW'; $script:mode = 'BUILD'; $conv = @()
    try { $id = birdeye__workspace_identity -EA Stop; if ($id) { $runtime = 'LIVE' } } catch {}
    Clear-Host; Header $sid $runtime $script:mode
    INF ('BirdEye: ' + $runtime + ' | /help for commands'); Footer
    if ($Arguments -and $Arguments.Count -gt 0) {
        $c = $Arguments[0]
        if ($c -match '^/mode(?:\s+(\w+))?') { Do-Mode $Matches[1] }
        elseif ($c -match '^/evidence') { Do-Evidence }
        elseif ($c -match '^/memory') { Do-Memory }
        elseif ($c -match '^/skills') { Do-Skills }
        elseif ($c -match '^/audit') { Do-Audit }
        elseif ($c -match '^/governance') { Do-Governance }
        elseif ($c -match '^/help') { Do-Help }
        elseif ($c -match '^/quit') { OK 'Goodbye'; return }
        else { INF ('Unknown: ' + $c) }
        return
    }
    while ($true) {
        PROMPT; $in = Read-Host
        if ([string]::IsNullOrWhiteSpace($in)) { continue }
        if ($in.StartsWith('/')) {
            if ($in -match '^/evidence') { Do-Evidence }
            elseif ($in -match '^/memory') { Do-Memory }
            elseif ($in -match '^/skills') { Do-Skills }
            elseif ($in -match '^/audit') { Do-Audit }
            elseif ($in -match '^/governance') { Do-Governance }
            elseif ($in -match '^/help') { Do-Help }
            elseif ($in -match '^/clear') { Clear-Host; Header $sid $runtime $script:mode; Footer; continue }
            elseif ($in -match '^/quit') { OK 'Goodbye from LBE'; break }
            elseif ($in -match '^/mode(?:\s+(\w+))?') { Do-Mode $Matches[1] }
            else { ERR ('Unknown: ' + $in) }
            continue
        }
        $conv += @{T='user'; V=$in}; $conv += @{T='agent'; V='LBE governed - /governance'}
        Clear-Host; Header $sid $runtime $script:mode
        foreach ($m in $conv) {
            if ($m.T -eq 'user') { Write-Host ('  > ' + $m.V) -ForegroundColor $FG.W }
            else { Write-Host ('  [Agent] ' + $m.V) -ForegroundColor $FG.G }
        }
        Footer
    }
}

Write-Host ''
Write-Host '  ============================================================' -ForegroundColor $FG.C
Write-Host '  ==  LBE - LOCKSTEP BOUNDARY ENGINE                        ==' -ForegroundColor $FG.C
Write-Host '  ==  UNIQUE ACCOUNTABLE AI TERMINAL                       ==' -ForegroundColor $FG.A
Write-Host '  ==  LBE-NATIVE INTERFACE (NOT CLINE)                    ==' -ForegroundColor $FG.M
Write-Host '  ============================================================' -ForegroundColor $FG.C
Write-Host ''
Write-Host ('  Workspace: ' + $Workspace) -ForegroundColor $FG.GR
$be = 'PREVIEW'
if (Test-Path 'C:\MCP Local\Letterblack_BirdEye') { $be = 'CONNECTED' }
Write-Host ('  BirdEye: ' + $be) -ForegroundColor $FG.GR
Write-Host ''
Start-Lbe
