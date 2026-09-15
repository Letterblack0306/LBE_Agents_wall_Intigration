$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
python -m py_compile .\agent.py .\server.py .\migrate_legacy_state.py
python .\agent.py roots
Write-Host ""
Write-Host "Validation complete. Run .\trace.ps1 next."
