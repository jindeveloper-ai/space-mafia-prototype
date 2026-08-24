# MARS.NET security runbook

## Secret handling

- `.env` and `.env.*` must remain ignored. Never force-add them.
- Never place an OpenAI secret, Supabase secret/service-role key, OAuth client secret, or database password in browser code, `NEXT_PUBLIC_*`, `VITE_*`, `REACT_APP_*`, Git, logs, screenshots, tickets, Notion, or an AI chat.
- A Supabase publishable key is intentionally public and is the only project key allowed in browser configuration. `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` stay in the server secret store.
- Treat suspected exposure as compromise: revoke or rotate the key immediately, update the server secret store, redeploy, then inspect usage and logs. Deleting or masking the leaked text is not remediation.
- Use separate development, staging, and production projects. Grant the smallest endpoint and project permissions available. Review unused roles and keys regularly; rotate long-lived server keys at least every 90 days. Browser Realtime client secrets expire after 300 seconds and avatar signed URLs after 60 seconds.

## Repository checks

Run both checks before a commit or release. `--redact` prevents findings from printing secret values.

```bash
gitleaks dir --redact --no-banner .
gitleaks git --redact --no-banner --log-opts=--all .
```

If either command reports a finding, do not commit or deploy. Rotate the credential first, remove it from the current tree and Git history, and rerun both checks.

## Continuous enforcement

- The installed Git `pre-commit` hook runs the canonical `prek` checks before every commit, including private-key detection and syntax validation.
- `.github/workflows/validation.yml` runs `prek`, the complete native test/build suite, Gitleaks on the full checkout, OSV-Scanner when dependency inputs change, and Semgrep when security-sensitive code changes.
- `test/security.test.js` fails if the `.env` ignore rules, frontend secret boundary, explicit RLS policies, private avatar controls, or CI security gates are removed.
- Never bypass a failed hook or workflow. Fix the cause and rerun the same check.

## Supabase data and storage

- Apply all migrations in filename order. The hardening migration revokes `anon` table grants, grants authenticated CRUD explicitly, and creates separate owner-only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies.
- Keep the `avatars` bucket private. New objects use a user UUID folder plus a random 32-character filename. Downloads use a 60-second signed URL; deleting the object is the immediate revocation mechanism.
- The service-role key is used only by the server for account deletion. Ordinary database requests, avatar uploads, and URL signing use the authenticated user's JWT so RLS is enforced.

## Unauthenticated storage verification

After deployment, upload an avatar, copy only its unsigned object path from the authenticated account response, and open this URL in a private/incognito window:

```text
https://<project>.supabase.co/storage/v1/object/authenticated/avatars/<object-path>
```

The request must fail without an `Authorization` header. Also verify that a generated signed URL works briefly and fails after its 60-second validity and cache window. Never paste a signed URL into chat or documentation because it is a temporary bearer credential.
