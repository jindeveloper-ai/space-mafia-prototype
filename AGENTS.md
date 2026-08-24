# MARS.NET rules

## Work

- Search first. Unknown code: Serena overview → symbol → reference search → needed bodies; verify
  with `rg`. Read whole files only if short or full config/translation/security/
  cross-feature context is needed. On one LSP failure, record it and use `rg`.
- Preserve user/incomplete changes; never reset/overwrite unrelated work. Make the
  smallest coherent/readable/safe change. Reuse code, browser features, stdlib, and
  installed dependencies before new abstractions/dependencies; optimize safety,
  not line count.
- Tokens never weaken accuracy, requirements, maintainability, tests, security/
  privacy, accessibility, or error handling. Protect secrets, keys, personal data.
- Figma only for actual UI/UX. No routine Repomix; only repo-wide structure/deps/
  tokens/major refactor/handoff, with pinned `npx --yes repomix@1.18.0` output in `/tmp`.

## Task boundaries

- One task = one independent outcome; split UI, voice, game adjudication, account/
  security, generative media, and deployment when possible. Start new after release
  or a feature-goal change; keep one for the same bug or essential context.
- No prior transcript. Handoff only: 1. goal; 2. version/branch; 3. incomplete changes;
  4. 3–6 files; 5. symptom/requirement; 6. done criteria; 7. validation; 8. next action.

## Models

- Begin with `권장 모델: Terra` or `권장 모델: Sol` on one line.
- Terra: local UI/CSS; copy/translation/docs; clear-cause normal bug; small patterned
  feature; tests; non-security refactor.
- Sol: WebRTC/Realtime/audio lifecycle; auth/account/API key/server proxy; data
  migration; vote/win-loss/inference adjudication; cross-feature state conflict;
  architecture/large refactor; deployment/security incident; or two recurrences
  after Terra found and fixed the cause.
- Rules cannot auto-switch models; the user selects, usually in a new task. If Terra
  meets Sol criteria, report evidence + escalation reason in one line. Sol does not
  widen scope.

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
