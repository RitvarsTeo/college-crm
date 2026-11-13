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

test('the panel: one line a person (name + position), a click opens the person in place in the Academy card look and pushes the rest down', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.ok(app.includes('<div class="tcs2-ppl">${g.ps.map((r, i) => tcS2Person(g, r, i, word)).join(\'\')}</div>'));
  assert.ok(app.includes('<div class="c-card tcs2-pcard"><dl>') && app.includes('onclick="tcS2PToggle(${k}, ${Number(i)})"'));
  assert.ok(app.includes('html.ui-c .tcs2-pline{min-width:0;white-space:nowrap'));
  const i = app.indexOf('function tcS2Person('), fn = app.slice(i, app.indexOf('\n}\n', i) + 2);
  const run = (open) => new Function('esc', `let T_S2P = ${JSON.stringify(open)};` + fn + '; return tcS2Person;')((s) => String(s))(
    { key: 'id:1', name: 'Rows Example AS' }, { name: 'Anna Example', position: 'Crew Manager', email: 'a@example.com', company: 'Rows Example AS', answer: null, marked: null }, 0, { yes: 'Yes' });
  const shut = run(null), open = run('id:1#0');
  assert.match(shut, /<b>Anna Example<\/b><small>Crew Manager<\/small>/);
  assert.ok(!shut.includes('c-card') && open.includes('c-card tcs2-pcard') && open.includes('mailto:a@example.com') && open.includes('aria-expanded="true"'));
});
