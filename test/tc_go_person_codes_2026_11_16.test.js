// PERSONAL CODES FOR EVERYONE ON A LIST (patch 146 reshaped, 16.11.2026; his pick "Yes, build it (Rec.)"). One rule: everyone on a
// Grand Opening list with an email gets a 6-character code; a code already there never changes; no email = no code; without the
// code store nothing is issued. The store is an in-memory stand-in for intake_go.person_code_issue. Invented people only.
import test from 'node:test';
import assert from 'node:assert/strict';
const { openDb } = await import('../src/db.js');
const codes = await import('../src/tccodes.js');

const at = new Date().toISOString();
function store() {
  const byContact = new Map(); let n = 0;
  return { byContact, calls: [], async issue(db, contactId, name, company) {
    this.calls.push([contactId, name, company]);
    if (!byContact.has(contactId)) byContact.set(contactId, ('zz' + String(++n).padStart(4, '0')).slice(-6));
    return byContact.get(contactId);
  } };
}
async function seed(db) {
  const row = (ch, name, email, code = null, gone = 0) => db.prepare(`INSERT INTO tc_go_stage2 (ch_contact_id, sender, name, company, email, link_code, gone, loaded_at, loaded_by)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(ch, 'JS', name, 'Example Company', email, code, gone, at, 'test');
  await row('C1', 'Anna Example', 'anna@example.com', 'abc123');            // has a code already
  await row('intake:5', 'Ben Example', 'ben@example.com');                  // added in Intake, no code
  await row('C900769', 'Asta Example', 'asta@example.com', '');             // empty code
  await row('intake:6', 'Nils Example', null);                              // no email: postcard only, no code
  await row('C7', 'Gone Example', 'gone@example.com', null, 1);             // off the list
}
const codeOf = async (db, ch) => (await db.prepare('SELECT link_code FROM tc_go_stage2 WHERE ch_contact_id = ?').get(ch)).link_code;

test('everyone on a list with an email and no code gets one; an existing code never changes; no email or gone = none', async (t) => {
  const st = store(); codes.setStore(st); t.after(() => codes.setStore(null));
  const db = await openDb(); await seed(db);
  const r = await codes.ensureCodes(db);
  assert.deepEqual(r, { missing: 2, issued: 2, failed: 0, reachable: true });
  assert.equal(await codeOf(db, 'C1'), 'abc123', 'unchanged');
  assert.match(await codeOf(db, 'intake:5'), /^[a-z0-9]{6}$/);
  assert.match(await codeOf(db, 'C900769'), /^[a-z0-9]{6}$/);
  assert.equal(await codeOf(db, 'intake:6'), null, 'no email, no code');
  assert.equal(await codeOf(db, 'C7'), null, 'not on a list');
  assert.deepEqual(st.calls.map((c) => c[0]).sort(), ['C900769', 'intake:5'], 'asked by the contact id, nothing else');
  assert.deepEqual(await codes.ensureCodes(db), { missing: 0, issued: 0, failed: 0, reachable: true }, 'run twice = nothing new');
});

test('a bad answer from the store is not written; without a store nothing is issued', async (t) => {
  codes.setStore({ async issue() { return 'NOT A CODE'; } }); t.after(() => codes.setStore(null));
  const db = await openDb(); await seed(db);
  assert.deepEqual(await codes.ensureCodes(db), { missing: 2, issued: 0, failed: 2, reachable: true });
  assert.equal(await codeOf(db, 'intake:5'), null);
  codes.setStore(null);
  assert.deepEqual(await codes.ensureCodes(db), { missing: 2, issued: 0, failed: 0, reachable: false });
});

test('the email link: card and code together when the company has a card, the code alone otherwise', () => {
  assert.equal(codes.personLink('abc123', 'k7m2q9'), 'https://novikontas.org/grand-opening?k=k7m2q9&c=abc123');
  assert.equal(codes.personLink('abc123', ''), 'https://novikontas.org/grand-opening?c=abc123');
  assert.equal(codes.personLink('abc123', 'not a card'), 'https://novikontas.org/grand-opening?c=abc123');
});

test('the Stage 2 email carries the card with the code when the company has a card; the code alone otherwise', async () => {
  const { s2Mail } = await import('../src/tcs2mail.js');
  const withCard = s2Mail('invite', 'Anna', 'abc123', { card: 'k7m2q9' });
  assert.ok(withCard.html.includes('https://novikontas.org/grand-opening?k=k7m2q9&amp;c=abc123') || withCard.html.includes('https://novikontas.org/grand-opening?k=k7m2q9&c=abc123'));
  const noCard = s2Mail('invite', 'Anna', 'abc123', {});
  assert.ok(noCard.html.includes('https://novikontas.org/grand-opening?c=abc123') && !noCard.html.includes('?k='));
  assert.ok(!s2Mail('invite', 'Anna', 'abc123', { card: '"><script>' }).html.includes('<script>'), 'a bad card is ignored');
});
