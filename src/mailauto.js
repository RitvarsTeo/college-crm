// ACADEMY EMAIL AUTOMATION (24.11.2026). The owner: "Email part we need automated ... girls go from intake and make a
// double work"; "At first just read and learn the answers. But messages should be read incoming and outgoing, so intake
// knows the whole convo"; "Intake, at this level understands, what is done, that is done and can automatically mark it in
// intake with according level of engagement with the lead." His picks (24.11.2026, through MASTER CONTROL):
//   1. edu@ replying in Gmail processes the card itself: onto the known person, or a new lead; the card leaves Waiting.
//   2. The stage follows the conversation, forward only: edu@ replied -> Contacted; they wrote back -> Follow-up.
//      Application and Admitted come from the SIS only. A stage somebody set by hand after that email is never changed.
//      Admitted and Not proceeding are never touched. Every move: "set by Intake from the email of <date>", Undo.
//   3. The programme the email names fills the lead (the extracted 'interest', confirmed).
//   4. We replied and nobody has a next step: "Follow up" seven days after our reply.
//   6. A suggested reply on a waiting email card, from the answers edu@ gave to questions like it. Copied by staff;
//      Intake NEVER sends or drafts an email.
// Nothing here sends anything to anybody.
import { logEvent, MANUAL, AUTOMATIC } from './history.js';
import { qualify, activePersonFor, bringBack } from './intake.js';
import { emailBodyFor } from './emailtext.js';

export const BY = 'Intake';
export const LADDER = ['New', 'Contacted', 'Follow-up'];
export const FOLLOW_UP = 'Follow up';
export const SILENCE_DAYS = 7;
const EMAIL = ['gmail', 'email'];
const nowIso = () => new Date().toISOString();
/** "24.11" in Riga time */
export function dm(iso) {
  const o = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Riga', day: '2-digit', month: '2-digit' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${o.day}.${o.month}`;
}
export const FROM_EMAIL = (iso) => `set by Intake from the email of ${dm(iso)}`;

// what they asked about, in plain words, for the History line ("He wrote back and asked about the price")
const TOPICS = [
  ['documents', /dokument|document|pase|passport|izziņ|certificate of education|diplom/i],
  ['the start date', /kad sāk|sākas|start date|when (does|do|will) .*start|janvār|septembr|september|january/i],
  ['the price', /cik maksā|maksa|price|cost|tuition|fee|pa daļām|instal/i],
  ['the dormitory', /kopmītn|dormitor|hostel|accommodation|dzīvesviet/i],
  ['English', /angļu|english|ielts|toefl/i],
  ['applying', /pieteik|apply|application|uzņem|admission|enrol/i],
];
export function topicOf(text) {
  const t = TOPICS.find(([, r]) => r.test(String(text || '')));
  return t ? t[0] : null;
}

const openTasks = async (db, pid) => Number((await db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE person_id = ? AND done_at IS NULL').get(pid)).n);
const plusDays = (iso, d) => new Date(Date.parse(iso) + d * 86400000).toISOString();

/** Pick 2: forward only along New -> Contacted -> Follow-up, never over a stage set by hand after the email. */
export async function stageFromMail(db, personId, to, { emailAt, why = '', at = nowIso() } = {}) {
  const p = await db.prepare('SELECT status FROM people WHERE id = ?').get(personId);
  if (!p) return { moved: false, why: 'no such person' };
  const from = p.status, i = LADDER.indexOf(from), j = LADDER.indexOf(to);
  if (i < 0 || j <= i) return { moved: false, why: 'forward only' };
  const hand = await db.prepare(`SELECT occurred_at FROM events WHERE person_id = ? AND kind = 'status' AND origin = 'manual'
    AND COALESCE(actor, '') <> ? ORDER BY occurred_at DESC LIMIT 1`).get(personId, BY);
  if (hand && Date.parse(hand.occurred_at) > Date.parse(emailAt)) return { moved: false, why: 'set by hand after the email' };
  await db.prepare('UPDATE people SET status = ? WHERE id = ?').run(to, personId);
  await logEvent(db, { personId, kind: 'status', direction: 'note', at, origin: AUTOMATIC, actor: BY,
    subject: `Status: ${from} -> ${to}`, body: [FROM_EMAIL(emailAt) + '.', why].filter(Boolean).join(' '),
    field: 'status', oldValue: from, newValue: to });
  return { moved: true, from, to };
}

/** Pick 4: a person we replied to with no next step gets "Follow up" seven days after the reply. */
export async function followUpAfterReply(db, personId, sentAt, at = nowIso()) {
  if (await openTasks(db, personId)) return { added: false };
  const p = await db.prepare('SELECT owner, status FROM people WHERE id = ?').get(personId);
  if (!p || !LADDER.includes(p.status)) return { added: false };
  const due = plusDays(sentAt, SILENCE_DAYS);
  await db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)').run(personId, FOLLOW_UP, due, p.owner || 'Admissions', at);
  await logEvent(db, { personId, kind: 'task', direction: 'note', at, origin: AUTOMATIC, actor: BY,
    subject: `Next step: ${FOLLOW_UP}`, body: `We replied ${dm(sentAt)}; due ${dm(due)} if there is no answer - set by Intake` });
  return { added: true, due };
}

/** Pick 1: a waiting email card edu@ answered becomes a lead by itself: onto the known person, else a new one. */
export async function processCard(db, card, sentAt, at = nowIso()) {
  const known = card.person_id || await activePersonFor(db, { email: card.contact_email });
  const interest = (await db.prepare(`SELECT value FROM field_values WHERE inbound_id = ? AND field = 'interest' ORDER BY id DESC`).get(card.id) || {}).value;
  const base = { qualification: 'lead', by: BY, note: `${FROM_EMAIL(sentAt)}: edu@ replied`,
    confirmFields: interest ? ['interest'] : [] };   // pick 3: the programme the email names
  const withStep = async (pid) => (pid && await openTasks(db, pid) ? {} : { nextAction: FOLLOW_UP, nextActionDue: plusDays(sentAt, SILENCE_DAYS) });
  let r = await qualify(db, card.id, known ? { ...base, personId: known, ...(await withStep(known)) } : { ...base, createPerson: true, ...(await withStep(null)) });
  // somebody like them is already in Intake: only ONE strong match is taken; otherwise the card waits for a person
  if (r && r.duplicate) {
    if (!r.strong || (r.matches || []).length !== 1) return { processed: false, why: 'somebody like them is already in Intake; a person decides' };
    const one = r.matches[0].id;
    r = await qualify(db, card.id, { ...base, personId: one, ...(await withStep(one)) });
  }
  if (!r || r.error) return { processed: false, why: r ? r.error : 'not processed' };
  const row = await db.prepare('SELECT person_id FROM inbound WHERE id = ?').get(card.id);
  return { processed: true, personId: row ? row.person_id : null, created: !known };
}

// ---------------------------------------------------- 5. willing to study --
// The owner's pick 24.11.2026: "Yes, add 5, but with a filter, is it someone willing to study?", then "Yes, include 5"
// on the list below (College CRM/_pictures/email_rescue_criteria_2026-11-24.html; tested on every such email since
// 01.10.2026). An email the Inbox SET ASIDE AUTOMATICALLY that edu@ then answered comes back only when ALL are true:
// a private mailbox (not no-reply/system), and the person asks about studying at the Academy. A set-aside made by a
// person stays as they chose (it is never 'filtered'). Never: an invoice, a CV or job application, a refund or
// withdrawal request, a school visit or meeting, a current student matter, or only a short course (Training Centre).
// exported for the Training Centre's email (patch 172, src/tcmailauto.js): the same lists, one place
export const PRIVATE = /@(gmail\.com|googlemail\.com|inbox\.lv|one\.lv|apollo\.lv|outlook\.(com|lv)|hotmail\.\w+|live\.\w+|yahoo\.\w+|icloud\.com|me\.com|mail\.ru|bk\.ru|list\.ru|yandex\.\w+|ukr\.net|i\.ua|gmx\.\w+|web\.de|proton(mail)?\.\w+|aol\.com|tvnet\.lv|wp\.pl|o2\.pl|interia\.pl|seznam\.cz)$/i;
export const SYSTEM_SENDER = /(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notification|newsletter)/i;
const NEVER = [
  [/rēķin|parād|invoice|sąskait|payment reminder/i, 'an invoice'],
  [/attached cv|curriculum vitae|position\s*[—(-]|vacanc|vakanc|motorman/i, 'a CV or job application'],
  [/request (for|to)( a)? refund|refund of( my)? fees|refund due to|withdraw from|cancel(l)?ing my studies|atmaksāt/i, 'a refund or withdrawal'],
  [/ekskursij|excursion|sanāksm|kopsapulc|association/i, 'a visit or meeting'],
  [/\bsis\b|participant list|lecture|lekcij|sick leave|confirmation of arrival|canvas|password/i, 'a current student matter'],
];
const PROSPECT = /programm|admission|uzņem|eligib|prospective|pre-application|enquiry about|inquiry about|studēt|vēlos mācīties|interested (in|to) (study|this)|place here/i;
const STUDY_Q = /stud(y|ies)|mācīt|mācīb|pieteik|apply|enrol|navig|marine engineer|dokument|tuition|cik maksā|kopmītn|dormitor|english (test|level)/i;
const SHORT_COURSE = /\bstcw\b|\bgwo\b|\bopito\b|certificat|sertifik|exam|eksām|log ?book|banksman|initial training/i;
/** { back, why } - is this an email from somebody willing to study? */
export function willingToStudy({ email, text }) {
  const e = String(email || '').trim(), q = String(text || '');
  if (!PRIVATE.test(e)) return { back: false, why: 'not a private mailbox' };
  if (SYSTEM_SENDER.test(e)) return { back: false, why: 'a system sender' };
  for (const [r, w] of NEVER) if (r.test(q)) return { back: false, why: w };
  if (PROSPECT.test(q)) return { back: true, why: 'a study question' };
  if (SHORT_COURSE.test(q)) return { back: false, why: 'a short course (Training Centre)' };
  if (STUDY_Q.test(q)) return { back: true, why: 'a study question' };
  return { back: false, why: 'no study question' };
}
async function textOf(db, card) {
  if (String(card.body || '').trim()) return card.body;
  const lines = await db.prepare(`SELECT body FROM inbound_line WHERE inbound_id = ? AND body IS NOT NULL AND kind <> 'reply' ORDER BY seq`).all(card.id);
  return lines.map((l) => l.body).join('\n');
}

/** Called when one of OUR replies is read (the sent folder, or the reply joining its thread). */
export async function afterOurReply(db, { inboundId = null, personId = null, sentAt, at = nowIso() } = {}) {
  if (!sentAt) return { done: false };
  let pid = personId || null, processed = null;
  if (inboundId) {
    let card = await db.prepare('SELECT id, state, channel, person_id, contact_email, received_at, body, processed_by FROM inbound WHERE id = ?').get(Number(inboundId));
    // 5: set aside automatically, answered by edu@, and somebody willing to study -> back, then processed like any card
    if (card && card.state === 'filtered' && card.processed_by === 'machine' && EMAIL.includes(card.channel)
      && Date.parse(sentAt) > Date.parse(card.received_at) && willingToStudy({ email: card.contact_email, text: await textOf(db, card) }).back) {
      const back = await bringBack(db, card.id, { by: BY, at });
      if (back && !back.error) card = { ...card, state: 'new' };
    }
    if (card && card.state === 'new' && EMAIL.includes(card.channel) && Date.parse(sentAt) > Date.parse(card.received_at)) {
      processed = await processCard(db, card, sentAt, at);
      if (processed.personId) pid = processed.personId;
    } else if (card && card.person_id) pid = pid || card.person_id;
  }
  if (!pid) return { done: false, processed };
  const stage = await stageFromMail(db, pid, 'Contacted', { emailAt: sentAt, why: 'We replied.', at });
  const step = await followUpAfterReply(db, pid, sentAt, at);
  return { done: true, personId: pid, processed, stage, step };
}

/** Called when a known person's email lands on their profile: after a reply of ours, they wrote back -> Follow-up. */
export async function afterTheirAnswer(db, { personId, at, body = '' } = {}) {
  if (!personId || !at) return { moved: false };
  const ids = (await db.prepare(`SELECT id FROM inbound WHERE person_id = ? AND channel IN ('gmail', 'email')`).all(personId)).map((r) => Number(r.id));
  const ours = await db.prepare(`SELECT MAX(sent_at) AS t FROM mail_sent WHERE COALESCE(direction, 'out') = 'out' AND sent_at < ?
    AND (person_id = ?${ids.length ? ` OR inbound_id IN (${ids.map(() => '?').join(',')})` : ''})`).get(at, personId, ...ids);
  if (!ours || !ours.t) return { moved: false, why: 'we have not replied' };
  const topic = topicOf(body);
  return stageFromMail(db, personId, 'Follow-up', { emailAt: at, why: topic ? `They wrote back and asked about ${topic}.` : 'They wrote back.', at: nowIso() });
}

// ------------------------------------------------------------------- Undo --
/** Undo one stage move Intake made: back to where it was, while the person is still where Intake put them. */
export async function undoStage(db, personId, eventId, by, at = nowIso()) {
  if (!by) return { error: 'who is undoing this?' };
  const e = await db.prepare(`SELECT id, old_value, new_value FROM events WHERE id = ? AND person_id = ? AND kind = 'status'
    AND origin = 'automatic' AND actor = ?`).get(Number(eventId), personId, BY);
  if (!e) return { error: 'not a stage Intake set' };
  const p = await db.prepare('SELECT status FROM people WHERE id = ?').get(personId);
  if (!p || p.status !== e.new_value) return { error: 'the stage has changed since; change it by hand' };
  await db.prepare('UPDATE people SET status = ? WHERE id = ?').run(e.old_value, personId);
  await logEvent(db, { personId, kind: 'status', direction: 'note', at, origin: MANUAL, actor: by,
    subject: `Status: ${e.new_value} -> ${e.old_value}`, body: 'Undo of the stage Intake set from the email',
    field: 'status', oldValue: e.new_value, newValue: e.old_value });
  return { ok: true, status: e.old_value };
}

/** Undo a card Intake processed: the card waits again. A person Intake made from it, that nobody has worked on since,
 *  is taken away again; a person who was already there keeps everything else. */
export async function undoCard(db, inboundId, by, at = nowIso()) {
  if (!by) return { error: 'who is undoing this?' };
  const card = await db.prepare(`SELECT id, state, person_id, processed_by FROM inbound WHERE id = ?`).get(Number(inboundId));
  if (!card || card.state !== 'qualified' || card.processed_by !== BY) return { error: 'not a card Intake processed' };
  const pid = card.person_id;
  const made = pid ? await db.prepare(`SELECT 1 AS x FROM events WHERE person_id = ? AND kind = 'create' AND actor = ?`).get(pid, BY) : null;
  const others = pid ? await db.prepare(`SELECT COUNT(*) AS n FROM events WHERE person_id = ? AND origin = 'manual' AND COALESCE(actor, '') <> ?`).get(pid, BY) : { n: 0 };
  const otherCards = pid ? await db.prepare(`SELECT COUNT(*) AS n FROM inbound WHERE person_id = ? AND id <> ?`).get(pid, card.id) : { n: 0 };
  if (made && (Number(others.n) || Number(otherCards.n))) return { error: 'somebody has worked on this person since; set them aside by hand' };
  return db.transaction(async (tx) => {
    await tx.prepare(`UPDATE inbound SET state = 'new', qualification = NULL, person_id = NULL, processed_by = NULL, processed_at = NULL WHERE id = ?`).run(card.id);
    if (made) {
      // what this step wrote goes (the same way the SIS merge removes a record, src/sync.js); anything else that points
      // at the person is unlinked, never deleted
      for (const t of ['events', 'tasks', 'field_values', 'consents', 'lifecycle_events']) await tx.prepare(`DELETE FROM ${t} WHERE person_id = ?`).run(pid);
      for (const t of ['mail_sent', 'documents', 'registrations', 'sim_events', 'pbx_calls', 'sis_applicants']) {
        await tx.prepare(`UPDATE ${t} SET person_id = NULL WHERE person_id = ?`).run(pid);
      }
      await tx.prepare('DELETE FROM people WHERE id = ?').run(pid);
    } else if (pid) {
      await logEvent(tx, { personId: pid, kind: 'note', direction: 'note', at, origin: MANUAL, actor: by,
        subject: 'Undo: the email card is back in the Inbox', body: '' });
    }
    return { ok: true, removedPerson: Boolean(made) };
  });
}

// --------------------------------------------------------- suggested reply --
// Pick 6 ("lets try it already, if you have this many samples!"): the answer edu@ gave to the most similar earlier
// question, read from what is already kept (an email card and the first reply in its conversation; the 13-month
// retention empties both on time, so nothing is kept twice). The greeting with the other person's name, the signature
// and the quoted earlier mail are cut. Shown on a waiting card to copy into Gmail; never sent, never drafted.
const STOP = new Set('un vai ir es ka par uz no ar kā kas lai to tas man jūs jums labdien sveiki paldies the and is are to of for in on a an i you we my your me be it this that with can could would please hello hi dear good day thank thanks regards'.split(' '));
export const words = (t) => new Set(String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 7)));
export function cleanReply(text) {
  let t = String(text || '').replace(/\r\n/g, '\n');
  // the quoted earlier mail
  t = t.split(/\n(On .{5,120} wrote:|.{0,40}\d{4}.{0,40}rakstīja:|-{2,} ?Forwarded|From: )/)[0];
  t = t.split('\n').filter((l) => !/^\s*>/.test(l)).join('\n');
  // the signature
  t = t.split(/\n\s*(Ar cieņu|Sincerely|Best regards|Kind regards|Regards|С уважением|--\s*$)/i)[0];
  const lines = t.split('\n');
  // the greeting that names the other person
  while (lines.length && (/^\s*$/.test(lines[0]) || /^\s*(labdien|labrīt|sveik|dear|hello|hi|good (morning|day|afternoon|evening)|здравствуйте|добрый)\b/i.test(lines[0]))) lines.shift();
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
let PAIRS = null, PAIRS_AT = 0;
async function pairs(db) {
  if (PAIRS && Date.now() - PAIRS_AT < 10 * 60000) return PAIRS;
  const rows = await db.prepare(`SELECT i.id, i.channel, i.body AS q, p.programme,
      (SELECT m.body FROM mail_sent m WHERE m.inbound_id = i.id AND COALESCE(m.direction, 'out') = 'out' AND m.body IS NOT NULL
        AND m.sent_at > i.received_at ORDER BY m.sent_at LIMIT 1) AS a
    FROM inbound i LEFT JOIN people p ON p.id = i.person_id
    WHERE i.channel IN ('gmail', 'email') AND i.state IN ('qualified', 'archived') AND i.body IS NOT NULL`).all();
  PAIRS = rows.filter((r) => r.a).map((r) => ({ id: Number(r.id), programme: r.programme || null,
    q: words(emailBodyFor(r.channel, r.q)), a: cleanReply(emailBodyFor('gmail', r.a)) })).filter((r) => r.q.size && r.a.length >= 20);
  PAIRS_AT = Date.now();
  return PAIRS;
}
export const forgetPairs = () => { PAIRS = null; };
const MIN_SCORE = 0.12;
/** { text, like } for a waiting email card, or null when nothing earlier is close enough. */
export async function suggestedReply(db, inboundId) {
  const card = await db.prepare(`SELECT id, channel, body, state FROM inbound WHERE id = ?`).get(Number(inboundId));
  if (!card || card.state !== 'new' || !EMAIL.includes(card.channel)) return null;
  const want = words(emailBodyFor(card.channel, card.body));
  if (want.size < 2) return null;
  const prog = (await db.prepare(`SELECT value FROM field_values WHERE inbound_id = ? AND field = 'interest' ORDER BY id DESC`).get(card.id) || {}).value || null;
  const scored = (await pairs(db)).filter((p) => p.id !== card.id).map((p) => {
    let both = 0; for (const w of want) if (p.q.has(w)) both++;
    const s = both / (want.size + p.q.size - both) + (prog && p.programme === prog ? 0.05 : 0);
    return { s, p };
  }).filter((x) => x.s >= MIN_SCORE).sort((a, b) => b.s - a.s);
  if (!scored.length) return null;
  return { text: scored[0].p.a, like: scored.length };
}
