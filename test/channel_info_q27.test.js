// Q27 (05.10.2026). The owner: "Also put the SIS status (not as channel) but we have to see that its
// connecetd also with apply and evrythin, the statuses, all good. Also have informaiton on cards about
// the filtration of the channels and phone call frequency. Some good info, interesting, not
// overwhelming, informing in a good way, not in paragraphgs, ok?"
// Built as an A/B behind ?chinfo=a|b; without it the screen is the one-line list, unchanged.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { SIS_STAGE } from '../src/sync.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'channels.json'), 'utf8'));
const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const START = '// ============================================ CHANNEL MODEL (Session 3, 02.10) ==';
const END = '// ================================================== end of the channel model ==';
const BLOCK = APP.slice(APP.indexOf(START), APP.indexOf(END));

function sandbox() {
  const ctx = { esc: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') };
  vm.runInNewContext(BLOCK + `
    this.riga = chRiga; this.when = chWhen; this.facts = chFacts; this.sis = chSisFacts; this.info = chInfoHtml;
    this.list = chListHtml;`, ctx);
  return ctx;
}
const LOCAL = { name: 'local', isProduction: false };
const PROD = { name: 'production', isProduction: true };

function apiRows(over = {}) {
  return Object.entries(CFG.channels).map(([id, d]) => ({ channel: id, label: d.label, direction: d.direction,
    lifecycle: d.lifecycle || 'active', ownerPerson: d.ownerPerson || null, filters: d.filters || [],
    events: 0, filtered: 0, lastEventAt: null, record: d.record || null, ...(over[id] || {}) }))
    .concat([{ channel: 'sis', label: 'SIS', isIntegration: true, allSettingsPresent: true, mode: 'live', ...(over.sis || {}) }]);
}
const CTX = (o = {}) => ({ schedule: CFG.schedule, filtersAll: CFG.filtersAll,
  sis: { stages: SIS_STAGE, events: 0, record: CFG.integrations.sis.record }, runs: {}, ...o });
const byId = (rows, id) => rows.find((r) => r.channel === id);

test('Q27: the pull times are the crons in vercel.json, nothing typed twice', () => {
  const cron = Object.fromEntries((VERCEL.crons || []).map((c) => [c.path, c.schedule]));
  assert.equal(CFG.schedule.phone, cron['/api/cron/pbx-calls']);
  assert.equal(CFG.schedule.gmail, cron['/api/cron/gmail-poll']);
  assert.equal(CFG.schedule.sis, cron['/api/cron/sis-sync']);
  assert.equal(CFG.schedule.lead_answers, cron['/api/cron/lead-answers']);
});

test('Q27: times are shown in Riga, summer and winter', () => {
  const s = sandbox();
  assert.equal(s.riga('15 5 * * *', new Date('2026-10-05T12:00:00Z')), '08:15', 'EEST, UTC+3');
  assert.equal(s.riga('15 5 * * *', new Date('2026-12-05T12:00:00Z')), '07:15', 'EET, UTC+2');
  assert.equal(s.riga('*/5 * * * *'), null, 'a shape it cannot read is not guessed');
  assert.equal(s.when('2026-10-04T05:27:20Z'), '04.10 08:27');
});

test('Q27: every active channel names its own filter rules; the junk words are said once for all', () => {
  assert.deepEqual(CFG.filtersAll, ['Sales pitches']);
  for (const [id, d] of Object.entries(CFG.channels)) {
    if ((d.lifecycle || 'active') !== 'active') continue;
    assert.ok(Array.isArray(d.filters), id);
    assert.ok(!d.filters.includes('Sales pitches'), id + ' does not repeat the rule for every channel');
  }
  assert.ok(CFG.channels.phone.filters.length && CFG.channels.gmail.filters.length && CFG.channels.mailchimp.filters.length);
});

test('Q27: production figures come from the rows and the run record; locally from the dated snapshot', () => {
  const s = sandbox();
  const prodRows = apiRows({ gmail: { events: 120, filtered: 30 } });
  const runs = { gmail: { at: '2026-10-06T05:35:00Z' }, pbx_until: { at: '2026-10-06T05:27:00Z' }, phone: { at: '2026-09-29T13:28:48Z' } };
  const p = s.facts(byId(prodRows, 'gmail'), PROD, CTX({ runs }));
  assert.deepEqual({ ...p.counts }, { received: 120, filtered: 30, asOf: null, inbox: 90 });
  assert.equal(p.pull, 'Daily 08:30');
  assert.equal(s.facts(byId(prodRows, 'phone'), PROD, CTX({ runs })).last, '06.10 08:27', 'the daily catch-up, not the old first run');
  const l = s.facts(byId(apiRows(), 'gmail'), LOCAL, CTX());
  assert.deepEqual({ ...l.counts }, { received: 98, filtered: 24, asOf: '2026-10-04', inbox: 74 });
  const w = s.facts(byId(apiRows(), 'website'), LOCAL, CTX());
  assert.equal(w.pull, 'Instant');
  assert.equal(w.pullSub, 'on arrival');
  const h = s.facts(byId(apiRows(), 'in_person'), LOCAL, CTX());
  assert.equal(h.counts, null, 'typed in by staff: nothing to count');
  assert.equal(h.pullSub, null);
});

test('Q27: SIS stands apart: the chain to apply, how its statuses map, and all good or not', () => {
  const s = sandbox();
  const f = s.sis(apiRows(), LOCAL, CTX());
  assert.deepEqual([...f.chain], ['apply.novikontas.org', 'SIS', 'Intake']);
  const map = Object.fromEntries(f.map.map((m) => [m.to, [...m.from]]));
  assert.deepEqual(map, { Application: ['registered', 'started', 'submitted'], Admitted: ['admitted', 'matriculated'] });
  assert.equal(f.pull, 'Daily 08:00');
  assert.equal(f.ok, true, 'the recorded pull was fine');
  const fresh = new Date(Date.now() - 3600e3).toISOString();
  assert.equal(s.sis(apiRows(), PROD, CTX({ runs: { sis: { at: fresh, detail: {} } } })).ok, true);
  const stale = new Date(Date.now() - 30 * 3600e3).toISOString();
  assert.equal(s.sis(apiRows(), PROD, CTX({ runs: { sis: { at: stale } } })).ok, false, 'a pull older than a day is not all good');
  assert.equal(s.sis(apiRows({ sis: { mode: 'off' } }), PROD, CTX({ runs: { sis: { at: fresh } } })).ok, false);
});

test('Q27: A and B carry the twelve channels and SIS, in figures and labels, never a paragraph', () => {
  const s = sandbox();
  for (const v of ['a', 'b']) {
    const out = s.info(apiRows(), LOCAL, CTX(), v);
    assert.equal((out.match(/<li>/g) || []).length, 12, v);
    assert.match(out, /apply\.novikontas\.org/, v);
    assert.match(out, />SIS</, v);
    assert.match(out, /Sales pitches &middot; every channel/, v);
    assert.doesNotMatch(out, /<p[\s>]/, v + ': no paragraphs');
    const texts = out.replace(/<[^>]+>/g, '\n').replace(/&[a-z]+;/g, '·').split('\n').map((x) => x.trim()).filter(Boolean);
    for (const t of texts) assert.ok(t.length <= 45, v + ' says too much in one place: ' + t);
    assert.doesNotMatch(out, /Blocked/, v);
  }
  assert.match(s.info(apiRows(), LOCAL, CTX(), 'a'), /<details>/, 'A: each line opens its small card');
  const b = s.info(apiRows(), LOCAL, CTX(), 'b');
  assert.ok(b.indexOf('chsis') < b.indexOf('chinfo'), 'B: the SIS strip sits on top');
});

test('Q27: without ?chinfo the screen is the one-line list, as before', () => {
  const view = APP.slice(APP.indexOf('async function viewChannels('), APP.indexOf(END));
  assert.match(view, /if \(info === 'a' \|\| info === 'b'\)/);
  assert.match(view, /<div class="c-sheet c-chcard">\$\{chListHtml\(/);
});
