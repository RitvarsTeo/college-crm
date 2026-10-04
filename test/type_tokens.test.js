// TYPE 3, STRONG HIERARCHY (the owner's pick, A/B batch step 2a, 04.10.2026): app-wide tokens.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

test('the four steps are tokens, declared once', () => {
  assert.match(APP, /html\.ui-c\{--type-title:30px;--type-figure:30px;--type-name:17px;--type-detail:13px;--type-label:11\.5px;--type-chip:13\.5px;--ink-strong:var\(--ink\)\}/);
  assert.match(APP, /html\.ui-c:not\(\[data-theme="dark"\]\)\{--ink-strong:#0a2463\}/, 'navy ink in light; dark keeps its own');
});
test('each kind of text takes its token', () => {
  assert.match(APP, /html\.ui-c #view h1, html\.ui-c #view \.c-head h1\{font-size:var\(--type-title\);font-weight:750;color:var\(--ink-strong\)/);
  assert.match(APP, /\.c-todaystrip b, html\.ui-c #view \.c-planned b, html\.ui-c #view \.kstrip > div:not\(\.khero\) > b\{font-size:var\(--type-figure\);font-weight:750;color:var\(--ink-strong\)\}/);
  assert.match(APP, /html\.ui-c #view \.c-todaystrip b\.c-od\{color:var\(--c-bad\)\}/, 'red stays red where it means overdue');
  assert.match(APP, /html\.ui-c #view \.c-who b, html\.ui-c #view \.c-jp > b, html\.ui-c #view \.c-card h2\{font-size:var\(--type-name\);font-weight:700;color:var\(--ink-strong\)\}/);
  assert.match(APP, /\{font-size:var\(--type-detail\)\}/);
  assert.match(APP, /\{font-size:var\(--type-label\);font-weight:600\}/);
  assert.match(APP, /html\.ui-c #view \.c-when, html\.ui-c #view \.c-jp small\.c-jdue\{font-size:var\(--type-chip\)\}/);
});
