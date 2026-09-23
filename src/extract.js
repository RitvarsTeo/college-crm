// The machine half of the intake.
//
// It may detect intent, pull structured information out of what somebody actually
// wrote, and SUGGEST a qualification. It may not invent. Every value it produces
// carries where it came from, and anything it read out of a message is marked
// `extracted`, which means "a suggestion nobody has confirmed" and is excluded
// from every count until a human agrees with it.
//
// Deterministic on purpose: the same message always produces the same result, so
// the rule can be tested instead of believed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

export const PROVENANCE = ['typed', 'provider', 'extracted', 'confirmed', 'operator'];
export const REPORTABLE = new Set(
  (CFG.fieldProvenance?.levels || []).filter((l) => l.reportable).map((l) => l.id));

// ---------------------------------------------------------------- vocabulary --
// The programme names the college actually offers, plus the words people really
// use for them. Nothing is guessed: if a message does not contain one of these,
// the interest is MISSING, not assumed.
const PROGRAMME_WORDS = {
  NAV: ['navigation', 'navigācija', 'navigacija', 'deck officer', 'kapteinis'],
  ENG: ['engineering', 'marine engineering', 'mehāniķis', 'mehanikis', 'engineer'],
  'MT OS': ['ordinary seaman', 'able seaman', 'matrozis'],
  'MT MR': ['ship repair', 'motorman'],
  'MT MTM': ['maintenance'],
  'MT WTT': ['wind turbine', 'vēja turbīnu', 'veja turbinu'],
};

const STUDY_INTENT = ['study', 'studies', 'studying', 'apply', 'application', 'enrol', 'enroll',
  'programme', 'program', 'course', 'studēt', 'studijas', 'pieteikties', 'mācīties'];

const START_WORDS = ['next year', 'this year', 'september', 'january', 'february', 'autumn', 'spring',
  'intake', 'nākamgad', 'septembr', 'janvār', 'rudens', 'start'];

const EDUCATION_WORDS = [
  ['secondary school', 'Secondary school'],
  ['high school', 'Secondary school'],
  ['finished school', 'Secondary school'],
  ['vidusskol', 'Secondary school'],
  ['maritime school', 'Maritime school'],
  ['jūrskol', 'Maritime school'],
  ['jurskol', 'Maritime school'],
];

const QUESTION_WORDS = {
  tuition: ['price', 'cost', 'how much', 'tuition', 'fee', 'cena', 'maksā'],
  documents: ['document', 'papers', 'certificate', 'dokument'],
  dates: ['deadline', 'when does', 'when do', 'termiņ'],
  information: ['more information', 'more info', 'tell me', 'can you tell', 'informācij', 'info'],
};

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(?:\+\d[\d\s().-]{6,}\d|\b[2-9]\d{7}\b)/;

const has = (text, words) => words.some((w) => text.includes(w));

// ------------------------------------------------------------------ signals --
// Six booleans. Everything else follows from them, so the rule is inspectable.
export function signalsIn(text) {
  const t = String(text || '').toLowerCase();
  let programme = null;
  for (const [code, words] of Object.entries(PROGRAMME_WORDS)) {
    if (has(t, words)) { programme = code; break; }
  }
  let education = null;
  for (const [word, value] of EDUCATION_WORDS) {
    if (t.includes(word)) { education = value; break; }
  }
  let question = null;
  for (const [kind, words] of Object.entries(QUESTION_WORDS)) {
    if (has(t, words)) { question = kind; break; }
  }
  return {
    programme: Boolean(programme), programmeValue: programme,
    study_intent: has(t, STUDY_INTENT),
    start: has(t, START_WORDS), startValue: has(t, START_WORDS) ? matchedStart(t) : null,
    education: Boolean(education), educationValue: education,
    question: Boolean(question), questionValue: question,
    contact: EMAIL_RE.test(t) || PHONE_RE.test(t),
  };
}

function matchedStart(t) {
  for (const w of START_WORDS) if (t.includes(w)) return w;
  return null;
}

// ------------------------------------------------------- the suggestion rule --
// Two states, not three. "Warm" and "Hot" read as jargon on screen, so the
// question the machine answers is simply: did they tell us what they want to
// study? If yes it is a LEAD and belongs to Admissions. If not, nobody can tell
// yet and it stays with Marketing.
//
// PROVISIONAL and CONFIGURABLE: the shape is read from
// config.qualification.warmToHotThreshold, nothing is written here. And whatever
// it says, this is a SUGGESTION - a person confirms the interest, and confirming
// it is what routes it.
export function suggestQualification(sig, rule = CFG.qualification.warmToHotThreshold) {
  const on = (name) => Boolean(sig[name]);
  const lead = rule?.leadWhen;
  if (lead && (lead.requireAll || []).every(on)) return 'lead';
  return 'unclear';
}

// Obvious junk never reaches the working queue. It is still stored, so nothing
// silently disappears, but nobody has to archive it by hand.
export function looksLikeJunk(text, cfg = CFG.intakeFilter) {
  if (!cfg?.dropBeforeQueue) return null;
  const t = String(text || '').toLowerCase();
  const hit = (cfg.spamWords || []).find((w) => t.includes(w));
  return hit ? { junk: true, matched: hit } : null;
}

// ------------------------------------------------------------------ extract --
// `provided` is whatever the provider itself handed over (a WhatsApp phone
// number, a lead-ad field). Those are `provider`. Anything read out of the
// message text is `extracted`. A field that is not there is not invented: it
// comes back in `missing`.
export function extractFrom({ channel, text, provided = {} }) {
  const sig = signalsIn(text);
  const fields = [];
  const add = (field, value, provenance) => {
    if (value === undefined || value === null || value === '') return;
    fields.push({ field, value: String(value), provenance });
  };

  for (const [field, value] of Object.entries(provided)) add(field, value, 'provider');

  const t = String(text || '');
  if (sig.programmeValue) add('interest', sig.programmeValue, 'extracted');
  if (sig.startValue) add('start', sig.startValue, 'extracted');
  if (sig.educationValue) add('education', sig.educationValue, 'extracted');
  if (sig.questionValue) add('question', sig.questionValue, 'extracted');
  if (!provided.email) {
    const m = t.match(EMAIL_RE);
    if (m) add('email', m[0], 'extracted');
  }
  if (!provided.phone) {
    const m = t.match(PHONE_RE);
    if (m) add('phone', m[0].replace(/[\s().-]/g, ''), 'extracted');
  }

  const present = new Set(fields.map((f) => f.field));
  const missing = (CFG.qualification.completionFields || [])
    .filter((f) => !present.has(f));

  const junk = looksLikeJunk(text);
  return {
    channel,
    signals: sig,
    fields,
    missing,
    junk: Boolean(junk),
    junkMatched: junk ? junk.matched : null,
    suggested: suggestQualification(sig),
    // the reason, in words, so a person can disagree with it on the screen
    why: junk ? `looks like a sales pitch ("${junk.matched}")` : explain(sig),
  };
}

function explain(sig) {
  const found = [];
  if (sig.programmeValue) found.push(`programme ${sig.programmeValue}`);
  if (sig.study_intent && !sig.programmeValue) found.push('study intent');
  if (sig.start) found.push('a start date');
  if (sig.education) found.push('education background');
  if (sig.question) found.push(`a ${sig.questionValue} question`);
  if (!found.length) return 'nothing about studying was mentioned';
  return 'found ' + found.join(', ');
}

// Only confirmed, typed, provider-given or operator-typed values are facts. An
// extracted value is a suggestion and must never reach a count or a report.
export const isReportable = (provenance) => REPORTABLE.has(provenance);
