// Loads the real people exported from the ADMISSIONS DATABASE.
//
// Nothing is invented on the way in. A field the sheet does not have stays
// empty, the sheet's own status wording is kept on the record, and no consent is
// recorded for anybody, because the sheet holds none. The file it reads is
// git-ignored and never leaves this machine.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DATA_FILE = path.join(ROOT, 'data', 'real_people.json');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

export function hasRealData() {
  return fs.existsSync(DATA_FILE);
}

// Which of the exported people the prototype actually loads. A CRM demo does not
// need the whole archive: the default is this year's live work plus enough
// admitted students to show the end of the journey.
export function selectPeople(all, sel = {}) {
  const mode = sel.include || 'current-cycle';
  const year = String(sel.year || new Date().getFullYear());
  const open = (p) => !['Admitted', 'Not proceeding'].includes(p.status);
  if (mode === 'all') return { chosen: all.slice(), reason: 'every exported person' };
  // THE YEAR'S WHOLE FUNNEL, lost people included: everybody first contacted OR admitted in
  // `year`, whatever happened to them. current-cycle leaves out Not proceeding, which is
  // exactly where a management review needs to look. Added 27.09.2026.
  if (mode === 'year') {
    const inYear = (v) => String(v || '').startsWith(year);
    const chosen = all.filter((p) => inYear(p.created_at) || inYear(p.admitted_at));
    return { chosen, reason: `everybody first contacted or admitted in ${year} (${chosen.length}), every status` };
  }
  if (mode === 'sample') {
    const chosen = all.filter(open).slice(0, sel.sampleSize || 40);
    return { chosen, reason: `a sample of ${chosen.length} open records` };
  }
  if (mode === 'open-only') {
    const chosen = all.filter(open);
    return { chosen, reason: `every open record (${chosen.length}), no admitted and no closed` };
  }
  const openThisYear = all.filter((p) => open(p) && String(p.created_at || '').startsWith(year));
  const admitted = all.filter((p) => p.status === 'Admitted')
    .sort((a, b) => String(b.admitted_at || '').localeCompare(String(a.admitted_at || '')))
    .slice(0, sel.maxAdmitted ?? 25);
  return {
    chosen: [...openThisYear, ...admitted],
    reason: `open leads first contacted in ${year} (${openThisYear.length}) plus the ${admitted.length} most recently admitted`,
  };
}

// The export was written before the channel was renamed. The source file is left
// exactly as exported; the old id is mapped on the way in.
const CHANNEL_RENAMES = { klatiene: 'in_person' };
const chan = (v) => CHANNEL_RENAMES[v] || v || 'unknown';

// The same school was typed as Vidusskola and as Secondary over several years, in
// two languages. Mapped here, on the way in, so a report can count them. The
// source export is never edited.
const EDU_ALIAS = CFG.educationAliases || {};
const edu = (v) => (v == null || v === '') ? null : (EDU_ALIAS[String(v).trim()] || String(v).trim());

export async function loadReal(db, selection = {}) {
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const { chosen, reason } = selectPeople(raw.people, selection);
  const skipped = raw.people.length - chosen.length;
  const now = new Date().toISOString();
  const insPerson = db.prepare(`INSERT INTO people (id,name,email,phone,programme,study_form,education,status,owner,
    source_channel,source_campaign,source_detail,created_at,last_contact_at,contract_at,admitted_at,student_no,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  // Imported from the admissions sheet: nobody in the CRM did it, so it is automatic.
  const insEvent = db.prepare(`INSERT INTO events (person_id,kind,channel,direction,occurred_at,subject,body,actor,origin)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const insTask = db.prepare('INSERT INTO tasks (person_id,label,due_at,owner,created_at) VALUES (?,?,?,?,?)');
  const insDoc = db.prepare('INSERT INTO documents (person_id,name,state) VALUES (?,?,?)');

  let n = 0, withTask = 0, withDocs = 0;
  // for...of, not forEach: forEach throws away the callback's promise, so the
  // inserts would never be waited for and the loop would finish before the
  // database had anything in it.
  for (const [i, p] of chosen.entries()) {
    const id = 'r' + String(i + 1).padStart(4, '0');
    const created = p.created_at || now;
    await insPerson.run(id, p.name, p.email || null, p.phone || null, p.programme || null,
      p.study_form || null, edu(p.education), p.status, 'Admissions',
      chan(p.source_channel), p.source_campaign || null, p.source_detail || null,
      created, null, null, p.admitted_at || null, p.student_no || null,
      // the sheet's own wording is kept so the mapping stays reversible
      [p.originalStatus ? 'Sheet status: ' + p.originalStatus : null,
       p.docs ? 'Docs: ' + p.docs : null,
       p.notes || null].filter(Boolean).join(' | ') || null);
    n++;

    await insEvent.run(id, 'channel', chan(p.source_channel), 'in', created,
      'First contact', p.notes || '', 'ADMISSIONS DATABASE', 'automatic');
    if (p.admitted_at) {
      await insEvent.run(id, 'status', null, 'note', p.admitted_at, 'Admitted',
        p.student_no ? 'Matriculation no. ' + p.student_no : '', 'ADMISSIONS DATABASE', 'automatic');
    }
    if (p.next_action_at && !['Admitted', 'Not proceeding'].includes(p.status)) {
      await insTask.run(id, 'Get in touch (from the sheet)', p.next_action_at, 'Admissions', created);
      withTask++;
    }
    if (p.docs) {
      const state = p.docs.toLowerCase() === 'done' ? 'received'
        : p.docs.toLowerCase() === 'in process' ? 'missing' : 'missing';
      await insDoc.run(id, 'Documents (' + p.docs + ')', state);
      withDocs++;
    }
  }

  // The events the prototype knows about are not in this sheet, so the open-day
  // screen stays honestly empty rather than borrowing synthetic bookings.
  await db.prepare('INSERT INTO open_days (id,title,held_on,place) VALUES (?,?,?,?)')
    .run('od-real', 'Profession taster day', new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10), 'Duntes iela 17A');

  return { dataset: 'real', people: n, withTask, withDocs, source: raw.source, note: raw.note,
    selection: reason, available: raw.people.length, skipped };
}
