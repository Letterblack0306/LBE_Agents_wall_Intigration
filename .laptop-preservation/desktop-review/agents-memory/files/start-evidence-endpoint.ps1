param(
    [string]$Config = ".\config.json",
    [int]$Port = 8766
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
python -m lbe_guard_inspector.server --config $Config --port $Port
