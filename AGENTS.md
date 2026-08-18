

<!-- BEGIN CODEX PROJECT VALIDATION -->
## Project validation

- The canonical project profile is `codex-validation.json` at the repository root. Do not write generated state under the reserved `.codex` directory.
- Use `scripts/validate quick` after meaningful code changes.
- Use `scripts/validate security` when dependency, secret-sensitive, or security-sensitive code changes.
- Use `scripts/validate full` before declaring a new project complete or preparing a release.
- Fix and rerun failed required checks. Do not delete, skip, weaken, or broadly suppress checks to force a pass.
- Report only checks that actually ran; clearly identify unavailable or unverified checks.
<!-- END CODEX PROJECT VALIDATION -->
