import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readProjectFile = (path) => readFile(new URL(path, root), "utf8");

test("secret files and browser secret prefixes stay blocked", async () => {
  const [gitignore, accountClient, game, voiceCall] = await Promise.all([
    readProjectFile(".gitignore"),
    readProjectFile("account-client.js"),
    readProjectFile("game.js"),
    readProjectFile("voice-call.js"),
  ]);
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.doesNotMatch(`${accountClient}\n${game}\n${voiceCall}`, /OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_/);
});

test("Supabase hardening separates CRUD policies and private avatar access", async () => {
  const [migration, server, client] = await Promise.all([
    readProjectFile("supabase/migrations/202608240001_security_hardening.sql"),
    readProjectFile("scripts/account_api.py"),
    readProjectFile("account-client.js"),
  ]);
  for (const table of ["profiles", "player_state", "state_mutations", "match_history", "chat_messages"]) {
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
    for (const operation of ["select", "insert", "update", "delete"]) {
      assert.match(migration, new RegExp(`create policy ${table}_own_${operation}`));
    }
  }
  assert.match(migration, /set public = false/);
  assert.match(migration, /\[A-Za-z0-9_-\]\{32\}/);
  assert.match(server, /SIGNED_AVATAR_URL_SECONDS = 60/);
  assert.match(server, /token=user\.token/);
  assert.match(client, /fetch\(url, \{ cache: "no-store", referrerPolicy: "no-referrer" \}\)/);
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("CI continuously enforces tests and conditional security scanners", async () => {
  const workflow = await readProjectFile(".github/workflows/validation.yml");
  assert.match(workflow, /j178\/prek-action@/);
  assert.match(workflow, /npm run test/);
  assert.match(workflow, /python3 -m compileall -q scripts/);
  assert.match(workflow, /gitleaks\/gitleaks-action@/);
  assert.match(workflow, /google\/osv-scanner-action\/osv-scanner-action@/);
  assert.match(workflow, /semgrep scan --config=auto --error/);
  assert.match(workflow, /fetch-depth: 0/);
});
