# LBE — Lockstep Boundary Engine

## What Is LBE?

**LBE is an agent terminal that owns what it does.**

Not what it says it will do. Not what the AI model thought. What it actually did, why, and whether it was allowed.

---

## The Problem LBE Solves

AI agents are powerful but unaccountable. They:
- Propose actions without checking if they're allowed
- Execute mutations without proof
- Lose track of what they did across sessions
- Create duplicate authority and conflicting state

**LBE fixes this by owning the boundary between "the agent wants to" and "the system did".**

---

## Product Definition

```
┌─────────────────────────────────────────────────────────────────┐
│                         LBE CLI                                  │
│                    user-facing product                            │
│                                                                  │
│    Cline  ──►  embedded provider/reasoning engine              │
│                                                                  │
│    LBE    ──►  sole authority                                   │
│                session / governance / evidence / completion       │
└─────────────────────────────────────────────────────────────────┘
```

### What Each Part Does

| Component | Role | Owned By |
|-----------|------|----------|
| **LBE CLI** | User interface | Product surface |
| **Cline** | AI reasoning, model, provider | Embedded |
| **LBE Runtime** | Rules, receipts, proof | Authority |

---

## Core Principle

> **The agent owns cognition. LBE owns capabilities and consequences.**

---

## What LBE Provides

### 1. Authorization
Every action is checked against policy before execution.

### 2. Receipts
Every action produces a proof record of what happened.

### 3. Evidence
Complete audit trail tied to operations, not just conversation.

### 4. Persistence
Sessions survive restarts. Work continues where it left off.

### 5. Governance
Mutation requires approval. Read operations are fast.

---

## User Experience

A user opens **LBE CLI** and:
1. Works naturally with an AI agent
2. Sees one truthful timeline of what happened
3. Knows when LBE approved or blocked something
4. Can inspect receipts when needed
5. Resumes work after restart without losing context

**No:**
- Duplicate authority panels
- Fake status indicators
- Cline branding in the product
- Unproven claims

---

## What LBE Is NOT

- ❌ A chatbot wrapper
- ❌ A re-skinned AI assistant
- ❌ Multiple competing authority sources
- ❌ A debugging dashboard
- ❌ A magic AI that "just works"

---

## Authority Flow

```
USER → AGENT (reasons) → LBE (checks) → EXECUTION (does) → RECEIPT (proves)
```

---

## Summary

| Question | Answer |
|----------|--------|
| What is LBE? | An accountable AI agent terminal |
| What does it own? | Capabilities and consequences |
| What does the agent own? | Reasoning and proposals |
| What does the user get? | Proof of what was done |
| Where is authority? | LBE runtime |

---

## Brand

```
LBE
Lockstep Boundary Engine
LETTERBLACK
```

Compact identity only. No large logos in the active shell.

---

*This document defines what LBE is. Implementation details live in workspace documentation.*
