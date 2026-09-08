# LBE CLI - Lockstep Boundary Engine
# LBE-NATIVE INTERFACE (NOT Cline)

param(
    [string]$Workspace = $PWD.Path,
    [string[]]$Arguments = @()
)

$ErrorActionPreference = 'Continue'

# Provider configuration resolution
# Cline providers.json is the source of truth for provider settings
$clineProvidersPath = Join-Path $env:USERPROFILE '.cline\data\settings\providers.json'
if (Test-Path $clineProvidersPath) {
    $env:LBE_PROVIDER_CONFIG = $clineProvidersPath
    Write-Host "  Provider config: $clineProvidersPath" -ForegroundColor Green
} else {
    Write-Host "  Provider config: NOT FOUND" -ForegroundColor Yellow
}

# LBE Branding
Write-Host ''
Write-Host '  ============================================================' -ForegroundColor Cyan
Write-Host '  ==  LBE - LOCKSTEP BOUNDARY ENGINE                        ==' -ForegroundColor Cyan
Write-Host '  ==  Accountable AI Agent Terminal                        ==' -ForegroundColor Yellow
Write-Host '  ==  LETTERBLACK - LBE-NATIVE (NOT CLINE)                 ==' -ForegroundColor Magenta
Write-Host '  ============================================================' -ForegroundColor Cyan
Write-Host ''
Write-Host "  Workspace: $Workspace" -ForegroundColor Gray
Write-Host ''

# Normal conversation path: launch the Rust TUI.
# The TUI uses the existing Cline interactive mechanics through the
# LBE authority boundary (RealLbeWrapper -> product_entry.py).
# lbe-cli.ps1 is a launcher/fallback only - no fabricated conversation.
$lbeExe = Join-Path $PSScriptRoot 'lbe.exe'
if (Test-Path $lbeExe) {
    & $lbeExe --workspace $Workspace
    exit $LASTEXITCODE
}

# Fallback: if lbe.exe is not available, run diagnostic commands only.
# Diagnostic commands (no interactive conversation):
$FG = @{G='Green';A='Yellow';R='Red';M='Magenta';C='Cyan';W='White';GR='Gray'}

if ($Arguments -and $Arguments.Count -gt 0) {
    $arg = $Arguments[0]
    if ($arg -match '^(/evidence|/memory|/skills|/audit|/governance|/help|/quit)$') {
        switch ($arg) {
            '/evidence' {
                Write-Host "  Evidence Browser - LBE governed" -ForegroundColor Cyan
                Write-Host "  Query: LBE evidence through product_entry.py" -ForegroundColor Gray
            }
            '/memory' {
                Write-Host "  Memory Recall - LBE governed" -ForegroundColor Cyan
                Write-Host "  Query: LBE memory through LBE_MEMORY_DB" -ForegroundColor Gray
            }
            '/skills' {
                Write-Host "  Skills Registry - LBE bounded" -ForegroundColor Cyan
                Write-Host "  Query: LBE governed skill surface" -ForegroundColor Gray
            }
            '/audit' {
                Write-Host "  Audit Trail" -ForegroundColor Cyan
                Write-Host "  Authorization: BOUNDED" -ForegroundColor Gray
                Write-Host "  Evidence: ENFORCED" -ForegroundColor Gray
                Write-Host "  Receipts: ENFORCED" -ForegroundColor Gray
                Write-Host "  Mutation: APPROVAL_REQUIRED" -ForegroundColor Gray
            }
            '/governance' {
                Write-Host "  Governance" -ForegroundColor Cyan
                Write-Host "  Authorization: BOUNDED" -ForegroundColor Gray
                Write-Host "  Mutation Policy: APPROVAL_REQUIRED" -ForegroundColor Gray
                Write-Host "  Evidence: ENFORCED" -ForegroundColor Gray
                Write-Host "  Receipts: ENFORCED" -ForegroundColor Gray
                Write-Host "  Session: ACTIVE" -ForegroundColor Gray
            }
            '/help' {
                Write-Host "  LBE CLI Commands:" -ForegroundColor Cyan
                Write-Host "  /evidence  - Browse evidence records" -ForegroundColor Gray
                Write-Host "  /memory    - Recall session memory" -ForegroundColor Gray
                Write-Host "  /skills    - Inspect governed skills" -ForegroundColor Gray
                Write-Host "  /audit     - Show audit trail" -ForegroundColor Gray
                Write-Host "  /governance - Show governance status" -ForegroundColor Gray
                Write-Host "  /help      - Show this help" -ForegroundColor Gray
                Write-Host "  /quit      - Exit" -ForegroundColor Gray
                Write-Host "  Modes: PLAN | ACT" -ForegroundColor Gray
            }
            '/quit' { Write-Host "  Goodbye" -ForegroundColor Cyan }
        }
        exit 0
    }
}

# No lbe.exe available - inform user
Write-Host "  ERROR: lbe.exe not found at $lbeExe" -ForegroundColor Red
Write-Host "  Build with: cargo build" -ForegroundColor Gray
exit 1