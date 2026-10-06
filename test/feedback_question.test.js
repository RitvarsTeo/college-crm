// Unified audit 29.09.2026 item 2 (dev kit part 3): feedback has a third kind, A question, and
// "Report a problem" opens the box already on Something broken.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { readKind, saveFeedback, listFeedback, KINDS, BadScreenshot } from '../src/feedback.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('the server takes QUESTION as a kind, and still refuses anything else', async () => {
  assert.deepEqual(KINDS, ['BUG', 'IDEA', 'QUESTION']);
  assert.equal(readKind('question'), 'QUESTION');
  assert.throws(() => readKind('complaint'), BadScreenshot);
  const db = await openDb();
  await saveFeedback(db, { kind: 'QUESTION', body: 'How do I change an owner?', path: '#/help', screenshot: null,
    by: 'Example Person', at: '2026-09-29T09:00:00.000Z' });
  const rows = await listFeedback(db);
  assert.equal(rows[0].kind, 'QUESTION');
});

test('the box offers three kinds, with a question\'s own prompt', () => {
  assert.match(APP, /onclick="fbSetKind\('IDEA'\)">An idea<\/button>\s*<button[^>]*onclick="fbSetKind\('BUG'\)">Something broken<\/button>\s*<button[^>]*onclick="fbSetKind\('QUESTION'\)">A question<\/button>/);
  assert.match(APP, /FB\.kind === 'QUESTION' \? 'What would you like to know\?'/);
});

test('both inboxes name a question as a question', () => {
  assert.match(APP, /const FB_KIND_LABEL = \{ BUG: 'Something broken', IDEA: 'An idea', QUESTION: 'A question' \};/);
  assert.equal((APP.match(/\$\{FB_KIND_LABEL\[r\.kind\] \|\| 'An idea'\}/g) || []).length, 2);
});

test('"Report a problem" opens the box on Something broken, in the Help center (Settings left on 06.10.2026)', () => {
  assert.doesNotMatch(APP, /<b>Report a problem or an idea<\/b>/, 'no second entry: the Help center has the one');
  assert.match(APP, /onclick="fbOpen\('BUG'\)">Report a problem<\/button>/);
  assert.match(APP, /function fbOpen\(kind, text\) \{\s*FB\.open = true; FB\.view = 'form';/);
});
