// One urgency rule across C, and brandbook buttons (28.09.2026, Ritvars: "these colours also are
// not urgent colors", "again, doesnt feel urgent enough", and the Done / Feedback buttons "doesnt
// match overall uiux ... the amber now is quite not in place").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };

test('one urgency rule across C: overdue and late a solid red badge, today a solid amber badge', () => {
  assert.match(APP, /html\.ui-c\{--j-alarm:#b3261e;--j-on-alarm:#ffffff;--j-soon:#F7C04F;--j-on-soon:#011111\}/);
  assert.match(APP, /html\.ui-c \.c-when\.over,html\.ui-c \.c-late,html\.ui-c \.c-now b\.c-late\{background:var\(--j-alarm\);color:var\(--j-on-alarm\)/, 'Next Steps, New Leads "late", Home');
  assert.match(APP, /html\.ui-c \.c-when\.today\{background:var\(--j-soon\);color:var\(--j-on-soon\)/);
  assert.match(APP, /html\.ui-c h3 b\.c-count\.over\{background:var\(--j-alarm\)/, 'the Overdue section count');
  const c = { cTodayIso: () => '2026-09-28', cDay: (s) => s.slice(0, 10), fmtDate: (s) => s.slice(0, 10) };
  vm.runInNewContext(`${line('const cWhenClass =')}\n${line('const cDaysLate =')}\n${line('const cWhenText =')}\nthis.t = cWhenText;`, c);
  assert.equal(c.t('2026-09-25T09:00:00.000Z'), '3 d. overdue', 'says by how much, as the Journey does');
  assert.equal(c.t('2026-09-28T09:00:00.000Z'), 'today');
});

test('buttons in C are the brandbook CTA with no amber stripe; the classic UI keeps its own', () => {
  assert.match(APP, /--btn-bg:#0a2463;--btn-ink:#ffffff;/, 'light: Navy with white');
  assert.match(APP, /--btn-bg:#ffffff;--btn-ink:#0a2463;/, 'dark: white with Navy');
  assert.match(APP, /html\.ui-c \.btn:not\(\.ghost\)\{border-left:0;/);
  assert.match(APP, /html\.ui-c \.helpbtn\{border-left:0;/, 'the Feedback button too');
  assert.match(APP, /^\.btn\{[^}]*border-left:3px solid var\(--amb\)/m, 'classic unchanged');
});
