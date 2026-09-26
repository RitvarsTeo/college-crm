// Inbound -> Warm -> Hot, clarified with Aigars 23.09.2026.
//
// Half of these tests assert that something is STILL UNDECIDED. That is the
// point: an invented threshold is worse than an absent one, so the absence has
// to be defended by a test, or the next session will helpfully fill it in.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signalsIn, suggestQualification } from '../src/extract.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));
const PROVIDERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'providers.json'), 'utf8'));
const ARCH = fs.readFileSync(path.join(ROOT, 'docs', 'INBOUND_ARCHITECTURE.md'), 'utf8');

const level = (id) => CONFIG.qualification.levels.find((l) => l.id === id);

// ------------------------------------------------------------- the ladder ---

test('the ladder is two states, not three', async () => {
  assert.deepEqual(CONFIG.qualification.levels.map((l) => l.id), ['unclear', 'lead']);
  assert.equal(CONFIG.qualification.default, 'unclear', 'everything arrives unclear');
  assert.match(CONFIG.qualification._note, /read as jargon/i,
    'the record has to say why raw/warm/hot was dropped');
});

test('an unclear contact is explicitly NOT a lead', async () => {
  assert.equal(level('unclear').isLead, false, '"Hi" is a contact, not a lead');
  assert.equal(level('lead').isLead, true);
});

test('Marketing keeps the unclear ones; every lead is Admissions work', async () => {
  assert.equal(level('unclear').owner, 'Marketing');
  assert.equal(level('lead').owner, 'Admissions');
  for (const l of CONFIG.qualification.levels) {
    assert.ok(CONFIG.owners.includes(l.owner), l.id + ' is owned by a role that does not exist');
  }
});

test('a confirmed interest routes to Admissions, whatever the question was about', async () => {
  assert.equal(CONFIG.routing.lead, 'Admissions');
  assert.equal(CONFIG.routing.unclear, 'Marketing');
  assert.match(CONFIG.routing._note, /Marketing is NOT a second admissions desk/i);
  assert.match(CONFIG.routing._note, /documents or price/i,
    'the correction that prompted this has to be recorded');
});

// -------------------------------------- the things that must stay undecided --

test('the threshold is PROVISIONAL and is never presented as agreed', async () => {
  const t = CONFIG.qualification.warmToHotThreshold;
  assert.match(t.status, /PROVISIONAL/);
  assert.match(t.status, /NOT a final business rule/i);
  assert.match(CONFIG.qualification._warmToHotThreshold, /PROVISIONAL/);
});

test('the threshold is data, so it can be changed without touching the machine', async () => {
  const EXTRACT = fs.readFileSync(path.join(ROOT, 'src', 'extract.js'), 'utf8');
  const rule = EXTRACT.slice(EXTRACT.indexOf('export function suggestQualification'),
    EXTRACT.indexOf('// Obvious junk never reaches'));
  for (const hardcoded of ['>= 2', 'programme &&', 'supporting >= 2']) {
    assert.ok(!rule.includes(hardcoded), 'the rule must not hardcode: ' + hardcoded);
  }
  assert.match(rule, /rule\?\.leadWhen/, 'it reads the shape from the config');
});

test('changing the config really changes the machine', async () => {
  const sig = signalsIn("I want to study Navigation, I finished secondary school, starting next year");
  assert.equal(suggestQualification(sig, CONFIG.qualification.warmToHotThreshold), 'lead');
  // demand contact details as well, with no code change, and the same message demotes
  assert.equal(suggestQualification(sig, { leadWhen: { requireAll: ['programme', 'contact'] } }), 'unclear');
});

test('the pipeline stage list has not been quietly rewritten as the ladder', async () => {
  const stages = CONFIG.stages.map((s) => s.id);
  for (const id of ['unclear', 'lead', 'raw', 'warm', 'hot']) {
    assert.ok(!stages.includes(id), 'qualification leaked into the stage list: ' + id);
  }
  assert.match(CONFIG.qualification._note, /separate from the pipeline stage list/i);
});

test('the ageing rule is the decided one: next day at 09:00', async () => {
  assert.equal(CONFIG.ageing.rule, 'next calendar day at 09:00');
  assert.equal(CONFIG.ageing.hour, 9);
  assert.ok(CONFIG.ageing.timezone, 'it needs a timezone or 09:00 means nothing');
});

// ------------------------------------------------- notifications, the point --

test('an unclear contact never notifies Admissions', async () => {
  assert.ok(!CONFIG.notifications.unclear.notify.includes('Admissions'),
    'thirty "Hi" messages must produce zero notifications for Ieva');
  assert.deepEqual(CONFIG.notifications.lead.notify, ['Admissions']);
});

test('an unclear contact is still visible to somebody, so it cannot disappear', async () => {
  assert.ok(CONFIG.notifications.unclear.visibleTo.includes('Marketing'),
    'no notification is not the same as no visibility');
});

// ---------------------------------------------- what never enters the queue --

test('obvious junk is filtered before the queue, and the rule says so', async () => {
  assert.equal(CONFIG.intakeFilter.dropBeforeQueue, true);
  assert.ok(CONFIG.intakeFilter.spamWords.length > 4);
  assert.match(CONFIG.intakeFilter._note, /is NOT junk and does still enter the queue/i,
    'a plain "Hi" from a person must be explicitly protected from the filter');
});

// -------------------------------------------- the machine must not invent ----

test('an extracted field is not reportable until a human confirms it', async () => {
  const by = Object.fromEntries(CONFIG.fieldProvenance.levels.map((l) => [l.id, l]));
  assert.equal(by.extracted.reportable, false,
    'an unconfirmed machine guess must never become a statistic');
  assert.equal(by.confirmed.reportable, true);
  assert.equal(by.typed.reportable, true);
  assert.equal(by.provider.reportable, true);
  assert.equal(by.operator.reportable, true);
});

test('every provenance level says in plain words where the value came from', async () => {
  for (const l of CONFIG.fieldProvenance.levels) {
    assert.ok(l.what && l.what.length > 15, l.id + ' needs a plain explanation');
    assert.equal(typeof l.reportable, 'boolean', l.id + ' must say whether it can be reported on');
  }
});

// ----------------------------------------------------------------- storage ---

test('V1 does not store conversation bodies, and says what that costs', async () => {
  assert.equal(CONFIG.inboundStorage.storeMessageBodies, false);
  assert.match(CONFIG.inboundStorage._storeMessageBodies, /uncheckable/,
    'the cost of not keeping the body has to be recorded, not glossed over');
  assert.match(ARCH, /An extraction error becomes uncheckable/);
});

test('what IS stored covers identity, source, time, thread key and who processed it', async () => {
  for (const f of ['identity', 'source_channel', 'timestamp', 'thread_key', 'qualification',
    'extracted_fields', 'operator_notes', 'processed_by', 'next_action', 'owner', 'audit']) {
    assert.ok(CONFIG.inboundStorage.store.includes(f), 'inbound storage is missing ' + f);
  }
});

// --------------------------------------------------------------- extension ---

test('the browser extension is not a V1 component', async () => {
  assert.equal(CONFIG.browserExtension.requiredForV1, false);
  assert.match(CONFIG.browserExtension._note, /not designed around it/i);
  assert.match(ARCH, /\*\*Demoted\.\*\* Not a V1 component/);
});

// ---------------------------------------------------------------- LinkedIn ---

test('LinkedIn is recorded as a real channel with zero research, and is kept out of the researched config', async () => {
  const li = CONFIG.unresearchedChannels.find((c) => c.id === 'linkedin');
  assert.ok(li, 'LinkedIn was named in the workflow and must be recorded somewhere');
  assert.match(li.research, /NONE/);
  assert.ok(!PROVIDERS.channels.some((c) => /linked/i.test(c.id)),
    'LinkedIn must NOT be in the researched provider config, because no research has been done');
});

test('the researched channel config still holds only channels that were researched', async () => {
  for (const c of PROVIDERS.channels) {
    assert.ok(c.research && c.research.canReceive, c.id + ' claims a place in the researched config');
  }
});

// ------------------------------------------- the documented flow stays honest --

test('the architecture keeps both rules, not just the first one', async () => {
  assert.match(ARCH, /A machine may SORT\. Only a person may DISCARD/);
  assert.match(ARCH, /A contact is not a lead/);
});

test('the architecture doc says what was superseded instead of quietly replacing it', async () => {
  assert.match(ARCH, /SUPERSEDED IN PART/);
  assert.match(ARCH, /RAW \/ WARM \/ HOT ladder below was dropped/);
  assert.match(ARCH, /Not clear yet/);
  assert.match(ARCH, /no longer true\s+>?\s*for message bodies|no longer true for message/,
    'the earlier "everything is stored, always" claim must be visibly withdrawn');
});

test('the three worked examples are all present, including the one that notifies nobody', async () => {
  assert.match(ARCH, /### A\. "Hi"/);
  assert.match(ARCH, /\*\*No notification to Admissions\. None\.\*\*/);
  assert.match(ARCH, /MISSING, AND SAID SO ON THE SCREEN/,
    'example C has to show what is missing rather than blocking creation');
});
