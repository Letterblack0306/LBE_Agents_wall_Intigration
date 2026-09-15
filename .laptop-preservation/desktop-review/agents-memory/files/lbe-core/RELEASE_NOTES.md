Canonical release workflow:
LetterBlack-LBE-Core/.github/workflows/release.yml

Public mirror:
LetterBlack-Sentinel must NOT have an active release workflow.

Required action:
1. Remove LetterBlack-Sentinel/.github/workflows/release.yml
   OR move it outside .github/workflows/, for example:
   docs/disabled-workflows/release.yml.reference

2. Do not remove LetterBlack-LBE-Core/.github/workflows/release.yml.

3. Verify only one active release YAML exists across both repos:
   - LetterBlack-LBE-Core/.github/workflows/release.yml
   - no LetterBlack-Sentinel/.github/workflows/release.yml

4. Verify Sentinel has no active workflow containing:
   - npm publish
   - NPM_TOKEN
   - gh release create
   - gh release upload
   - on push tags v*.*.*

5. Add note to Sentinel README:
   "This repository is the public release mirror. Release/build authority lives in LetterBlack-LBE-Core."
