// The Channels screen. Q7, 04.10.2026: KB 08 P5 "Apps are work tools". Ritvars, on the live
// screen: "This is for work, not to play around and leave notes in places I must go and search!"
//
// ONE line per active channel: its name and one state word, the whole line a click to Settings
// and check. The channel RECORD (config/channels.json) stays as data and drives the word; it is
// never printed. Parked and dropped are not shown. No A/B.
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

function sandbox() {
  const ctx = { esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') };
  vm.runInNewContext(BLOCK + `
    this.life = chLife; this.active = chActive; this.liveOf = chLiveOf; this.kind = chKind;
    this.blocker = chBlocker; this.action = chAction; this.who = chWhoActs; this.state = chState;
    this.list = chListHtml;`, ctx);
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
      ownerPerson: d.ownerPerson || null,
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

// --------------------------------------------------------------- the screen --

test('one line per active channel: twelve, and nothing parked, dropped or downstream', () => {
  const s = sandbox();
  const out = s.list(apiRows(), LOCAL);
  assert.equal((out.match(/<li>/g) || []).length, 12);
  assert.doesNotMatch(out, /Google Form|Open Day|SIS|apply\.novikontas\.org/);
});

test('each line is the channel name and one state word, read from the record', () => {
  const s = sandbox();
  const words = Object.fromEntries(s.active(apiRows()).map((c) => [c.channel, s.state(c, LOCAL).word]));
  assert.deepEqual({ ...words }, {
    website: 'Live', gmail: 'Live', facebook: 'Waiting on Oksana', messenger: 'Waiting on Oksana',
    instagram: 'Waiting on Oksana', whatsapp: 'Waiting on Oksana', mailchimp: 'Live', phone: 'Live',
    agent: 'Live', in_person: 'By hand', linkedin: 'Live', tiktok: 'Waiting on Oksana',
  });
});

// Q24 (05.10.2026, Ritvars: "why some channels show blocked, when they are not???")
test('Q24: today no channel reads Blocked, and every word is one of the five', () => {
  const s = sandbox();
  for (const env of [LOCAL, PROD]) {
    for (const c of s.active(apiRows())) {
      const w = s.state(c, env).word;
      assert.ok(/^(Live|Configured|By hand|Not decided|Waiting on \S.*)$/.test(w), c.channel + ': ' + w);
    }
  }
});

test('Q24: the owner saying live is live, on production too, with the provider count kept as data', () => {
  const s = sandbox();
  for (const id of ['website', 'agent', 'linkedin', 'mailchimp']) {
    assert.equal(CFG.channels[id].record.ownerSays.state, 'live', id);
    assert.equal(s.state(byId(apiRows(), id), PROD).word, 'Live', id);
    assert.ok(CFG.channels[id].record.liveVerified, id + ' keeps its count');
  }
  assert.equal(CFG.channels.linkedin.record.blocker, null, 'the leads option is an extra, not a blocker');
  assert.ok(CFG.channels.linkedin.record.pendingExtra.dependency);
  assert.equal(CFG.channels.agent.record.blocker, null);
  assert.match(CFG.channels.agent.record.arrives, /edu@/);
});

test('Q24: an outside party is waited on by name; nobody named reads Not decided; only a refusal is Blocked', () => {
  const s = sandbox();
  const ch = (record) => ({ channel: 'x', label: 'X', direction: 'inbound_webhook', lifecycle: 'active', record });
  const ext = { dependency: 'their decision', owner: 'LinkedIn / Microsoft vetting', party: 'LinkedIn', action: 'wait', side: 'external', canRefuse: true };
  assert.deepEqual({ ...s.state(ch({ blocker: ext }), LOCAL) }, { word: 'Waiting on LinkedIn', cls: 'k-owner' });
  assert.equal(s.state(ch({ blocker: { ...ext, party: undefined } }), LOCAL).word, 'Waiting on LinkedIn / Microsoft vetting');
  assert.deepEqual({ ...s.state(ch({ blocker: { ...ext, refused: true } }), LOCAL) }, { word: 'Blocked', cls: 'k-prov' });
  const question = { dependency: 'name the first partner', owner: null, action: 'decide', side: 'internal', canRefuse: false };
  const nd = s.state(ch({ blocker: question }), LOCAL);
  assert.deepEqual({ ...nd }, { word: 'Not decided', cls: 'k-none' });
  assert.deepEqual({ ...s.state(ch({}), LOCAL) }, { word: 'Not decided', cls: 'k-none' }, 'never the provider class');
});

test('every line is a click to Settings and check, and that is the only control', () => {
  const s = sandbox();
  const out = s.list(apiRows(), LOCAL);
  const links = [...out.matchAll(/<a href="#\/channels\/([a-z_]+)"/g)].map((m) => m[1]);
  assert.equal(links.length, 12);
  assert.doesNotMatch(out, /<button|onclick/);
});

test('no notes, evidence, dates, counts, environment talk or A/B on the screen', () => {
  const s = sandbox();
  // Closed, as the screen opens (Q27, 05.10: every line is an uncovering tab; its figures sit inside)
  const out = s.list(apiRows(), LOCAL).replace(/<div class="chcard-in">[\s\S]*?<\/div><\/details>/g, '</details>');
  for (const banned of [/seen /i, /source/i, /Input/, /Ahead/, /not blocking/i, /Delivers to/, /local, not production/i,
    /Access/, /Code deployed/i, /Production configured/i, /Live verified/i, /\d{2}\.\d{2}/, /292b4f9|c3ab3e4/,
    /Active channels/, /Not current/, /Downstream/, /Settled on evidence/, /Not proven yet/, /edu@/]) {
    assert.doesNotMatch(out, banned, String(banned));
  }
  for (const gone of ['chViewA', 'chViewB', 'chSetVariant', 'A &middot; Who acts next', 'B &middot; What is proven',
    'chEnvLine', 'chDeck', 'chShelvedHtml', 'chDownstreamHtml', 'chInspector', 'class="chmx', 'chlane']) {
    assert.ok(!APP.includes(gone), 'gone: ' + gone);
  }
  const view = APP.slice(APP.indexOf('async function viewChannels('), APP.indexOf(END));
  assert.match(view, /\$\('#view'\)\.innerHTML = `<p class="c-crumb">Settings<\/p><div class="c-head"><div><h1>Channels<\/h1><\/div><\/div>\s*<div class="c-sheet c-chcard chinfo">\$\{chListHtml\([^`]*\)\}<\/div>\s*\$\{chSisHtml\([^`]*\)\}`;/,
    'a heading, the list on one card and SIS on its own, nothing else');
});

test('on production the state reads the real provider rows; locally it takes the record', () => {
  const s = sandbox();
  // a configured channel the owner has NOT called live (Mailchimp's record before 05.10)
  const base = byId(apiRows({ mailchimp: { events: 3, lastEventAt: '2026-10-04T08:00:00Z' } }), 'mailchimp');
  const mc = { ...base, record: { ...base.record, ownerSays: undefined } };
  assert.equal(s.state(mc, LOCAL).word, 'Configured', 'a row on this machine proves nothing about production');
  assert.equal(s.state(mc, PROD).word, 'Live');
  assert.equal(s.state(byId(apiRows(), 'phone'), PROD).word, 'Configured', 'no provider row on production: not live');
});

test('a missing local credential is never a blocker', () => {
  const s = sandbox();
  for (const id of ['website', 'mailchimp', 'tiktok']) assert.equal(s.blocker(byId(apiRows(), id)), null, id);
});

test('a recorded conflict never reads as Live', () => {
  const s = sandbox();
  const c = { channel: 'x', label: 'X', direction: 'inbound_poll', lifecycle: 'active',
    record: { liveVerified: { state: 'conflict', claims: [] } } };
  assert.notEqual(s.state(c, LOCAL).word, 'Live');
});

// ----------------------------------------------------------------- the data --

test('every blocker in the record names its dependency, owner, action and side', () => {
  for (const [id, d] of Object.entries(CFG.channels)) {
    const b = d.record && d.record.blocker;
    if (!b) continue;
    assert.ok(b.dependency && 'owner' in b && b.action, id);
    assert.ok(['internal', 'external'].includes(b.side), id);
    assert.equal(typeof b.canRefuse, 'boolean', id);
  }
  assert.ok(PROTO.openQuestions.agentPartnerOwner && PROTO.openQuestions.linkedinLeadSync);
});

test('the record: PBX settled on the 02.10 backup, its continuity gap closed by the 04.10 one; Email live for edu@ only, training@ parked', () => {
  const ph = CFG.channels.phone.record.liveVerified;
  assert.equal(ph.state, 'yes');
  assert.match(ph.source, /2026-10-04T19-29-00Z/);
  assert.equal(ph.settled.was.length, 2);
  assert.ok(!ph.gap && ph.gapClosed && ph.gapClosed.was, 'the gap is closed, and what it was is kept');
  assert.equal(CFG.channels.phone.record.nextAction, null, 'nothing left to prove');
  // the SIS row is not served to the screen; its record is data only
  assert.equal(CFG.integrations.sis.record.liveVerified.state, 'yes');
  const mb = CFG.channels.gmail.record.mailboxes;
  assert.equal(mb.find((m) => m.address.startsWith('edu@')).state, 'live');
  assert.equal(mb.find((m) => m.address.startsWith('training@')).state, 'parked');
});

test('the record holds no credential values and every claimed state carries its date and source', () => {
  const raw = JSON.stringify(Object.values(CFG.channels).map((d) => d.record || null));
  assert.doesNotMatch(raw, /[A-Za-z0-9]{24,}/, 'nothing secret-shaped');
  assert.doesNotMatch(raw, /sk_|Bearer |token=/i);
  for (const [id, d] of Object.entries(CFG.channels)) {
    if (!d.record) continue;
    for (const k of ['productionConfigured', 'liveVerified', 'access']) {
      const x = d.record[k];
      if (['not_needed', 'not_applicable'].includes(x.state)) continue;
      assert.ok(x.seen && x.source, id + ' ' + k);
    }
  }
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

// Q28 (05.10.2026, the owner: "Make the things that are this small, as this table, be in the center if
// the page on a white card. Match the overall design.")
test('Q28: the Channels list is one centred card under the shared cards rule, light and dark', () => {
  assert.match(APP, /html\.ui-c \.c-sheet\.c-chcard\{max-width:640px;margin:0 auto 16px\}/, 'centred');
  for (const theme of [':not([data-theme="dark"])', '[data-theme="dark"]']) {
    const i = APP.indexOf('html.ui-c' + theme + ' #view :is(');
    assert.ok(i > 0 && APP.slice(i, APP.indexOf('{', i)).includes('.c-sheet'), 'the cards rule covers it: ' + theme);
  }
  assert.doesNotMatch(APP, /\.c-chcard\{[^}]*(background|box-shadow|border-radius)/, 'no card rule of its own');
});
