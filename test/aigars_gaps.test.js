// The remaining Aigars gaps, 29.09.2026: the Journey card previews the newest comment somebody
// wrote (the whole thread is the person page's History); the month chart is drawn for a phone on a
// phone so its labels are readable; explaining sentences are gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i)); };
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

test('the card comment: the newest one written on the person page, else the imported note', () => {
  const ctx = {};
  vm.runInNewContext(`${line('const cNotePreview =')}\n${line('const cComment =')}\nthis.c = cComment;`, ctx);
  assert.equal(ctx.c({ last_comment: 'Called, wants the price', notes: 'Sheet status: HOT | old note' }), 'Called, wants the price');
  assert.equal(ctx.c({ last_comment: null, notes: 'Sheet status: HOT | old note' }), 'old note');
  assert.equal(ctx.c({ last_comment: '  ', notes: '' }), '');
  assert.ok(APP.includes('${cComment(p) ? `<small class="c-jnote" title="${esc(p.last_comment || p.notes)}">${esc(cComment(p))}</small>` : \'\'}'));
});

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'src', 'server.js')], {
      env: { ...process.env, PORT: '0', CRM_DB: ':memory:', DATASET: 'demo' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.on('data', (d) => { const m = String(d).match(/http:\/\/localhost:(\d+)/); if (m) resolve({ child, port: Number(m[1]) }); });
    child.on('exit', (code) => reject(new Error(`server exited (${code}): ${err}`)));
    setTimeout(() => reject(new Error('server did not start: ' + err)), 8000);
  });
}

test('the list carries the newest comment: a note written on the person page shows up, newest first', async (t) => {
  const { child, port } = await startServer();
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  const h = { 'content-type': 'application/json', 'x-acting-as': 'Ieva' };
  const first = (await (await fetch(`${base}/api/people`)).json()).rows[0];
  for (const body of ['first comment', 'second comment']) {
    const r = await fetch(`${base}/api/people/${first.id}/note`, { method: 'POST', headers: h, body: JSON.stringify({ kind: 'note', noteType: 'other', subject: 'Note', body }) });
    assert.equal(r.status, 200);
    await new Promise((z) => setTimeout(z, 15));
  }
  const again = (await (await fetch(`${base}/api/people`)).json()).rows.find((r) => r.id === first.id);
  assert.equal(again.last_comment, 'second comment');
});

test('phone: the month chart is drawn 360 wide with larger labels; desktop keeps 640', () => {
  const src = fn('function cMonthChart(');
  const months = [{ month: '2026-08', admitted: 3, newLeads: 9 }, { month: '2026-09', admitted: 5, newLeads: 12 }];
  const draw = (narrow) => {
    const ctx = { m: months, C_MONTHS: MONTHS, window: { matchMedia: () => ({ matches: narrow }) } };
    vm.runInNewContext(src + '\nthis.out = cMonthChart(m, 2026);', ctx);
    return ctx.out;
  };
  assert.match(draw(true), /<svg viewBox="0 0 360 230" class="kchart narrow"/);
  assert.match(draw(false), /<svg viewBox="0 0 640 210" class="kchart"/);
  assert.match(APP, /html\.ui-c \.kchart\.narrow \.kt\{font-size:12\.5px\}/);
});

test('explaining sentences removed; data warnings kept', () => {
  for (const s of ['Months still to come are not drawn.', 'Remembered on this device.', 'How each screen works, and answers to common questions.',
    'Reaches the people who build the CRM. You can add a screenshot.', 'What our side has built, and whether each provider is connected.',
    'The on-screen report behind the management download.', 'still a working version, to be agreed with Admissions',
    'It stays on this machine and is never emailed.', 'Everything everybody has sent.', 'Every figure is a count of rows in the CRM',
    "It is kept in the CRM's own database and is never sent anywhere."]) assert.ok(!APP.includes(s), s);
  assert.match(APP, /a programme that is not one of the list/, 'the data-to-tidy count stays');
  assert.match(APP, /To fix/, 'the report still says what data is missing');
});
