$ErrorActionPreference = "Stop"

Write-Host "Compiling runtime files..."
python -m py_compile .\agent.py
python -m py_compile .\server.py
python -m py_compile .\audit_controller.py
python -m py_compile .\migrate_legacy_state.py

Write-Host "Checking controller CLI..."
python .\audit_controller.py --help
python .\audit_controller.py packs

Write-Host "Compilation and CLI checks passed."
Write-Host "Existing rules\generic.py and rules\cep.py must remain in the project."
