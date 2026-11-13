// SAVE SPACE FOR GUESTS (13.11.2026, his words: "make them sort of push out as the list opens, like done on academy part of intake
// about the lead information ... plus add the positions for people as to best precision you know about them!"). Invented people.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { openDb } = await import('../src/db.js');
const go = await import('../src/tcgo.js');

test('the position: the Stage 2 row own, else the Intake contact (by Client Hub id, then by email); nothing invented', async () => {
  const db = await openDb();
  const at = new Date().toISOString();
  const co = Number((await db.prepare('INSERT INTO tc_companies (name, name_key, status, created_at) VALUES (?,?,?,?)').run('Rows Example AS', 'rows example as', 'not_contacted', at)).lastInsertRowid);
  const s2 = (ch, name, email, position) => db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, position, email, gone, loaded_at) VALUES (?,?,?,?,?,?,0,?)`)
    .run(ch, 'JS', name, 'Rows Example AS', position, email, at);
  const k = (ch, email, position) => db.prepare('INSERT INTO tc_company_contacts (company_id, name, email, ch_contact_id, position, created_at) VALUES (?,?,?,?,?,?)').run(co, 'x', email, ch, position, at);
  await s2('R1', 'Own Example', 'own@example.com', 'Fleet Manager'); await k('R1', 'own@example.com', 'Something else');
  await s2('R2', 'Byid Example', 'byid@example.com', ''); await k('R2', 'byid@example.com', 'Crew Manager');
  await s2('R3', 'Bymail Example', 'bymail@example.com', null); await k(null, 'bymail@example.com', 'HR Director');
  await s2('R4', 'None Example', 'none@example.com', '');
  const rows = Object.fromEntries((await go.stage2List(db, 'JS')).map((r) => [r.name, r.position]));
  assert.deepEqual(rows, { 'Own Example': 'Fleet Manager', 'Byid Example': 'Crew Manager', 'Bymail Example': 'HR Director', 'None Example': '' });
});

test('his words 13.11 "The whole list expands horizontally! pushes out nearby list": a click widens the company tile across the grid with its people in wide rows; one open at a time; the answer only when there is one', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.ok(app.includes('onclick="tcS2Toggle(${k})"') && !app.includes('tcS2Open(') && !app.includes('tcS2PToggle') && !app.includes('No answer yet'));
  assert.ok(app.includes('html.ui-c .tcs2-tile.open{grid-column:1 / -1;') && app.includes('grid-auto-flow:row dense'));
  const i = app.indexOf('function tcS2People('), fn = app.slice(i, app.indexOf('\n}\n', i) + 2);
  const run = (ps) => new Function('esc', fn + '; return tcS2People;')((s) => String(s))({ ps });
  const html = run([{ name: 'Anna Example', position: 'Crew Manager', email: 'a@example.com', country: 'Norway', answer: null, marked: null },
    { name: 'Ben Example', position: '', email: '', country: '', answer: 'yes', people: 2, marked: null }]);
  assert.match(html, /<b>Anna Example<\/b><span class="tcs2-pos">Crew Manager<\/span>/);
  assert.ok(html.includes('mailto:a@example.com') && html.includes('>Norway<'));
  assert.equal((html.match(/class="a-/g) || []).length, 1, 'the answer only where there is one');
  assert.ok(html.includes('<i class="a-yes">Yes · 2</i>') && !/not recorded|none yet|>-</.test(html));
  const t = app.indexOf('function tcS2Toggle('), tg = app.slice(t, app.indexOf('\n}\n', t) + 2);
  assert.ok(tg.includes('T_S2.open = T_S2.open === key ? null : key;'), 'one open at a time; a second click folds it');
});
