// Q4, Ritvars 04.10.2026: "No need to show all users!" On a test copy with nobody signed in, the
// "Acting as" picker offers User and Admin, no names. Behind them stand one real non-admin user
// and one real admin, so isAdmin(), Channels and the `by` field keep working. Production (signed
// in) still hides the picker and shows who you are, unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const line = (start) => { const i = APP.indexOf(start); assert.ok(i >= 0, start); return APP.slice(i, APP.indexOf('\n', i) + 1); };

function picker(actor) {
  const sel = { innerHTML: '', value: '' };
  const ctx = { CFG: CONFIG, ACTOR: actor, AUTH: { on: false, user: null },
    esc: (s) => String(s ?? ''), document: { querySelector: (q) => (q === '#actor' ? sel : null) } };
  vm.runInNewContext([line('const cActorUser = '), line('const cActorAdmin = '), line('const cActorSide = '),
    fn('function drawActorPicker('), line('const isAdmin = '),
    'this.draw = drawActorPicker; this.side = cActorSide; this.isAdmin = () => { const a = ACTOR; return isAdmin(); }; this.set = (v) => { ACTOR = v; };'].join('\n'), ctx);
  return { ctx, sel };
}

test('two choices, User and Admin, and not one person named', () => {
  const { ctx, sel } = picker(CONFIG.admins[0]);
  ctx.draw();
  const labels = [...sel.innerHTML.matchAll(/>([^<]+)<\/option>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['User', 'Admin']);
  const names = [...(CONFIG.users || []).map((u) => u.name), ...(CONFIG.admins || [])];
  for (const n of names) assert.ok(!labels.some((l) => l.includes(n)), n + ' is not shown');
  assert.doesNotMatch(sel.innerHTML, /optgroup/, 'no lists of people any more');
});

test('behind User is a real non-admin user, behind Admin a real admin', () => {
  const { ctx, sel } = picker('');
  ctx.draw();
  const [user, admin] = [...sel.innerHTML.matchAll(/value="([^"]*)"/g)].map((m) => m[1]);
  assert.ok((CONFIG.users || []).some((u) => u.name === user) && !CONFIG.admins.includes(user), 'User acts as a configured non-admin');
  assert.ok(CONFIG.admins.includes(admin), 'Admin acts as a configured admin');
  ctx.set(user); assert.equal(ctx.isAdmin(), false, 'User is not an admin');
  ctx.set(admin); assert.equal(ctx.isAdmin(), true, 'Admin is, so Channels still opens');
});

test('a name remembered from the old picker lands on its own side', () => {
  const { ctx } = picker('');
  assert.ok(CONFIG.admins.includes(ctx.side(CONFIG.admins[CONFIG.admins.length - 1])), 'any admin -> Admin');
  assert.ok(!CONFIG.admins.includes(ctx.side('Laura')), 'any user -> User');
  assert.match(APP, /ACTOR = cActorSide\(ACTOR\);   \/\/ only two choices on a test copy; sign-in below overrides it\n[\s\S]{0,400}if \(AUTH\.user\) ACTOR = AUTH\.user\.name;/,
    'and a real sign-in still wins');
});

test('signed in, the picker stays hidden and who you are is shown, as before', () => {
  assert.match(APP, /if \(AUTH\.on && AUTH\.user\) \{\s*if \(picker\) picker\.style\.display = 'none';\s*if \(who\) \{\s*who\.style\.display = '';/);
});
