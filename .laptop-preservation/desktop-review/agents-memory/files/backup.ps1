$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$destination = Join-Path $PSScriptRoot "backup\$stamp"
New-Item -ItemType Directory -Path $destination -Force | Out-Null
foreach ($item in @("agent.py","server.py","config.json","config.example.json","governance.json","start.ps1","trace.ps1","state")) {
    if (Test-Path $item) {
        Copy-Item $item -Destination $destination -Recurse -Force
    }
}
Write-Host "Backup created: $destination"
