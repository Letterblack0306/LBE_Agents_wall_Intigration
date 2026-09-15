# Migration and rollback

Keep the existing `backup-2026-07-23` directory unchanged.

Use this ZIP in a new folder. Copy the three legacy state files into the new `state` folder and run:

```powershell
python .\migrate_legacy_state.py
python .\agent.py trace --resume
```

Rollback is simple: stop v6 and return to the untouched v5 folder. Do not delete the legacy backup until v6 finishes a trace and passes search tests.
