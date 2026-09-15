# Release Authority

Package:
@letterblack/lbe-core

Private source/build authority:
Letterblack0306/LetterBlack-LBE-Core

Public mirror / consumer-facing repo:
Letterblack0306/LetterBlack-Sentinel

Rules:
1. Only LetterBlack-LBE-Core may publish @letterblack/lbe-core to npm.
2. Only LetterBlack-LBE-Core may create official package GitHub Releases.
3. LetterBlack-Sentinel is public-facing and may validate package contents only.
4. LetterBlack-Sentinel must not contain workflows that publish npm, create releases, upload release artifacts, or create tags.
5. Agents must not infer release authority from repository visibility.
6. Agents must read this file before changing package.json, release.yml, tags, npm scripts, or release docs.
