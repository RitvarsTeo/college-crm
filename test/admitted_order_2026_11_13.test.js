// THE ADMITTED IN DATE ORDER (13.11.2026, the admissions team: "which students were matriculated, in order"): the Journey's
// Admitted run by admission date, newest first (or oldest first), the ones with no date after them. Synthetic only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i) + 1); };

test('Admitted newest first, undated last; Oldest first turns it round; the List offers the order', () => {
  const ctx = { cTodayIso: () => '2026-11-13', cDay: (iso) => String(iso).slice(0, 10) };
  vm.runInNewContext([line('const C_SIS_HOLDS = '), line('const cSisHolds = '), line('const cWhenClass = '), line('const cDaysLate = '), fn('function cJUrgency('), fn('function cJSort(')].join('\n') + '\nthis.sort = cJSort;', ctx);
  const A = (id, d) => ({ id, status: 'Admitted', admitted_at: d });
  const ps = [A('jan', '2026-01-10'), A('none', null), A('sep', '2026-09-05'), A('mar', '2026-03-02')];
  assert.deepEqual(Array.from(ctx.sort(ps, new Map())).map((p) => p.id), ['sep', 'mar', 'jan', 'none']);
  assert.deepEqual(Array.from(ctx.sort(ps, new Map(), 'old')).map((p) => p.id), ['jan', 'mar', 'sep', 'none']);
  assert.match(fn('function cDrawJourneyPool() {'), /isAdm \? `<label class="c-jf on"><span>Order<\/span>/);
});
