$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
python .\agent.py roots
Write-Host ""
Write-Host "Starting SQLite trace. Ctrl+C stops safely."
python .\agent.py trace --resume
