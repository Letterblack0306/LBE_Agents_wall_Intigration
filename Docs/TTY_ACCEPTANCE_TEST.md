# BLOCKED_INTERACTIVE_CLINE_TTY_ACCEPTANCE

## Test Command

```powershell
cd C:\LBE-TUI-Lab
.\run-cline-lbe.ps1 `
  -AgentWallRoot 'C:\Agents-Memory-Tool-v6-validation' `
  -Workspace 'C:\LBE-TUI-Lab'
```

## Expected Evidence Capture

### 1. LAUNCHER STARTUP - PASS required
- [ ] PowerShell script starts
- [ ] LBE session ID displayed
- [ ] LBE workspace ID displayed
- [ ] Workspace path displayed

```
LBE session: cline-xxxxxxxxxxxx
LBE workspace: workspace-xxxxxxxxxxxxxxxx
Workspace: C:\LBE-TUI-Lab
```

### 2. REAL TERMINAL INPUT - PASS required
- [ ] Cline TUI window opens in terminal
- [ ] Keyboard input works
- [ ] Terminal resize responsive

### 3. LBE VISUAL RENDER - PASS required
- [ ] Dark graphite background (#090b0d)
- [ ] LetterblackLogo ASCII art visible
- [ ] "Lockstep Boundary Engine" tagline visible
- [ ] Status bar shows: workspace, model, mode (PLAN/ACT), git branch

### 4. MODEL/PROVIDER PROJECTION - PASS required
- [ ] Provider name visible in status
- [ ] Model name visible
- [ ] Context usage bar [||||....] visible

### 5. RUNTIME EVENT PROJECTION - PASS required
- [ ] Typing message shows in composer
- [ ] Submit triggers model activity indicator
- [ ] Tool proposals appear in timeline
- [ ] Error states render in red
- [ ] Success states render in green

### 6. CLEAN EXIT - PASS required
- [ ] Ctrl+C exits cleanly
- [ ] Terminal restored to prior state
- [ ] No orphaned processes
- [ ] Session persisted in SQLite

## NOT PROVEN BY THIS TEST

```
parent continuation          UNVERIFIED
deep receipt correlation     UNVERIFIED
full installed E2E           UNVERIFIED
```

## Test Result Template

```
BLOCKED_INTERACTIVE_CLINE_TTY_ACCEPTANCE

launcher startup             [PASS/FAIL]
real terminal input          [PASS/FAIL]
LBE visual render            [PASS/FAIL]
model/provider projection    [PASS/FAIL]
runtime event projection     [PASS/FAIL]
clean exit                   [PASS/FAIL]

parent continuation          UNVERIFIED
deep correlation            UNVERIFIED
full installed E2E           UNVERIFIED
```
