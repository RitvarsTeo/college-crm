// FOLD IT BACK (the owner, 29.10.2026: "you can open the folded one, but cant fold it back"): an empty column that was
// opened on Inbox, Due or Journey carries a Fold button that folds it to its strip again.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');

test('an opened empty column can be folded back', () => {
  assert.match(html, /function cRefold\(board, id\) \{ C_UNFOLD\.delete\(board \+ ':' \+ id\); cFoldRedraw\(board\); \}/);
  assert.match(html, /const cFoldBack = \(board, id, n\) => \(!cPhone\(\) && n === 0 && C_UNFOLD\.has\(board \+ ':' \+ id\)/);
  assert.ok(html.includes("${fold || cFoldBack('due', g.id, g.rows.length)}</h3>"), 'Due');
  assert.ok(html.includes("<b>${c.n}</b>${cFoldBack('inbox', c.id, c.n)}</h3>"), 'Inbox');
  assert.ok(html.includes("${esc(s.label || s.id)}${cFoldBack('journey', s.id, ps.length)}</h3>"), 'Journey');
});
