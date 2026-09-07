# LBE-TUI-Lab Cleanup & Consolidation Plan

**Date**: 2026-09-07  
**Status**: DEFINITIVE - Execute this plan

---

## SINGLE SOURCE OF TRUTH

| Source | Authority |
|--------|-----------|
| `C:\Agents-Memory-Tool-v6-integration` | LBE Backend Runtime (sole authority) |
| `C:\LBE-TUI-Lab` | TUI Client only (receives from LBE) |
| `G:\Datatest\LoopGPTV2\chat_Print\` | Decision history (not current truth) |
| `G:\Developments\GPT-Knowledge` | Reference/routing (not runtime truth) |

**Trust hierarchy**:
```
live runtime > local workspace > GitHub > GPT-Knowledge > chat history
```

---

## PRODUCT IDENTITY (Locked by Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│  LBE CLI/TUI  =  Cline-based LBE product surface            │
│  Rust TUI     =  Reference/integration client (NOT primary) │
│  LBE Runtime  =  C:\Agents-Memory-Tool-v6-integration       │
└─────────────────────────────────────────────────────────────┘
```

**This means**:
- ❌ `cline/` directory copy is NOT the product
- ✅ Cline is embedded as provider/reasoning engine
- ✅ LBE runtime owns governance, evidence, receipts

---

## PHASE 1: Delete Clutter (Safe to Remove)

### 1.1 Debug/Build Artifacts
```text
# DELETE these directories/files completely:
begin/
dist/
build_out.txt
"Chat histroy"/
*.log (debug logs only)

# DELETE these text files:
check*.txt
push*.txt  
test_out*.txt
test_err*.txt
test_result.txt
full_test.txt
lbe_help.txt
mock-open.log
submit-trace.log
cline-direct-20260904.out.log
cline/apps/cli/test_output.txt
```

### 1.2 Runtime State (Add to .gitignore, then delete local)
```text
.lbe/
.agent/
```

---

## PHASE 2: .gitignore (Replace with Comprehensive)

```gitignore
# Rust build
/target/

# Node modules (Cline integration)
/node_modules/
/cline/node_modules/
/cline/apps/cli/node_modules/

# Build outputs
/dist/
/begin/

# Runtime state
/.lbe/
/.agent/

# Logs
*.log

# Debug artifacts
check*.txt
push*.txt
test_*.txt
full_test.txt
lbe_help.txt
mock-*.log
submit-*.log
cline-direct-*.log

# OS
.DS_Store
Thumbs.db
desktop.ini
Desktop.ini

# IDE
.vscode/
.idea/

# Chat history noise
"Chat histroy"/
```

---

## PHASE 3: Cline Directory Decision

### Option A: Keep as Bounded Adapter (If Intentional)
**Requirement**: Must be bounded adapter, not full copy
```
cline/  → Keep ONLY:
  apps/cli/src/runtime/lbe-tool-adapter.ts  ✓
  apps/cli/src/runtime/tool-policies.ts     ✓
  (other Cline files = remove)
```

### Option B: Remove Completely (If Accidental Copy)
```
cline/  → DELETE ENTIRE DIRECTORY
```
Cline should be referenced via npm/Cargo dependency, not copied.

**Decision needed from owner**.

---

## PHASE 4: README Correction

**Current** (Incorrect):
> "Rust/Ratatui is the active interface implementation"

**Correct**:
> "Cline is the user-facing product surface. Rust TUI is reference/integration client."

---

## PHASE 5: Git Repository Fix

### LBE Workspace (C:\Agents-Memory-Tool-v6-integration)
```
Status: Git HEAD corrupted
Action: git fsck && git reset --hard HEAD
```

### LBE-TUI-Lab
```
Status: Heavy untracked clutter
Action: Execute Phase 1-2 deletions, then git clean -fd
```

---

## EXECUTION ORDER

```
1. PHASE 1 → Delete clutter (immediate, no risk)
2. PHASE 2 → Update .gitignore (immediate)
3. PHASE 4 → Fix README (immediate)
4. PHASE 3 → Decide Cline fate (owner decision)
5. PHASE 5 → Git repair (after clutter gone)
6. Commit clean state
```

---

## VALIDATION CHECKLIST

After cleanup, verify:
- [ ] `git status` shows only intentional source files
- [ ] `cargo build` passes
- [ ] `cargo test` passes
- [ ] README matches architectural decisions
- [ ] .gitignore excludes build/log/state artifacts
- [ ] No `unsupported_real_request` stubs in RealLbeWrapper
