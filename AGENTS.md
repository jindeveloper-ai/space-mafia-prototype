<!-- BEGIN CODEX PROJECT VALIDATION -->
## Project validation

- `.pre-commit-config.yaml` is the canonical fast-check configuration.
  Use `prek`; do not install or invoke `pre-commit`.
- After meaningful executable changes, run `prek run --files <changed files>`
  and the related project-native tests before reporting completion.
- Native test: `npm run test`
- Native build: `python3 -m compileall -q scripts`
- Run Gitleaks before commits and releases, OSV-Scanner when dependency inputs change,
  and Semgrep for security-sensitive source changes.
- Fix and rerun failures without weakening checks.
  Do not modify unrelated pre-existing changes merely to make validation pass.
- Do not write generated validation state under the reserved project `.codex` directory
  or accumulate project validation reports.
<!-- END CODEX PROJECT VALIDATION -->

<!-- BEGIN CODEX TOKEN-EFFICIENT DEVELOPMENT -->
## Token-efficient code exploration

- For unfamiliar code, use Serena in this order: symbol overview, symbol search,
  reference search, then only the required symbol bodies. Use `rg` and narrow
  line reads only when Serena is insufficient.
- If Serena's language server fails, record the cause once and switch to `rg`;
  do not repeat identical retries. Read whole files only when they are short or
  full configuration, translation, security, or cross-feature context is required.
- Use Repomix only for repository-wide structure, dependency, token-distribution,
  major-refactor, or handoff analysis. Do not use it for routine fixes.
- Run Repomix on demand with the pinned command
  `npx --yes repomix@1.18.0 --config repomix.config.json --token-budget 120000`.
  Its compressed output is overwritten under `/tmp`, never stored in the project.
- Search before reading, do not reread unchanged files without a reason, and run
  focused tests before broader validation. Report only failures and key totals;
  never skip tests or security checks to save tokens.
- Keep reports in outcome, cause, change, validation order. Prefer small module
  extractions that preserve one-way dependencies and a single owner for state.
<!-- END CODEX TOKEN-EFFICIENT DEVELOPMENT -->
