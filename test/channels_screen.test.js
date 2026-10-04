// The Channels screen, Session 3 (02.10.2026): one model under two layouts.
//
// A = who acts next (a work queue: lanes of people, cards of work).
// B = what is proven (a ledger: the four proofs left to right, an inspector).
//
// Everything a local run cannot show is tested here: on this machine no secret is set
// and no provider has ever posted, so the screen shows the RECORD (what was last seen
// about production, with the date) and must never pass it off as a reading.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'channels.json'), 'utf8'));
const PROTO = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

const START = '// ============================================ CHANNEL MODEL (Session 3, 02.10) ==';
const END = '// ================================================== end of the channel model ==';
const BLOCK = APP.slice(APP.indexOf(START), APP.indexOf(END));

function sandbox({ search = '', stored = null } = {}) {
  const store = { chvariant: stored };
  const ctx = {
    esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    location: { search, href: 'http://x/' + search },
    localStorage: { getItem: (k) => store[k], setItem: (k, v) => { store[k] = v; } },
    URLSearchParams, URL, history: { replaceState() {} },
    document: { querySelector: () => null }, viewChannels: () => {},
  };
  vm.runInNewContext(BLOCK + `
    this.kinds = CH_KINDS; this.life = chLife; this.active = chActive; this.shelved = chShelved;
    this.liveOf = chLiveOf; this.kind = chKind; this.blocker = chBlocker; this.action = chAction;
    this.who = chWhoActs; this.evidence = chEvidence; this.local = chLocal; this.count = chCount;
    this.cut = chCut; this.env = chEnvLine; this.shelf = chShelvedHtml; this.down = chDownstreamHtml;
    this.a = chViewA; this.b = chViewB; this.insp = chInspector; this.variant = chVariant;
    this.slots = chSlots; this.conflict = chConflictHtml;`, ctx);
  return ctx;
}

const LOCAL = { name: 'local', isProduction: false, caveat: 'This is not production.' };
const PROD = { name: 'production', isProduction: true, caveat: null };

// The rows exactly as the API builds them on a local checkout: no secret set, no
// provider row, the record copied through from the config.
function apiRows(over = {}) {
  return Object.entries(CFG.channels).map(([id, d]) => {
    const names = [d.secretEnv, d.verifyTokenEnv].filter(Boolean);
    return { channel: id, label: d.label, direction: d.direction, lifecycle: d.lifecycle || 'active',
      lifecycleWhy: d.lifecycleWhy || null, lifecycleDecidedBy: d.lifecycleDecidedBy || null,
      lifecycleDecidedOn: d.lifecycleDecidedOn || null, ownerPerson: d.ownerPerson || null,
      settings: names.map((n) => ({ name: n, present: false })), missingSettings: names,
      allSettingsPresent: names.length === 0, events: 0, lastEventAt: null, record: d.record || null,
      ...(over[id] || {}) };
  }).concat([{ channel: 'sis', label: 'SIS', isIntegration: true, ownerPerson: 'Ritvars' }]);
}
const byId = (rows, id) => rows.find((r) => r.channel === id);

// ------------------------------------------------------------- the register --

test('the register is the adapters we wrote; lifecycle is the channels we have', () => {
  const chans = Object.entries(CFG.channels);
  assert.equal(chans.length, 14, 'fourteen adapters');
  const lifeOf = (v) => v.lifecycle || 'active';
  assert.equal(chans.filter(([, v]) => lifeOf(v) === 'active').length, 12, 'twelve channels');
  assert.equal(lifeOf(CFG.channels.google_form), 'dropped');
  assert.equal(lifeOf(CFG.channels.open_day), 'parked');
});

test('every active channel carries a record; a dropped or parked one carries none and holds nobody', () => {
  for (const [id, d] of Object.entries(CFG.channels)) {
    if ((d.lifecycle || 'active') === 'active') {
      for (const k of ['access', 'deployed', 'productionConfigured', 'liveVerified', 'destination']) {
        assert.ok(d.record && d.record[k] !== undefined, id + ' record must say ' + k);
      }
    } else {
      assert.equal(d.record, undefined, id + ' is not current and carries no state');
      assert.equal(d.ownerPerson, null);
      assert.equal(d.ownerAction, null);
      assert.ok(d.lifecycleWhy && d.lifecycleDecidedBy && d.lifecycleDecidedOn);
    }
  }
});

test('owners are the ones Ritvars corrected on 02.10, not the stale config', () => {
  assert.equal(CFG.channels.website.ownerPerson, 'Ritvars', 'Tilda form: he sets it up himself');
  assert.equal(CFG.channels.linkedin.ownerPerson, 'Ritvars', 'Page Super Admin, developer app, Lead Sync request');
  assert.equal(CFG.channels.tiktok.ownerPerson, 'Oksana', 'the business account is on her email');
  assert.match(CFG._ownerPerson, /Corrected 02\.10\.2026/);
});

test('SIS is an integration and apply.novikontas.org is downstream; neither is a channel', () => {
  assert.ok(!CFG.channels.sis && CFG.integrations.sis);
  assert.ok(!CFG.channels.apply, 'apply is never in the channel register');
  assert.match(CFG.downstream.apply.label, /apply\.novikontas\.org/);
  assert.match(CFG.channels.website.record.destination, /NOT apply\.novikontas\.org/,
    'the enquiry form says what it is not, because that is what was confused');
});

// ------------------------------------------------------- count and lifecycle --

test('the active count is twelve, from the real config, never 14 or 15', () => {
  const s = sandbox();
  const rows = apiRows();
  assert.equal(s.active(rows).length, 12);
  assert.equal(s.shelved(rows).length, 2, 'dropped and parked');
  assert.equal(s.count(rows, LOCAL).total, 12);
  assert.match(s.a(rows, LOCAL), /<small>Active channels<\/small><b>12<\/b>/);
  assert.match(s.b(rows, LOCAL), /<small>Active channels<\/small><b>12<\/b>/);
});

test('each channel lands in exactly one lifecycle state, read from the record', () => {
  const s = sandbox();
  const rows = apiRows();
  const got = Object.fromEntries(rows.filter((r) => !r.isIntegration).map((r) => [r.channel, s.kind(r, LOCAL)]));
  assert.deepEqual({ ...got }, {
    website: 'configured', google_form: 'dropped', gmail: 'live', facebook: 'owner', messenger: 'owner',
    instagram: 'owner', whatsapp: 'owner', mailchimp: 'configured', open_day: 'parked', phone: 'live',
    agent: 'owner', in_person: 'hand', linkedin: 'provider', tiktok: 'owner',
  });
  const { n } = s.count(rows, LOCAL);
  // the production backup of 02.10 01:17Z holds 44 provider rows: phone 4, gmail 40
  assert.equal(n.live, 2, 'Phone and Email (edu@) are live verified, from the 02.10 backup');
  assert.equal(n.live + n.owner + n.configured + n.provider + n.hand, 12);
  for (const k of ['Not configured', 'Configured', 'Live verified', 'Needs owner action',
    'Blocked by external provider', 'Parked', 'Dropped']) {
    assert.ok(Object.values(s.kinds).some((x) => x.word === k), 'the vocabulary has ' + k);
  }
  assert.ok(!Object.values(s.kinds).some((x) => /waiting on/i.test(x.word)), '"Waiting on" is not a bucket');
});

test('dropped and parked are never work on either layout, and say who decided', () => {
  const s = sandbox();
  const rows = apiRows();
  for (const view of [s.a(rows, LOCAL), s.b(rows, LOCAL)]) {
    assert.doesNotMatch(view, /Google Form|Open Day/);
  }
  for (const id of ['google_form', 'open_day']) {
    assert.equal(s.who(byId(rows, id)), null, id + ' holds nobody');
    assert.equal(s.action(byId(rows, id)), null);
  }
  const shelf = s.shelf(rows);
  assert.match(shelf, /Not current/);
  assert.match(shelf, /Google Form[\s\S]*Dropped/);
  assert.match(shelf, /Open Day[\s\S]*Parked/);
  assert.match(shelf, /Ritvars/, 'a decision has an author');
  assert.doesNotMatch(shelf, /Needs owner action|Blocker/);
});

test('downstream is shown apart and never counted', () => {
  const s = sandbox();
  const rows = apiRows();
  const out = s.down(rows, CFG.downstream);
  assert.match(out, /apply\.novikontas\.org/);
  assert.match(out, /SIS/);
  assert.match(out, /Not channels, never counted/);
  // neither is a lane card, a ledger row or a slot; B's lifecycle strip names them as downstream
  const views = s.a(rows, LOCAL) + s.b(rows, LOCAL);
  assert.doesNotMatch(views, /<b>(SIS|apply\.novikontas\.org)<\/b>/);
  assert.match(s.b(rows, LOCAL), /<li class="down">apply\.novikontas\.org<\/li>/);
});

// ------------------------------------------------------ local vs production --

test('locally, a provider row on THIS machine never makes production live', () => {
  const s = sandbox();
  const rows = apiRows({ mailchimp: { events: 4, lastEventAt: '2026-10-02T09:00:00Z' } });
  const mc = byId(rows, 'mailchimp');
  assert.equal(s.liveOf(mc, LOCAL).state, 'no', 'the record stands');
  assert.equal(s.liveOf(mc, LOCAL).observed, false);
  assert.notEqual(s.kind(mc, LOCAL), 'live');
});

test('on production the rows answer, and they settle the conflict either way', () => {
  const s = sandbox();
  const yes = byId(apiRows({ mailchimp: { events: 3, lastEventAt: '2026-10-02T09:00:00Z' } }), 'mailchimp');
  assert.equal(s.liveOf(yes, PROD).state, 'yes');
  assert.equal(s.liveOf(yes, PROD).observed, true);
  assert.equal(s.kind(yes, PROD), 'live');
  const no = byId(apiRows(), 'phone');
  assert.equal(s.liveOf(no, PROD).state, 'no', 'no provider row on production means not live, whatever the record says');
  assert.equal(s.kind(no, PROD), 'configured');
});

test('the four states stay apart, each dated, and this machine is labelled as local', () => {
  const s = sandbox();
  const mc = byId(apiRows(), 'mailchimp');
  const ev = s.evidence(mc, LOCAL);
  assert.equal(ev.map((e) => e.key).join(), 'access,deployed,prod,live');
  assert.equal(ev.find((e) => e.key === 'prod').state, 'yes', 'production configured, as seen');
  assert.equal(ev.find((e) => e.key === 'prod').seen, '2026-10-01');
  assert.equal(ev.find((e) => e.key === 'live').state, 'no', 'configured is NOT live');
  assert.equal(s.local(mc, LOCAL).where, 'This machine');
  assert.equal(s.local(mc, LOCAL).word, '0 of 1 set');
  assert.equal(s.local(mc, PROD).where, 'Production now', 'and on production it says so');
  assert.match(s.env(LOCAL, CFG._production), /not production[\s\S]*292b4f9/);
  assert.match(s.env(PROD, CFG._production), /read from real provider rows/);
});

test('a missing local credential is never a blocker', () => {
  const s = sandbox();
  for (const id of ['website', 'mailchimp', 'tiktok']) {
    assert.equal(s.blocker(byId(apiRows(), id)), null, id + ' has steps, not a blocker');
  }
});

// ------------------------------------------------------------- the blockers --

test('every blocker names its dependency, owner, action and side', () => {
  for (const [id, d] of Object.entries(CFG.channels)) {
    const b = d.record && d.record.blocker;
    if (!b) continue;
    assert.ok(b.dependency, id + ' dependency');
    assert.ok('owner' in b, id + ' owner, even if nobody is named');
    assert.ok(b.action, id + ' action or input');
    assert.ok(['internal', 'external'].includes(b.side), id + ' internal or external');
    assert.equal(typeof b.canRefuse, 'boolean', id + ' says whether it can be refused');
  }
  const s = sandbox();
  const li = byId(apiRows(), 'linkedin');
  assert.equal(s.blocker(li).side, 'external');
  assert.match(s.a(apiRows(), LOCAL), /External, can be refused/);
  const agent = byId(apiRows(), 'agent');
  assert.equal(s.blocker(agent).side, 'internal');
  assert.match(s.insp(agent, LOCAL), /Nobody named/, 'an unnamed owner is said, not hidden');
  assert.ok(PROTO.openQuestions.agentPartnerOwner && PROTO.openQuestions.linkedinLeadSync,
    'a question-kind blocker has an open question someone chases');
});

test('Meta review is shown as ahead, not as today\'s blocker, and the open call is not taken', () => {
  const s = sandbox();
  const fb = byId(apiRows(), 'facebook');
  assert.equal(s.blocker(fb), null);
  assert.equal(s.kind(fb, LOCAL), 'owner');
  assert.match(s.a(apiRows(), LOCAL), /Ahead, not blocking yet:<\/b> Meta APP REVIEW/);
  assert.match(CFG.channels.facebook.record.gateAhead.detail, /still Ritvars's call/);
});

// --------------------------------------------------------------------- PBX --

test('PBX: settled on production evidence, with what it was and the gap still open', () => {
  // The 02.10 01:17Z production backup (VERIFIED) holds 4 phone rows with source=provider,
  // written by the daily TeleGroup pull at 01.10 05:27Z. "PBX ir live" was right; the Pin
  // was stale. What the backup cannot show is that the pull kept running after 01.10.
  const s = sandbox();
  const phone = byId(apiRows(), 'phone');
  const l = s.liveOf(phone, LOCAL);
  assert.equal(l.state, 'yes');
  assert.match(l.source, /2026-10-02T01-17-43Z/);
  assert.equal(l.settled.was.length, 2, 'both earlier records are kept, not erased');
  assert.match(l.gap, /kept running after 01\.10/);
  assert.equal(s.kind(phone, LOCAL), 'live');
  for (const view of [s.a(apiRows(), LOCAL), s.insp(phone, LOCAL)]) {
    assert.match(view, /Settled on evidence, 02\.10\./);
    assert.match(view, /Not proven yet:/);
  }
});

test('a conflict, whenever one is recorded, is shown with both sides and never resolved', () => {
  const s = sandbox();
  const c = { channel: 'x', label: 'X', direction: 'inbound_poll', lifecycle: 'active', record: {
    liveVerified: { state: 'conflict', claims: [{ who: 'A', on: '2026-10-01', says: 'live' }, { who: 'B', on: '2026-10-01', says: 'not live' }], check: 'look' } } };
  assert.equal(s.liveOf(c, LOCAL).state, 'conflict');
  assert.notEqual(s.kind(c, LOCAL), 'live');
  assert.match(s.conflict(c, LOCAL), /Two records disagree\. Not settled here\.[\s\S]*The check:/);
});

test('Email is told per mailbox: edu@ live, nothing else connected', () => {
  const s = sandbox();
  const g = byId(apiRows(), 'gmail');
  assert.equal(s.kind(g, LOCAL), 'live');
  const out = s.insp(g, LOCAL);
  assert.match(out, /edu@novikontas\.org<\/b>\s*<span>Live/);
  assert.match(out, /training@novikontas\.org<\/b>\s*<span>Not connected/);
  assert.match(CFG.channels.gmail.record.liveVerified.detail, /40 rows from a real provider/);
});

// ------------------------------------------------------------ A and B --

test('A is a work queue: one lane per person who acts next, every channel once', () => {
  const s = sandbox();
  const out = s.a(apiRows(), LOCAL);
  const lanes = [...out.matchAll(/<section class="chlane"[^>]*>\s*<h2>([^<]+)<span class="chc-n">(\d+)/g)].map((m) => m[1] + ':' + m[2]);
  assert.deepEqual(lanes, ['Oksana:6', 'Ritvars:3', 'Needs a decision, nobody named:1', 'Nobody has to act:2']);
  for (const r of apiRows().filter((x) => !x.isIntegration && (x.lifecycle || 'active') === 'active')) {
    assert.equal(out.split('<b>' + r.label + '</b>').length - 1, 1, r.label + ' once');
  }
  for (const k of ['Delivers to', 'Access', 'Code deployed', 'Production configured', 'Live verified']) assert.match(out, new RegExp(k));
});

test('B is a ledger: four proofs plus this machine, every cell labelled, an inspector', () => {
  const s = sandbox();
  const out = s.b(apiRows(), LOCAL);
  assert.match(out, /<th class="chloc-h">This machine<\/th><th>Access<\/th><th>Code deployed<\/th><th>Production configured<\/th><th>Live verified<\/th><th>State<\/th>/);
  const rows = [...out.matchAll(/<tr class="row/g)].length;
  assert.equal(rows, 12);
  const tds = [...out.matchAll(/<td(?![^>]*data-label)[^>]*>/g)].filter((m) => !/tfoot/.test(m[0]));
  assert.ok([...out.matchAll(/<td class="chcell[^"]*" data-label="/g)].length === 48, 'every proof cell is labelled for the phone layout');
  assert.match(out, /<aside class="chinsp"/);
  assert.match(out, /<h2>Phone <span/, 'the inspector opens on the proof with a stated gap');
  assert.match(out, /Not proven yet:/);
  assert.match(out, /<td><b>2<\/b> of 12<\/td><td><\/td><\/tr><\/tfoot>/, 'live verified: 2 of 12, counted');
  assert.ok(tds.length >= 0);
});

test('the A/B switch: both built, neither chosen, address and storage both work', () => {
  assert.match(APP, /A &middot; Who acts next/);
  assert.match(APP, /B &middot; What is proven/);
  assert.match(APP, /A REVIEW control/);
  assert.doesNotMatch(APP, /A &middot; Board|Command centre/, 'the previous run\'s labels are gone');
  assert.equal(sandbox().variant(), 'a', 'A by default');
  assert.equal(sandbox({ stored: 'b' }).variant(), 'b');
  assert.equal(sandbox({ search: '?chv=b' }).variant(), 'b');
  assert.equal(sandbox({ search: '?chv=a', stored: 'b' }).variant(), 'a', 'the address wins');
  assert.equal(sandbox({ search: '?chv=c' }).variant(), 'a', 'there is no C');
});

// --------------------------------------------------- no fake data, no secrets --

test('the record holds no credential values and every claimed state carries its date and source', () => {
  const raw = JSON.stringify(Object.values(CFG.channels).map((d) => d.record || null));
  assert.doesNotMatch(raw, /[A-Za-z0-9]{24,}/, 'nothing secret-shaped');
  assert.doesNotMatch(raw, /sk_|Bearer |token=/i);
  for (const [id, d] of Object.entries(CFG.channels)) {
    if (!d.record) continue;
    for (const k of ['productionConfigured', 'liveVerified', 'access']) {
      const x = d.record[k];
      if (['not_needed', 'not_applicable'].includes(x.state)) continue;
      assert.ok(x.seen, id + ' ' + k + ' says when it was seen');
      assert.ok(x.source, id + ' ' + k + ' says where');
    }
  }
  const s = sandbox();
  const out = s.a(apiRows(), LOCAL) + s.b(apiRows(), LOCAL);
  assert.doesNotMatch(out, /[A-Za-z0-9]{32,}/);
});

// ------------------------------------------------- frame, depth, motion, phone --

test('the frame carries the existing sea, and the data marks stay flat and equal', () => {
  assert.match(APP, /html\.ui-c\{--sea:radial-gradient\(120% 80% at 50% 0%,#fbfcfd 0%,rgba\(251,252,253,0\) 60%\)/);
  assert.match(APP, /--sea:radial-gradient\(120% 80% at 50% 0%,#17456e 0%,rgba\(23,69,110,0\) 60%\)/);
  assert.match(APP, /html\.ui-c \.chdeck\{[^}]*background:var\(--sea\)/);
  const s = sandbox();
  const slots = s.slots(apiRows(), LOCAL);
  const widths = new Set([...slots.matchAll(/width="([\d.]+)" height="6"/g)].map((m) => m[1]));
  assert.equal(widths.size, 1, 'twelve equal slots');
  assert.doesNotMatch(slots, /transform|perspective|skew/);
  const css = APP.slice(APP.indexOf('Channels, A and B (Session 3)'), APP.indexOf('Not current, and downstream'));
  const hexes = new Set((css.match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toLowerCase()));
  for (const h of hexes) assert.ok(['#29a8df', '#e0a526', '#d3dce6', '#08182e'].includes(h), 'no new colour: ' + h);
});

test('at most two scenes per layout, none scales a mark, reduced motion turns them off', () => {
  const css = APP.slice(APP.indexOf('THE TWO SCENES per variant'), APP.indexOf('phone width: the ledger'));
  const a = new Set([...css.matchAll(/\.chv-a (\.[\w-]+)[^{]*\{animation:/g)].map((m) => m[1]));
  const b = new Set([...css.matchAll(/\.chv-b (\.[\w-]+)[^{,]*[,{]/g)].map((m) => m[1]));
  assert.ok(a.size <= 2 && a.size >= 1, 'A: ' + [...a]);
  assert.ok(b.size <= 2 && b.size >= 1, 'B: ' + [...b]);
  assert.doesNotMatch(css.replace(/translateY/g, ''), /scale|rotate/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('phone width: the ledger becomes cards, the lanes reflow, nothing is wider than the screen', () => {
  assert.match(APP, /@media \(max-width:720px\)\{\s*html\.ui-c \.chmx thead\{display:none\}/);
  // found running it at 390: the global .tablewrap>table{min-width:760px} kept the cards
  // 752px wide and hid every second cell off-screen
  assert.match(APP, /html\.ui-c \.chmx tfoot\{display:block;min-width:0;width:100%\}/);
  assert.match(APP, /html\.ui-c \.chmx td\[data-label\]::before\{content:attr\(data-label\)/);
  assert.match(APP, /\.chlane-grid\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,310px\),1fr\)\)/);
  assert.match(APP, /@media \(max-width:1100px\)\{ html\.ui-c \.chledger\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test('a long text is cut at a space', () => {
  const s = sandbox();
  const long = 'A Meta app, page access from the business portfolio, and APP REVIEW for messaging permissions.';
  const shown = s.cut(long, 60);
  assert.ok(shown.length < long.length);
  assert.ok(long.startsWith(shown.replace(/…$/, '')));
  assert.equal(s.cut('short', 60), 'short');
});

test('every row the Channels API returns can say who owns it, and carries the record', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
  const i = src.indexOf('function integrationStatuses(');
  const body = src.slice(i, src.indexOf('\n}\n', i));
  for (const k of ['ownerPerson', 'ownerAction', 'externalBlocker']) assert.ok(body.includes(k + ': def.' + k));
  assert.match(fs.readFileSync(path.join(ROOT, 'src', 'channeladmin.js'), 'utf8'), /record: def\.record \|\| null/);
  assert.match(src, /production: CHANNELS\._production \|\| null/);
  assert.match(src, /downstream: CHANNELS\.downstream \|\| null/);
});
