import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(js, 'Inline application JavaScript must be present');
new Function(js); // Syntax verification only; does not execute in a browser.
for (const token of ['function render()', 'function publish()', 'function sendChat(', 'function addStory(', 'function toggleLike(', 'function bookmark(', 'function addComment(', 'function profileHTML(', 'localStorage']) {
  assert.ok(js.includes(token), 'Missing expected interaction: ' + token);
}
assert.ok(html.includes('NOT sent to other people'), 'Local-only chat disclosure must remain visible');
console.log('✓ ZYVRA browser preview source validated.');
console.log('Note: this is a syntax/structure test, not browser or production integration testing.');
