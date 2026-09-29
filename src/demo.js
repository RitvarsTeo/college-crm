// The demo environment.
//
// Deliberately constructed, not random, and deliberately small. Somebody opening
// the CRM for the first time has to be able to read it in one screen, so this
// aims for "calm and obviously true" rather than "impressively full".
//
// Everything arrives through the real path: a provider-shaped payload goes to the
// adapter, through the filter, into the Inbox, and a person qualifies it. Nothing
// writes a finished state straight into a table, because a demo that fakes the
// end state proves nothing about the product.

import { adapt, toIntake } from './adapters.js';
import { buildPayload } from './scenarios.js';
import { receive, qualify, archive } from './intake.js';
import { logEvent, MANUAL } from './history.js';

const day = 86400000;
const ago = (days, hour = 10) => {
  const d = new Date(Date.now() - days * day);
  d.setUTCHours(hour, Math.floor(Math.random() * 50), 0, 0);
  return d.toISOString();
};

// Who the demo is about. Latvian and international names, because both walk
// through the door. Programmes and study forms match the real spread.
const CAST = [
  { name: 'Darja Semjonova', handle: '@darja.s', phone: '+37126554411', email: 'darja.semjonova@inbox.lv',
    channel: 'instagram', scenario: 'study_enquiry', programme: 'NAV', days: 0,
    outcome: 'lead', next: 'Call and establish interest' },
  { name: 'Kristaps Ozoliņš', phone: '+37126411900', email: 'kristaps.ozolins@inbox.lv',
    channel: 'website', scenario: 'study_enquiry', programme: 'ENG', days: 1,
    outcome: 'lead', next: 'Send the programme description' },
  { name: 'Emīls Baltputnis', phone: '+37120423829', email: 'emils.baltputnis@gmail.com',
    channel: 'whatsapp', scenario: 'programme_question', programme: 'MT WTT', days: 2,
    outcome: 'lead', next: 'Send the admission terms and the price' },
  { name: 'Anna Bērziņa', handle: 'in/anna-berzina',
    channel: 'linkedin', scenario: 'documents_question', programme: 'MT MR', days: 2,
    outcome: 'lead', next: 'Answer the question',
    note: 'LinkedIn: no email or phone yet. Tetiana has the original conversation.' },
  { name: 'Mārtiņš Ozols', phone: '+37129887766', email: 'martins.ozols@gmail.com',
    channel: 'messenger', scenario: 'study_enquiry', programme: 'NAV', days: 3,
    outcome: 'lead', next: 'Call and establish interest' },
  { name: 'Liene Kalniņa', phone: '+37127334455', email: 'liene.kalnina@inbox.lv',
    channel: 'open_day', scenario: 'study_enquiry', programme: 'NAV', days: 6,
    outcome: 'lead', next: 'Follow up after the visit', stage: 'Contacted' },
  { name: 'Arun Kumar', email: 'arun.kumar@example.in', phone: '+919876543210',
    channel: 'agent', scenario: 'study_enquiry', programme: 'NAV', days: 8,
    outcome: 'lead', next: 'Check the submitted documents', stage: 'Application' },
  { name: 'Raivis Bresis', phone: '+37128662447', email: 'raivis.bresis@gmail.com',
    channel: 'gmail', scenario: 'documents_question', programme: 'ENG', days: 11,
    outcome: 'lead', next: 'Prepare the study contract', stage: 'Contract' },
  { name: 'Marta Liepa', phone: '+37122110099', email: 'marta.liepa@gmail.com',
    channel: 'google_form', scenario: 'study_enquiry', programme: 'MT OS', days: 14,
    outcome: 'lead', next: 'Send the invoice', stage: 'Contract' },
  { name: 'Gatis Purmalis', phone: '+37126551234', email: 'gatis.purmalis@inbox.lv',
    channel: 'in_person', scenario: 'study_enquiry', programme: 'MT MTM', days: 30,
    outcome: 'lead', next: 'Medical certificate', stage: 'Admitted', overdue: true },

  // still unclear, and that is a legitimate place to be
  { name: 'Toms Bērziņš', handle: '@toms.b',
    channel: 'tiktok', scenario: 'unclear', days: 1,
    outcome: 'unclear', next: 'Call and establish interest',
    note: 'TikTok: Tetiana has the original conversation.' },
  { name: 'Elza Zariņa', email: 'elza.zarina@gmail.com',
    channel: 'mailchimp', scenario: 'study_enquiry', days: 4,
    outcome: 'unclear', next: 'Send the programme description' },
];

// Left in the Inbox on purpose, so there is work waiting when somebody opens it.
const WAITING = [
  { channel: 'instagram', scenario: 'study_enquiry', name: 'Jānis Krūmiņš', days: 0 },
  { channel: 'facebook', scenario: 'documents_question', name: 'Sofija Ivanova', days: 0 },
  { channel: 'whatsapp', scenario: 'unclear', name: 'Rihards Sīlis', days: 1 },
  { channel: 'phone', scenario: 'phone_button_1', name: null, days: 0 },
  { channel: 'website', scenario: 'programme_question', name: 'Alise Ozola', days: 1 },
];

const SPAM = [
  { channel: 'instagram', days: 0 },
  { channel: 'facebook', days: 2 },
];

const NOT_RELEVANT = [
  { channel: 'instagram', name: 'Promo Agency', days: 3, reason: 0 },
  { channel: 'facebook', name: 'Sports Club Riga', days: 5, reason: 0 },
];

async function send(db, { channel, scenario, name, phone, email, handle, at }) {
  const payload = buildPayload(channel, scenario || 'study_enquiry', {
    existing: (name || phone || email || handle) ? { name, phone, email, handle } : null, at });
  const ev = adapt(channel, payload);
  if (handle) ev.senderHandle = handle;
  if (at) ev.receivedAt = at;
  // Marked 'demo' so the admin Channels panel can never read a demo build as
  // evidence that a real provider reached us.
  return await receive(db, { ...toIntake(ev), source: 'demo' });
}

export async function buildDemo(db, CFG) {
  const summary = { people: 0, inbox: 0, filtered: 0, notRelevant: 0, admissions: 0, overdue: 0 };

  // 1. the cast, each arriving on its own channel and then qualified by a person
  for (const c of CAST) {
    const at = ago(c.days, 9 + (c.days % 8));
    const r = await send(db, { ...c, at });
    if (!r || r.filtered || r.duplicate) continue;

    const q = await qualify(db, r.id, {
      qualification: c.outcome,
      createPerson: true,
      by: c.outcome === 'lead' ? 'Ieva' : 'Tetiana',
      confirmFields: ['interest', 'education', 'question'],
      stated: c.outcome === 'lead' && c.programme ? { interest: c.programme } : {},
      nextAction: c.next,
      note: c.note || null,
      differentPerson: true,
    });
    if (!q || !q.ok) continue;
    summary.people += 1;

    // walk the ones that belong further along, through the same route the board uses
    if (c.stage) {
      const order = CFG.stageOrder || [];
      const want = order.indexOf(c.stage);
      for (let i = 1; i <= want; i += 1) {
        const before = (await db.prepare('SELECT status FROM people WHERE id = ?').get(q.personId)).status;
        await db.prepare('UPDATE people SET status = ? WHERE id = ?').run(order[i], q.personId);
        await logEvent(db, { personId: q.personId, kind: 'status', direction: 'note', at: ago(c.days - i, 11),
          origin: MANUAL, actor: 'Ieva', subject: `Status: ${before} -> ${order[i]}`,
          body: 'moved by Admissions', field: 'status', oldValue: before, newValue: order[i] });
      }
      if (c.stage === 'Admitted') {
        await db.prepare('UPDATE people SET admitted_at = ?, student_no = ? WHERE id = ?')
          .run(ago(c.days - 4, 12), '3-5-IM/2026/' + (10 + summary.people), q.personId);
      }
      summary.admissions += 1;
    }

    // one overdue next step, so Follow-ups has something red in it
    if (c.overdue) {
      await db.prepare('UPDATE tasks SET due_at = ? WHERE person_id = ? AND done_at IS NULL')
        .run(ago(3, 9), q.personId);
      summary.overdue += 1;
    }
  }

  // 2. work waiting in the Inbox
  for (const w of WAITING) {
    const r = await send(db, { ...w, at: ago(w.days, 8 + w.days) });
    if (r && !r.filtered) summary.inbox += 1;
  }

  // 3. sales pitches, filtered before the queue and out of the funnel
  for (const s of SPAM) {
    const r = await send(db, { channel: s.channel, scenario: 'spam', at: ago(s.days, 7) });
    if (r && r.filtered) summary.filtered += 1;
  }

  // 4. things a person looked at and marked not relevant, with a recorded reason
  const reasons = (CFG.intake && CFG.intake.archiveReasons) || [];
  for (const n of NOT_RELEVANT) {
    const r = await send(db, { channel: n.channel, scenario: 'unclear', name: n.name, at: ago(n.days, 10) });
    if (!r || r.filtered) continue;
    const a = await archive(db, r.id, { reason: reasons[n.reason] || reasons[0], by: 'Tetiana' });
    if (a && a.ok) summary.notRelevant += 1;
  }

  // 5. somebody we already hold writing again. It must NOT make a second person.
  const known = await db.prepare(`SELECT name, email, phone FROM people
    WHERE phone IS NOT NULL ORDER BY created_at DESC LIMIT 1`).get();
  if (known) {
    const r = await send(db, { channel: 'whatsapp', scenario: 'programme_question',
      name: known.name, phone: known.phone, email: known.email, at: ago(0, 12) });
    if (r && !r.filtered) summary.inbox += 1;
  }

  summary.total = (await db.prepare('SELECT COUNT(*) n FROM people').get()).n;
  return summary;
}
