// Synthetic data. Every name here is invented. The SHAPE of the data follows
// what was measured in the real admissions file and the booking system on
// 21.09.2026: channel mix, programme mix, education mix and how long people
// take to sign. Nothing here is a real applicant.

const FIRST_M = ['Jānis', 'Mārtiņš', 'Edgars', 'Roberts', 'Kristaps', 'Toms', 'Artūrs', 'Dāvis', 'Rihards', 'Kārlis', 'Emīls', 'Gatis', 'Niks', 'Raivis', 'Sandis', 'Aleksejs', 'Dmitrijs', 'Vladislavs', 'Igors', 'Nikita'];
const FIRST_F = ['Anna', 'Elza', 'Liene', 'Marta', 'Laura', 'Kristīne', 'Agnese', 'Samanta', 'Darja', 'Alina'];
const LAST = ['Bērziņš', 'Kalniņš', 'Ozoliņš', 'Liepiņš', 'Krūmiņš', 'Vītols', 'Zariņš', 'Jansons', 'Egle', 'Priede', 'Lācis', 'Dūmiņš', 'Skuja', 'Sīlis', 'Purmalis', 'Ivanovs', 'Petrovs', 'Volkovs', 'Sokolovs', 'Morozovs'];
const INTL = [['Arun', 'Kumar'], ['Rahul', 'Menon'], ['Vishnu', 'Nair'], ['Joseph', 'Daniel'], ['Samir', 'Haddad'], ['Felix', 'Okoro']];

const PROGRAMMES = ['NAV', 'ENG', 'MT OS', 'MT MR', 'MT MTM', 'MT WTT'];
const EDUCATION = ['Secondary school', 'Maritime school', 'LJA', 'LJK', 'Other'];
// Admissions owns every person. Marketing brings leads in, and that is recorded
// as the source and the campaign, never as ownership.
const OWNERS = ['Admissions'];
const CHANNELS = [
  ['phone', null, 'inbound call', 0.22],
  ['email', null, 'edu inbox', 0.22],
  ['website', 'nav-2026-09', 'apply page', 0.12],
  ['google_form', null, 'application form', 0.08],
  ['in_person', null, 'reception', 0.08],
  ['event', 'piemeri-profesiju', 'open day', 0.10],
  ['instagram', 'nav-2026-09', 'paid', 0.06],
  ['facebook', 'eng-2026-09', 'lead ad', 0.05],
  ['whatsapp', null, null, 0.03],
  ['mailchimp', 'renewal-2026', 'campaign', 0.02],
  ['agent', 'india-partner-1', 'India', 0.02],
];

// deterministic pseudo-random so the prototype looks the same every run
let seedv = 20260922;
function rnd() { seedv = (seedv * 1103515245 + 12345) % 2147483648; return seedv / 2147483648; }
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const iso = (d) => new Date(d).toISOString();
const daysAgo = (n, base = Date.now()) => iso(base - n * 86400000);
const plusDays = (isoStr, n) => iso(Date.parse(isoStr) + n * 86400000);

function weightedChannel() {
  let r = rnd(), acc = 0;
  for (const c of CHANNELS) { acc += c[3]; if (r <= acc) return c; }
  return CHANNELS[0];
}

function personName(intl) {
  if (intl) { const [a, b] = pick(INTL); return `${a} ${b}`; }
  const first = rnd() < 0.25 ? pick(FIRST_F) : pick(FIRST_M);
  return `${first} ${pick(LAST)}`;
}

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '.');

export async function seed(db, { people = 64 } = {}) {
  const now = Date.now();
  const STAGES = ['New', 'Contacted', 'Follow-up', 'Application', 'Contract', 'Admitted', 'Not proceeding'];
  const ins = db.prepare(`INSERT INTO people (id,name,email,phone,programme,study_form,education,status,owner,
    source_channel,source_campaign,source_detail,created_at,last_contact_at,contract_at,admitted_at,student_no,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  // origin is the last column: what the machine did, and what somebody did by hand.
  const insEv = db.prepare('INSERT INTO events (person_id,kind,channel,direction,occurred_at,subject,body,actor,origin) VALUES (?,?,?,?,?,?,?,?,?)');
  const insTask = db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,done_at,outcome,created_at) VALUES (?,?,?,?,?,?,?)');
  const insDoc = db.prepare('INSERT INTO documents (person_id,name,state) VALUES (?,?,?)');

  const ids = [];
  for (let i = 0; i < people; i++) {
    const [channel, campaign, detail] = weightedChannel();
    const intl = channel === 'agent' || rnd() < 0.06;
    const name = personName(intl);
    const id = 'p' + String(i + 1).padStart(3, '0');
    const programme = pick(PROGRAMMES);
    const education = intl ? 'Other' : (rnd() < 0.6 ? 'Secondary school' : rnd() < 0.75 ? 'Maritime school' : pick(EDUCATION));
    // most leads are recent, a tail is old: squaring the random draw gives that
    const ageDays = intl ? int(60, 400) : Math.floor(Math.pow(rnd(), 2) * 240);
    const created = daysAgo(ageDays, now);

    // Lifecycle first, then a stage that fits the age. The real file shows most
    // open leads sitting cold, a minority admitted and a quarter not proceeding.
    const typical = intl ? 266 : education === 'Maritime school' ? 14 : programme.startsWith('MT') ? 24 : 31;
    const roll = rnd();
    let status, contractAt = null, admittedAt = null;
    if (roll < 0.28 && ageDays > typical) {
      status = 'Admitted';
      contractAt = plusDays(created, Math.round(typical * (0.8 + rnd() * 0.4)));
      admittedAt = plusDays(contractAt, int(1, 20));
      if (Date.parse(admittedAt) > now) { admittedAt = daysAgo(int(1, 20), now); }
    } else if (roll < 0.5) {
      status = 'Not proceeding';
    } else {
      const progress = ageDays / typical;
      if (progress > 1.1 && rnd() < 0.5) { status = 'Contract'; contractAt = daysAgo(int(1, 15), now); }
      else if (progress > 0.7) status = 'Application';
      else if (progress > 0.35) status = 'Follow-up';
      else if (progress > 0.12) status = 'Contacted';
      else status = 'New';
    }

    const owner = 'Admissions';
    const email = `${slug(name)}@${pick(['inbox.lv', 'gmail.com', 'example.lv', 'tvnet.lv'])}`;
    const phone = intl ? '+91' + int(700000000, 999999999) : '+371' + int(20000000, 29999999);
    const lastContact = rnd() < 0.85 ? daysAgo(int(0, Math.min(ageDays, 60)), now) : null;

    await ins.run(id, name, email, phone, programme, rnd() < 0.7 ? 'Full time' : 'Part time', education, status, owner,
      channel, campaign, detail, created, lastContact, contractAt, admittedAt,
      admittedAt ? `3-5-IM/2026/${int(10, 99)}` : null, null);
    ids.push({ id, name, status, channel, created, owner, intl, admittedAt, contractAt });

    // the inbound event that created them
    const arrival = {
      phone: ['Incoming call', 'Called and asked about the programme'],
      email: ['A question about studying', 'Hello! Can I still apply?'],
      website: ['Application form', 'Filled in the form on the website'],
      google_form: ['Google Form', 'Submitted an application through the Google Form'],
      in_person: ['In person', 'Walked into reception'],
      event: ['Profession taster day', 'Booked a visit'],
      instagram: ['Instagram message', 'Hello! Can I apply?'],
      facebook: ['Facebook lead form', 'Filled in the ad form'],
      whatsapp: ['WhatsApp message', 'Hello, I am interested in the NAV programme'],
      mailchimp: ['Mailchimp', 'Opened the campaign email and applied'],
      agent: ['Agent application', 'A partner submitted the candidate'],
    }[channel] || ['Application', ''];
    await insEv.run(id, 'channel', channel, 'in', created, arrival[0], arrival[1], null, 'automatic');

    // a couple of follow-up entries
    const touches = int(0, 4);
    for (let t = 0; t < touches; t++) {
      const when = plusDays(created, int(1, Math.max(2, ageDays)));
      if (Date.parse(when) > now) continue;
      const kind = pick(['call', 'note', 'channel']);
      if (kind === 'call') await insEv.run(id, 'call', 'phone', 'note', when, 'Call: ' + pick(['answered', 'no answer', 'asked us to call back']), pick(['Interested in the January intake', 'Waiting for the medical certificate', 'Still thinking', 'The contract has to be sent']), owner, 'manual');
      else if (kind === 'note') await insEv.run(id, 'note', null, 'note', when, 'Note', pick(['From maritime school, documents in order', 'The parents are asking about the price', 'Still at secondary school', 'Needs to retake the English test']), owner, 'manual');
      else await insEv.run(id, 'channel', pick(['email', 'whatsapp', 'website']), 'in', when, 'Message', pick(['Thank you for the reply!', 'When are the documents due?', 'Can I change the programme?']), null, 'automatic');
    }

    if (['Application', 'Contract', 'Admitted'].includes(status)) {
      for (const d of ['Passport or ID', 'Education certificate', 'Medical certificate', 'Photo']) {
        await insDoc.run(id, d, rnd() < (status === 'Admitted' ? 0.95 : 0.6) ? 'received' : rnd() < 0.5 ? 'missing' : 'expired');
      }
    }
    if (status === 'Admitted') {
      await insEv.run(id, 'status', null, 'note', admittedAt, 'Admitted', 'Matriculation ' + String(admittedAt).slice(0, 10), 'Admissions', 'manual');
    }

    // the open next action, which is the whole point of the follow-up screen
    if (!['Admitted', 'Not proceeding'].includes(status)) {
      const label = { New: 'First call', Contacted: 'Follow-up call', 'Follow-up': 'Establish the decision', Application: 'Check the documents', Contract: 'Prepare the contract' }[status] || 'Get in touch';
      const due = daysAgo(int(-9, 14), now); // some overdue, some today, some ahead
      await insTask.run(id, label, due, owner, null, null, created);
    }
  }

  // an open day, with the people who came from the event channel
  const odId = 'od1';
  await db.prepare('INSERT INTO open_days (id,title,held_on,place) VALUES (?,?,?,?)').run(
    odId, 'Profession taster day', daysAgo(9, now).slice(0, 10), 'Duntes iela 17A');
  const eventPeople = ids.filter((p) => p.channel === 'event');
  for (const p of eventPeople) {
    await db.prepare('INSERT INTO registrations (open_day_id,person_id,slot,attended,professions) VALUES (?,?,?,?,?)')
      .run(odId, p.id, pick(['14:00', '15:00', '16:00']), rnd() < 0.7 ? 1 : 0, pick(['Ship captain', 'Ship engineer', 'Wind turbine technician']));
  }
  const od2 = 'od2';
  await db.prepare('INSERT INTO open_days (id,title,held_on,place) VALUES (?,?,?,?)').run(
    od2, 'Open doors day', iso(now + 12 * 86400000).slice(0, 10), 'Duntes iela 17A');

  return { people: ids.length, openDays: 2, stages: STAGES };
}
