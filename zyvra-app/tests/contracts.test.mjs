import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(join(root.pathname, path), "utf8");
test("database migration is additive and does not touch other apps", () => {
  const schema = read("db/001_initial.sql");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS zyvra_users/);
  assert.match(schema, /zyvra_conversation_members/);
  assert.match(schema, /FOREIGN KEY \(conversation_id, sender_id\)/);
  assert.doesNotMatch(schema, /\bDROP\s+(?:TABLE|DATABASE)\b/i);
  assert.doesNotMatch(schema, /\bTRUNCATE\b/i);
});
test("session cookie is httpOnly and hashed at rest", () => {
  const source = read("src/lib/auth.ts");
  assert.match(source, /httpOnly:\s*true/);
  assert.match(source, /sameSite:\s*"lax"/);
  assert.match(source, /digest\(token\)/);
});
test("messages are checked for membership", () => {
  const source = read("src/app/api/conversations/[id]/messages/route.ts");
  assert.match(source, /authorizedConversation\(id, user.id\)/);
  assert.match(source, /zyvra_conversation_members/);
});
test("requests use parameterized SQL", () => {
  for (const path of ["src/app/api/posts/route.ts", "src/app/api/conversations/route.ts"]) {
    const source = read(path);
    assert.match(source, /\$1/);
  }
});
