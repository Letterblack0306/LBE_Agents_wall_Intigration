# Shared evaluation compatibility — proposal, not integration

Reference contract: https://github.com/Letterblack0306/Letterblack_BirdEye/pull/32

The visible Rust/Ratatui product is an LBE client; it must not mint execution authority or forge receipts. The evaluation contract is intended to be portable so public clients are not forced to install a particular private BirdEye service.

Use the existing product acceptance layers (FUNCTIONAL, CANONICAL_PATH, INSTALLED, RUNTIME_EVIDENCE, USER_FLOW, UX, FINAL_FEATURE). Map their directly observed evidence into versioned evaluation records only after inspecting current code and authoritative installed runtime.

Do not promote a UI status, simulated response or passing unit test to a real execution PASS. Require an actual authorized ALLOW with effect and receipt, DENY evidence, failure/recovery, and truthful terminal projection. Missing required checks are UNVERIFIED, not PASS.

A future adapter should consume shared result data without duplicating LBE authorization or changing the canonical Rust terminal design. The repository may not represent the independent public Agents Wall product; do not assume it does.

No runtime changes or acceptance claims are introduced here.
