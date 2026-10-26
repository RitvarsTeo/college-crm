// EDIT A CONTACT (26.10.2026): the owner's Client Hub pick 3, layout B "Side drawer". Every name and address here is
// invented.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { openDb } = await import('../src/db.js');
const tc = await import('../src/tc.js');
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AT = '2026-10-26T08:00:00.000Z';

async function seeded() {
  const db = await openDb();
  const co = Number((await db.prepare(`INSERT INTO tc_companies (name, name_key, status, created_at) VALUES (?,?,?,?)`)
    .run('Example Shipping', 'example shipping', 'contacted', AT)).lastInsertRowid);
  const k = Number((await db.prepare(`INSERT INTO tc_company_contacts (company_id, name, email, phone, created_at) VALUES (?,?,?,?,?)`)
    .run(co, 'Anna Example', 'anna@example.com', '+49 40 555 0101', AT)).lastInsertRowid);
  return { db, co, k };
}
const logs = async (db, co) => db.prepare(`SELECT field, old_value, new_value, actor FROM tc_activities WHERE company_id = ? AND field LIKE 'contact_%' ORDER BY id`).all(co);

test('a change is saved, and each changed field is one line in the company history, by the person', async () => {
  const { db, co, k } = await seeded();
  const r = await tc.editContact(db, k, { name: 'Anna Example', position: 'Crewing manager', email: 'ANNA@example.com ', phone: '+49 40 555 0199', notes: '' }, 'Ritvars');
  assert.equal(r.changed, 2, 'position and phone; the same name and the same address (any case) are no change');
  const row = await db.prepare('SELECT name, position, email, phone, notes FROM tc_company_contacts WHERE id = ?').get(k);
  assert.deepEqual({ ...row }, { name: 'Anna Example', position: 'Crewing manager', email: 'anna@example.com', phone: '+49 40 555 0199', notes: null });
  assert.deepEqual((await logs(db, co)).map((l) => [l.field, l.old_value, l.new_value, l.actor]),
    [['contact_position', null, 'Crewing manager', 'Ritvars'], ['contact_phone', '+49 40 555 0101', '+49 40 555 0199', 'Ritvars']]);
});

test('refused: a wrong address, nothing left to reach them by, an archived contact', async () => {
  const { db, k } = await seeded();
  await assert.rejects(tc.editContact(db, k, { email: 'not an address' }, 'Ritvars'), /does not look right/);
  await assert.rejects(tc.editContact(db, k, { name: '', email: '', phone: '' }, 'Ritvars'), /needs a name, an email or a phone/);
  await tc.archiveContact(db, k, 'Ritvars');
  await assert.rejects(tc.editContact(db, k, { name: 'X' }, 'Ritvars'), /no such contact/);
});

test('the page: a contact name opens the drawer with its fields, Save and Archive; the row has no Archive button', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
  assert.match(app, /<button type="button" class="tc-kname" title="Open to edit" onclick="tcContactOpen\(\$\{Number\(k\.id\)\}\)">/);
  assert.doesNotMatch(app, /title="Archive this contact" onclick="tcArchiveContact/, 'Archive moved into the drawer');
  const fn = app.slice(app.indexOf('function tcContactOpen('), app.indexOf('async function tcContactSave('));
  assert.match(fn, /class="tw-drawer tc-kdrawer" role="dialog" aria-modal="true" aria-label="Edit a contact"/);
  for (const [key, label] of [['name', 'Name'], ['position', 'Position'], ['email', 'Email'], ['phone', 'Phone']]) assert.match(fn, new RegExp(`f\\('${key}', '${label}'`));
  assert.match(fn, /<textarea id="tcke_notes"/);
  assert.match(fn, /onclick="tcContactSave\(\$\{Number\(k\.id\)\}\)">Save<\/button><button class="btn ghost" onclick="tcArchiveContact\(\$\{Number\(k\.id\)\}\)">Archive/);
  assert.match(fn, /value="\$\{esc\(k\[key\] \|\| ''\)\}"/, 'every value is escaped');
  assert.match(app, /await post\(`\/api\/tc\/contacts\/\$\{Number\(id\)\}\/edit`, \{ name: v\('name'\), position: v\('position'\), email: v\('email'\), phone: v\('phone'\), notes: v\('notes'\) \}\)/);
  assert.match(app, /e\.key === 'Escape' && document\.querySelector\('\.tc-kdrawer'\)\) tcContactClose\(\)/);
  const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  assert.match(server, /\/\^\\\/api\\\/tc\\\/contacts\\\/\(\\d\+\)\\\/\(edit\|archive\)\$\//);
});
