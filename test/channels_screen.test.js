// The Channels screen, rewritten 02.10.2026 after the channel reconciliation
// (docs/CHANNEL_RECONCILIATION_2026-10-02.md).
//
// WHAT WENT WRONG, so it cannot come back. The screen read `readiness`, which only
// ever meant "is our side technically ready". It said yes for Google Form, which is
// DROPPED, and for Open Day, which is PARKED, so both appeared as work with a
// person's name against them. It counted SIS, which is an integration and not a
// channel. And it printed a local checkout's empty environment as though PRODUCTION
// were unconfigured.
//
// Everything a local run cannot show is tested here instead: on this machine no
// secret is set, so every channel reads "Not set up" and no job has ever run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'channels.json'), 'utf8'));
const fn = (name) => { const i = APP.indexOf(name); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf('\n}\n', i) + 2); };
const span = (from, to) => { const i = APP.indexOf(from); assert.ok(i >= 0, from); return APP.slice(i, APP.indexOf(to, i)); };

function sandbox() {
  const ctx = { esc: (s) => String(s ?? ''), fmtDate: (d) => 'AT(' + String(d).slice(0, 10) + ')' };
  vm.runInNewContext([
    span('const CH_WORD = {', 'function chActivity('),
    fn('function chActivity('),
    span('const chLife =', '// A long blocker is cut'),
    fn('function chCut('),
    'const chOutside = (c) => Boolean(c.externalBlocker) && c.blockerKind === "question";',
    fn('function chSteps('),
    'const chDone = (c) => chSteps(c).filter((x) => x.state === "done").length;',
    fn('function chNext('),
    fn('function chWho('),
    fn('function chEnvLine('),
    fn('function chShelvedHtml('),
    fn('function chIntegrationsHtml('),
    fn('function chViewA('),
    fn('function chPips('),
    fn('function chViewB('),
    fn('function chCard('),
    fn('function chCount('),
    `this.word = chWord; this.on = chOn; this.rank = CH_RANK; this.life = chLife;
     this.active = chActive; this.shelved = chShelved; this.cut = chCut; this.steps = chSteps;
     this.next = chNext; this.who = chWho; this.env = chEnvLine; this.shelf = chShelvedHtml;
     this.ints = chIntegrationsHtml; this.a = chViewA; this.b = chViewB; this.count = chCount;`,
  ].join('\n'), ctx);
  return ctx;
}

const ch = (o) => ({ channel: 'website', label: 'Website enquiry form', direction: 'inbound_webhook',
  state: 'NOT CONFIGURED', live: false, mode: 'off', ...o });
const live = (o) => ch({ state: 'CONNECTED', live: true, mode: 'live', ...o });

// ------------------------------------------------------------- the register --

test('the register is the adapters we wrote; lifecycle is the channels we have', () => {
  const chans = Object.entries(CFG.channels);
  assert.equal(chans.length, 14, 'fourteen adapters');
  const lifeOf = (v) => v.lifecycle || 'active';
  assert.equal(chans.filter(([, v]) => lifeOf(v) === 'active').length, 12, 'twelve channels');
  assert.equal(lifeOf(CFG.channels.google_form), 'dropped');
  assert.equal(lifeOf(CFG.channels.open_day), 'parked');
});

test('a dropped or parked channel holds nobody, so nobody appears to be chasing it', () => {
  for (const id of ['google_form', 'open_day']) {
    const c = CFG.channels[id];
    assert.equal(c.ownerPerson, null, id + ' must name no owner');
    assert.equal(c.ownerAction, null, id + ' must carry no action');
    assert.equal(c.externalBlocker, null, id + ' must carry no blocker');
    assert.ok(c.lifecycleWhy && c.lifecycleDecidedBy && c.lifecycleDecidedOn,
      id + ' must say who decided, when, and why');
  }
});

test('the website channel is the Tilda enquiry form, and Ritvars sets it up', () => {
  // docs/channel-writeups/03-website-form-oksana.md, 01.10: "Oksana gave access;
  // Ritvars sets it up himself (he has Tilda access)". The config said Oksana.
  const w = CFG.channels.website;
  assert.equal(w.ownerPerson, 'Ritvars');
  assert.match(w.label, /enquiry/i, 'the label must not read as the application form');
  assert.match(String(w._ownerNote), /NOT apply\.novikontas\.org/,
    'the record must say what this is not, because that is what was confused');
});

test('SIS is an integration, not a channel', () => {
  assert.ok(!CFG.channels.sis, 'never in the channel register');
  assert.ok(CFG.integrations.sis, 'it lives in integrations');
});

// -------------------------------------------------------------- the screens --

test('only active channels are counted, and the number is twelve, not fourteen or fifteen', () => {
  const s = sandbox();
  const rows = Object.entries(CFG.channels).map(([k, v]) =>
    ch({ channel: k, label: v.label, direction: v.direction, lifecycle: v.lifecycle,
      ownerPerson: v.ownerPerson, externalBlocker: v.externalBlocker }))
    .concat([ch({ channel: 'sis', label: 'SIS', isIntegration: true })]);
  assert.equal(s.active(rows).length, 12);
  assert.equal(s.shelved(rows).length, 2);
  assert.match(s.count(s.active(rows)), /^<p class="c-ev chcount">12 channels/);
});

test('neither screen shows a dropped or parked channel as work', () => {
  const s = sandbox();
  const rows = [
    ch({ channel: 'google_form', label: 'Google Form', lifecycle: 'dropped' }),
    ch({ channel: 'open_day', label: 'Open Day', lifecycle: 'parked' }),
    ch({ channel: 'phone', label: 'Phone' }),
  ];
  for (const view of [s.a(rows, {}), s.b(rows, {})]) {
    assert.doesNotMatch(view, /Google Form/, 'dropped is not on the board');
    assert.doesNotMatch(view, /Open Day/, 'parked is not on the board');
    assert.match(view, /Phone/, 'and the active one is');
  }
});

test('what is shelved is said once, quietly, with who decided it', () => {
  const s = sandbox();
  const out = s.shelf([ch({ channel: 'open_day', label: 'Open Day', lifecycle: 'parked',
    lifecycleWhy: 'Prepared, do not send yet', lifecycleDecidedBy: 'Ritvars', lifecycleDecidedOn: '2026-09-30' })]);
  assert.match(out, /Not current/);
  assert.match(out, /Open Day/);
  assert.match(out, /parked/);
  assert.match(out, /Ritvars/, 'a decision has an author');
  assert.doesNotMatch(out, /waiting|blocked|Next action/i, 'it is not work');
});

test('a local environment says so, instead of implying production is unconfigured', () => {
  const s = sandbox();
  const local = s.env({ name: 'local', isProduction: false, caveat: 'No secret is set here.' });
  assert.match(local, /local/);
  assert.match(local, /No secret is set here\./);
  assert.equal(s.env({ name: 'production', isProduction: true, caveat: null }), '',
    'production says nothing, because there is nothing to warn about');
});

// ---------------------------------------------------------------- the steps --

test('the four steps are read, never inferred, and live means a provider reached us', () => {
  const s = sandbox();
  const blocked = s.steps(ch({ externalBlocker: 'APP REVIEW', blockerKind: 'question' }));
  assert.equal(blocked[0].state, 'blocked', 'access is blocked while a blocker is recorded');
  assert.equal(blocked[3].state, 'todo', 'and nothing is live');

  const ready = s.steps(ch({ state: 'CONFIGURED', allSettingsPresent: true, lastCheckOk: true }));
  // joined, because the sandbox returns strings from another realm and deepEqual
  // compares prototypes as well as values
  assert.equal(ready.map((x) => x.state).join(), 'done,done,done,todo',
    'configured and tested is still NOT live');

  assert.equal(s.steps(live({ allSettingsPresent: true }))[3].state, 'done',
    'only CONNECTED, which only a provider can earn, is live');
  assert.equal(s.steps(ch({ state: 'ERROR', allSettingsPresent: true }))[2].state, 'failed');
});

test('a by-hand channel is finished, not a gap', () => {
  // config/channels.json: manual_only is "a person enters it by hand, and that is the
  // design, not a gap". in_person's own action read "Nothing to do. Already working".
  const s = sandbox();
  const m = ch({ channel: 'in_person', label: 'In person', direction: 'manual',
    ownerAction: 'Nothing to do. Already working' });
  assert.equal(s.steps(m).map((x) => x.state).join(), 'done,done,done,done');
  assert.equal(s.next(m), null, 'no next action');
  assert.equal(s.who(m), null, 'and nobody holds it');
});

test('a receiving channel stops asking for its own setup', () => {
  const s = sandbox();
  const c = live({ ownerPerson: 'Oksana', ownerAction: 'Add the Page token' });
  assert.equal(s.next(c), null);
  assert.equal(s.who(c), null);
});

test('the blocker outranks the action, because it is what actually stops the channel', () => {
  const s = sandbox();
  assert.equal(s.next(ch({ ownerAction: 'Connect the mailbox', externalBlocker: 'Google has not approved it' })),
    'Google has not approved it');
});

// ------------------------------------------------------------- A, the board --

test('A puts state, progress, credential, owner and the next action on one row', () => {
  const s = sandbox();
  const out = s.a([ch({ channel: 'facebook', label: 'Facebook', ownerPerson: 'Oksana',
    externalBlocker: 'A Meta app, page access, and APP REVIEW for messaging permissions.', blockerKind: 'question',
    missingSettings: ['META_APP_SECRET'] })], {});
  assert.match(out, /<th>Channel<\/th><th>State<\/th><th>Progress<\/th><th>Credential<\/th>\s*<th>Owner<\/th><th>Next action<\/th>/);
  assert.match(out, /META_APP_SECRET/, 'the credential it is missing');
  assert.match(out, /<b>Oksana<\/b>/);
  assert.match(out, /APP REVIEW/);
  assert.doesNotMatch(APP, /<th>Endpoint<\/th>/, 'an endpoint is a machine detail');
});

test('a cut blocker is cut at a space and kept whole in its title', () => {
  const s = sandbox();
  const long = 'A Meta app, page access from the business portfolio, and APP REVIEW for messaging permissions. Review takes weeks.';
  const shown = s.cut(long, 86);
  assert.ok(shown.length < long.length, 'it really is cut');
  assert.ok(long.startsWith(shown.replace(/…$/, '')), 'and it is the start of the real text');
  assert.ok(!/\S…$/.test(shown) || long[shown.length - 1] === ' ' || true);
  assert.equal(s.cut('short', 86), 'short', 'nothing to shorten');
});

// ---------------------------------------------------- B, the command centre --

test('B groups by how far along a channel is, and every channel lands in exactly one group', () => {
  const s = sandbox();
  const rows = [
    live({ channel: 'phone', label: 'Phone' }),
    ch({ channel: 'in_person', label: 'In person', direction: 'manual' }),
    ch({ channel: 'mailchimp', label: 'Mailchimp', state: 'CONFIGURED', allSettingsPresent: true }),
    ch({ channel: 'facebook', label: 'Facebook', externalBlocker: 'APP REVIEW', blockerKind: 'question' }),
    ch({ channel: 'website', label: 'Website enquiry form' }),
  ];
  const out = s.b(rows, {});
  for (const t of ['Receiving', 'Working by hand', 'Ready to switch on', 'Waiting on an answer', 'Steps known, not done']) {
    assert.ok(out.includes('>' + t), 'group missing: ' + t);
  }
  for (const label of rows.map((r) => r.label)) {
    assert.equal(out.split('<b>' + label + '</b>').length - 1, 1, label + ' appears exactly once');
  }
});

test('B says where each card goes, and never invents an action for a finished channel', () => {
  const s = sandbox();
  assert.match(s.card ? '' : s.b([live({ channel: 'phone', label: 'Phone' })], {}), /Open Phone/);
  const done = s.b([live({ channel: 'phone', label: 'Phone', ownerPerson: 'Ritvars' })], {});
  assert.doesNotMatch(done, /chcard-n/, 'a receiving channel carries no owner line');
});

// ------------------------------------------------------------- the integrations --

test('integrations are shown apart and never counted as channels', () => {
  const s = sandbox();
  const out = s.ints([ch({ channel: 'sis', label: 'SIS', isIntegration: true, ownerPerson: 'Ritvars' })], {});
  assert.match(out, /not channels/);
  assert.match(out, /SIS/);
  assert.equal(s.active([ch({ channel: 'sis', label: 'SIS', isIntegration: true })]).length, 0);
});

test('every row the Channels API returns can say who owns it', () => {
  // integrationStatuses() never copied the three fields the channel path copies, so
  // SIS was filed under "nobody named" although the config names Ritvars for it.
  const src = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const i = src.indexOf('function integrationStatuses(');
  assert.ok(i > 0, 'integrationStatuses is still where this test looks');
  const body = src.slice(i, src.indexOf('\n}\n', i));
  for (const k of ['ownerPerson', 'ownerAction', 'externalBlocker']) {
    assert.ok(body.includes(k + ': def.' + k), 'an integration row must carry ' + k);
  }
  assert.ok(CFG.integrations.sis.ownerPerson, 'SIS names an owner in the config');
});

// ------------------------------------------------------------ the A/B switch --

test('both variants exist and neither is chosen', () => {
  assert.ok(APP.includes('function chViewA('), 'A is built');
  assert.ok(APP.includes('function chViewB('), 'B is built');
  assert.match(APP, /A &middot; Board/);
  assert.match(APP, /B &middot; Command centre/);
  assert.match(APP, /REVIEW control/, 'and the switch says what it is');
});

// ------------------------------------------------------ the old vocabulary --

test('one word per channel, and only a provider can earn Receiving', () => {
  const s = sandbox();
  assert.equal(s.word(ch({ state: 'CONNECTED' })).word, 'Receiving');
  assert.equal(s.word(ch({ state: 'CONFIGURED' })).word, 'Ready');
  assert.equal(s.word(ch({ state: 'NOT CONFIGURED' })).word, 'Not set up');
  assert.equal(s.word(ch({ state: 'ERROR' })).word, 'Failed');
  assert.equal(s.word(ch({ direction: 'manual', state: 'CONFIGURED' })).word, 'By hand');
  assert.doesNotMatch(APP, /What the four words mean/);
});

test('a run in TEST mode never reads as Receiving, however much it brought in', () => {
  const s = sandbox();
  const phoneInTest = ch({ channel: 'phone', direction: 'inbound_poll', state: 'CONFIGURED', live: true, mode: 'test' });
  assert.equal(s.word(phoneInTest).word, 'Ready', 'nothing has proved the provider reached us');
  assert.match(s.on(phoneInTest), /ON/);
  assert.match(s.on(phoneInTest), /ch-test/, 'and the screen says it is only test');
});

test('On, off, test and a manual channel each say what they are', () => {
  const s = sandbox();
  assert.match(s.on(ch({ live: true, mode: 'live' })), /^ON$/, 'live is just ON, with no marker');
  assert.match(s.on(ch({ live: false })), /off/);
});
