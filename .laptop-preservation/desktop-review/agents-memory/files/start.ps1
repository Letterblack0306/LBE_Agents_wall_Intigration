$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
python .\agent.py roots
python .\server.py
