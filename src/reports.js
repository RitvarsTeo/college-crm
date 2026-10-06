// Reports, for a KPI meeting.
//
// The rule throughout: every number is a COUNT of rows that exist, over a period
// somebody chose. Nothing is estimated, nothing is annualised, and where a figure
// cannot honestly be derived from what the CRM holds, the report says so in place
// of showing a number. A KPI meeting that argues about where a number came from
// is worse than no report.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIS_HOLDS_SQL } from './lifecycle.js';
import { localDate, localDateTime, localMidnight, dayStartOf, dayAfterStartOf, todayStart, tomorrowStart } from './bizday.js';
import { yearsOf, yearRanges, rangesSql } from './yearscope.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'prototype.json'), 'utf8'));

// ------------------------------------------------------------- the period --
// The days are RIGA days (src/bizday.js): "1 January" begins at midnight in Riga,
// not at 02:00 Riga, so a lead that arrived at 00:30 on New Year's Day belongs to the
// new year. The label names the same Riga days the counts use.
export function periodOf(from, to) {
  const [y, m] = localDate().split('-').map(Number);
  const start = from ? dayStartOf(from) : localMidnight(y, m, 1);
  const end = to ? dayAfterStartOf(to) : localMidnight(y, m + 1, 1);
  const lastDay = localDate(new Date(Date.parse(end) - 1));
  const label = `${localDate(start)} to ${lastDay}`;
  return { from: start, to: end, label, span: label, ranges: [[start, end]] };
}
// A SET of whole calendar years (Q59, the owner 06.10.2026: "Any years combined!"): its ranges (neighbours joined), the
// current year up to today. `from` / `to` are the first and the last instant; `span` says them as days, for the time
// axis; `label` names every range, so 2024 + 2026 never reads as the three years between.
export function periodOfYears(years) {
  const ranges = yearRanges(years);
  const now = tomorrowStart();
  for (const r of ranges) if (r[1] > now) r[1] = now;
  const live = ranges.filter(([a, b]) => a < b);
  const day = (a, b) => `${localDate(a)} to ${localDate(new Date(Date.parse(b) - 1))}`;
  const from = live[0][0], to = live[live.length - 1][1];
  return { from, to, ranges: live, years: yearsOf(years), span: day(from, to), label: live.map(([a, b]) => day(a, b)).join(', ') };
}
// `col` inside the period's ranges, as SQL and its arguments.
const inP = (col, p) => rangesSql(col, p.ranges || [[p.from, p.to]]);

const count = async (db, sql, ...args) => (await db.prepare(sql).get(...args)).n;

// ---------------------------------------------------------- conversion, MATURED --
// THE ONE DEFINITION (the owner, 05.10.2026: "Conversion counts only MATURED people, everywhere"). Conversion =
// admitted / the people who arrived in the period at least N days (config conversion.maturedDays) before its end, or
// before today when the period has not ended yet. Somebody who arrived last week has not had time to be admitted, so
// counting them made the figure read low and impossible to compare with a benchmark. Home's card, Reports' tab and the
// export all read this; the screen draws the same people from `cutoff`, never its own rule.
export const MATURED_DAYS = Number(CFG.conversion && CFG.conversion.maturedDays) || 60;
export function maturedBasis(p, { now = new Date(), days = MATURED_DAYS } = {}) {
  const end = Math.min(Date.parse(p.to) - 1, now.getTime());
  const [y, m, d] = localDate(new Date(end)).split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);   // the last Riga day that is matured
  const toNow = Date.parse(p.to) > now.getTime();
  return { days, cutoff: dayAfterStartOf(lastDay), lastDay,
    who: toNow ? `who arrived ${days}+ days ago` : `who arrived ${days}+ days before ${localDate(new Date(end))}` };
}
export async function maturedConversion(db, p, opts) {
  const basis = maturedBasis(p, opts);
  const until = basis.cutoff < p.to ? basis.cutoff : p.to;
  const [inR, rArgs] = inP('created_at', p);
  const of = await count(db, `SELECT COUNT(*) n FROM people WHERE ${inR} AND created_at < ?`, ...rArgs, until);
  const admitted = await count(db, `SELECT COUNT(*) n FROM people
    WHERE ${inR} AND created_at < ? AND admitted_at IS NOT NULL`, ...rArgs, until);
  return { ...basis, admitted, of, pct: of ? Math.round((admitted / of) * 1000) / 10 : null };
}

// ---------------------------------------------------------- steps, MATURED --
// BENCHMARKS on Reports > Conversion (the owner picked variant A, 06.10.2026). A benchmark is a stage rate, so ours
// is one too, over the SAME matured people as Conversion: of the people who arrived in the period at least N days
// ago, how many ever REACHED the next stage. Reached = where they are now is that stage or later, they were ever moved
// to it (History: a status event with that new value), or they are admitted. Somebody who reached Application and
// later stopped still reached it: that is what a funnel step counts. Stage order = config.stageOrder.
// Each step carries the ids, so the screen opens exactly the people the dot counts.
const ORDER = CFG.stageOrder || (CFG.stages || []).map((s) => s.id);
const fromStage = (id) => ORDER.slice(Math.max(0, ORDER.indexOf(id)));
export const STEPS = [
  { id: 'leadToApplication', from: null, to: 'Application' },
  { id: 'contractToAdmitted', from: 'Contract', to: 'Admitted' },
];
export async function maturedSteps(db, p, opts) {
  const basis = maturedBasis(p, opts);
  const until = basis.cutoff < p.to ? basis.cutoff : p.to;
  const [inR, rArgs] = inP('created_at', p);
  const ripe = await db.prepare(`SELECT id, status, admitted_at FROM people WHERE ${inR} AND created_at < ? ORDER BY id`)
    .all(...rArgs, until);
  const ever = new Map();
  if (ripe.length) {
    const rows = await db.prepare(`SELECT DISTINCT person_id, new_value FROM events WHERE kind = 'status' AND new_value IS NOT NULL
      AND person_id IN (SELECT id FROM people WHERE ${inR} AND created_at < ?)`).all(...rArgs, until);
    for (const r of rows) { if (!ever.has(r.person_id)) ever.set(r.person_id, new Set()); ever.get(r.person_id).add(r.new_value); }
  }
  const reached = (pp, stage) => {
    if (stage === 'Admitted' && pp.admitted_at) return true;
    const later = fromStage(stage);
    return later.includes(pp.status) || !!pp.admitted_at || [...(ever.get(pp.id) || [])].some((s) => later.includes(s));
  };
  const steps = {};
  for (const s of STEPS) {
    const base = s.from ? ripe.filter((pp) => reached(pp, s.from)) : ripe;
    const won = base.filter((pp) => reached(pp, s.to));
    steps[s.id] = { from: s.from || 'Lead', to: s.to, of: base.length, reached: won.length,
      pct: base.length ? Math.round((won.length / base.length) * 1000) / 10 : null,
      ofIds: base.map((pp) => pp.id), reachedIds: won.map((pp) => pp.id) };
  }
  return { ...basis, steps };
}

// A breakdown is always a count per value, plus an explicit "not recorded" row,
// because a blank in a report reads as zero when it really means unknown.
async function breakdown(db, column, { where = '', args = [], ...p } = {}) {
  const [inR, rArgs] = inP('created_at', p);
  const rows = await db.prepare(`SELECT COALESCE(NULLIF(TRIM(${column}), ''), '(not recorded)') k,
      COUNT(*) n FROM people
    WHERE ${inR} ${where}
    GROUP BY k ORDER BY n DESC`).all(...rArgs, ...args);
  return rows.map((r) => ({ value: r.k, count: r.n }));
}

export async function report(db, { from, to, years } = {}) {
  // a set of whole years (Q59), or a run of days (a month chosen on Reports, an export, an older caller)
  const p = yearsOf(years).length ? periodOfYears(years) : periodOf(from, to);
  const [ARR, A] = inP('created_at', p);     // arrived in the period
  const [ADM] = inP('admitted_at', p);        // admitted in it (the same arguments, A)

  const newLeads = await count(db, `SELECT COUNT(*) n FROM people WHERE ${ARR}`, ...A);
  const applications = await count(db, `SELECT COUNT(*) n FROM people
    WHERE ${ARR} AND status IN ('Application','Contract','Admitted')`, ...A);
  const admitted = await count(db, `SELECT COUNT(*) n FROM people WHERE ${ADM}`, ...A);

  const activeApplicants = await count(db, `SELECT COUNT(*) n FROM people
    WHERE status NOT IN ('Admitted','Not proceeding')`);
  // Overdue means its day has passed - the same line as every screen draws.
  const overdue = await count(db, `SELECT COUNT(*) n FROM tasks
    WHERE done_at IS NULL AND due_at < ?`, todayStart());
  const noNextAction = await count(db, `SELECT COUNT(*) n FROM people pe
    WHERE pe.status NOT IN ('Admitted','Not proceeding') AND NOT ${SIS_HOLDS_SQL}
      AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL)`);

  // Conversion follows the MATURED people who arrived in the period (maturedConversion above), so the two numbers
  // describe one population. Admitted-this-month counts a different one and says so.
  const conv = await maturedConversion(db, p);
  const conversion = conv.pct;
  const stepRates = (await maturedSteps(db, p)).steps;   // the two stage rates the benchmarks compare with

  // How long admission actually took, as a median of real durations.
  const durations = (await db.prepare(`SELECT created_at, admitted_at FROM people
    WHERE admitted_at IS NOT NULL AND ${ADM}`).all(...A))
    .map((r) => Math.round((Date.parse(r.admitted_at) - Date.parse(r.created_at)) / 86400000))
    .filter((d) => Number.isFinite(d) && d >= 0)
    .sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : null;

  // Twelve months of arrivals and admissions, for the trend.
  const months = [];
  // Riga months, ending with the month the period's last day falls in.
  const [ey, em] = localDate(new Date(Date.parse(p.to) - 1)).split('-').map(Number);
  for (let i = 11; i >= 0; i -= 1) {
    const m0 = localMidnight(ey, em - i, 1);
    const m1 = localMidnight(ey, em - i + 1, 1);
    months.push({
      month: localDate(m0).slice(0, 7),
      newLeads: await count(db, 'SELECT COUNT(*) n FROM people WHERE created_at >= ? AND created_at < ?', m0, m1),
      admitted: await count(db, 'SELECT COUNT(*) n FROM people WHERE admitted_at >= ? AND admitted_at < ?', m0, m1),
    });
  }

  // Programme numbers the existing KPI sheet already reports on.
  // Promise.all, not just async: .map with an async callback returns an array of
  // PROMISES, and nothing here would have thrown - the report would simply have
  // carried unresolved objects.
  const programmes = await Promise.all((CFG.programmes || []).map(async (code) => ({
    programme: code,
    newLeads: await count(db, `SELECT COUNT(*) n FROM people
      WHERE ${ARR} AND programme = ?`, ...A, code),
    admitted: await count(db, `SELECT COUNT(*) n FROM people
      WHERE ${ADM} AND programme = ?`, ...A, code),
  })));

  // Maritime school graduates. This is a real count, not a gap: the education field
  // has been filled in by hand for years. What is thin is the COVERAGE, and that is
  // reported next to the number instead of the number being withheld.
  const maritimeList = CFG.maritimeEducations || [];
  const maritime = maritimeList.length ? await count(db, `SELECT COUNT(*) n FROM people
    WHERE ${ARR}
      AND education IN (${maritimeList.map(() => '?').join(',')})`, ...A, ...maritimeList) : 0;
  const withEducation = await count(db, `SELECT COUNT(*) n FROM people
    WHERE ${ARR} AND education IS NOT NULL AND TRIM(education) != ''`, ...A);
  const withNationality = await count(db, `SELECT COUNT(*) n FROM people
    WHERE ${ARR} AND nationality IS NOT NULL AND TRIM(nationality) != ''`, ...A);

  const lost = (await db.prepare(`SELECT COALESCE(NULLIF(TRIM(closed_reason), ''), '(no reason recorded)') k,
      COUNT(*) n FROM people
    WHERE status = 'Not proceeding' GROUP BY k ORDER BY n DESC`).all())
    .map((r) => ({ value: r.k, count: r.n }));

  return {
    period: p,
    summary: {
      newLeads, applications, admitted, activeApplicants, overdue, noNextAction,
      conversionPct: conversion,
      maritimeGraduates: maritime,
      conversionOf: conversion === null ? `no one ${conv.who} in this period`
        : `${conv.admitted} of ${conv.of} people ${conv.who}`,
      // the working, for the screen: a calculated number sits next to its sum, and the basis in words
      conversionA: conv.admitted,
      conversionB: conv.of,
      conversionWho: conv.who,
      conversionDays: conv.days,
      conversionCutoff: conv.cutoff,
      medianDaysToAdmission: median,
    },
    steps: stepRates,
    trend: months,
    programmes,
    breakdowns: {
      programme: await breakdown(db, 'programme', { ...p }),
      studyForm: await breakdown(db, 'study_form', { ...p }),
      education: await breakdown(db, 'education', { ...p }),
      source: await breakdown(db, 'source_channel', { ...p }),
      nationality: await breakdown(db, 'nationality', { ...p }),
      stage: (await db.prepare(`SELECT status k, COUNT(*) n FROM people GROUP BY k ORDER BY n DESC`).all())
        .map((r) => ({ value: r.k, count: r.n })),
    },
    lostReasons: lost,

    // Said out loud rather than shown as an empty column. A KPI meeting must know
    // which numbers the CRM can stand behind and which it cannot yet.
    // How much of the period has each hand-typed field filled in. A number is only
    // as good as its coverage, and hiding the coverage is how a report misleads.
    coverage: {
      education: { filled: withEducation, of: newLeads },
      nationality: { filled: withNationality, of: newLeads },
    },
    notMeasured: await notMeasured(db, p),
    honesty: [
      'Every figure is a count of rows in this database over the chosen period. Nothing is estimated.',
      `Conversion follows the people who ARRIVED in the period at least ${conv.days} days before its end (or before today): a newer lead has not had time to be admitted. Somebody admitted this month may have arrived last year, so "admitted" and "conversion" deliberately count different populations.`,
      'A breakdown always shows a "(not recorded)" row. A gap in the data is not a zero.',
    ],
  };
}

// Things the existing KPI reporting asks for that this CRM cannot yet derive.
// Structured so they can be filled the moment the source or the definition exists.
async function notMeasured(db, p) {
  const out = [];
  const [ARR, A] = inP('created_at', p);
  const has = async (col) => (await db.prepare(
    `SELECT COUNT(*) n FROM pragma_table_info('people') WHERE name = ?`).get(col)).n > 0;

  // The distinction that matters. Most of what a report "cannot say" is not a
  // limit of the software at all - it is a field nobody has filled in yet. Those
  // two things need completely different work, so they are never listed together.
  const cover = async (col) => {
    const filled = (await db.prepare(`SELECT COUNT(*) n FROM people
      WHERE ${ARR} AND ${col} IS NOT NULL AND TRIM(${col}) != ''`).get(...A)).n;
    const total = (await db.prepare(`SELECT COUNT(*) n FROM people WHERE ${ARR}`).get(...A)).n;
    return { filled, total };
  };

  if (await has('nationality')) {
    const c = await cover('nationality');
    if (c.filled < c.total) {
      out.push({ metric: 'Nationality', kind: 'needs typing in',
        why: `There is a Nationality box on every person and it is filled in for ${c.filled} of ${c.total} in this period. It is asked and typed, never derived.`,
        toFix: 'Fill it in as people are spoken to. The historical export carried no nationality at all, so the older records will stay empty.',
        partial: c.filled > 0 });
    }
  } else {
    out.push({ metric: 'Nationality', kind: 'not built',
      why: 'There is no nationality field on the person record.',
      toFix: 'Add one. It is typed in by hand, like education.' });
  }

  const ed = await cover('education');
  if (ed.filled < ed.total) {
    out.push({ metric: 'Maritime school graduates', kind: 'needs typing in',
      why: `Counted from the education field, which is filled in for ${ed.filled} of ${ed.total} in this period. The number below is real; it is the coverage that is thin.`,
      toFix: 'Make education required when somebody is qualified, and the figure completes itself.',
      partial: true });
  }

  // This one really is undecided, and no amount of typing fixes it.
  out.push({ metric: 'HE applications', kind: 'needs a decision',
    why: 'Nothing anywhere records whether an application is higher education, because nobody has said what separates one.',
    toFix: 'Define what counts as an HE application. Once it is a rule, it becomes a field or a filter and the number follows.' });

  out.push({ metric: 'Admission duration', kind: 'by definition',
    why: 'First contact to admitted. It can only exist for somebody who has both dates, so it covers admitted people only.',
    toFix: 'Nothing to fix. It is not a gap.', partial: true });

  return out;
}

// What a person can choose to put in the file. The report on screen is fixed; the
// export is not, because somebody preparing for a KPI meeting wants the two or
// three things that meeting is about, not everything the CRM knows.
export const EXPORT_SECTIONS = [
  { id: 'summary', label: 'Summary' },
  { id: 'trend', label: 'Monthly trend' },
  { id: 'programmes', label: 'Programme breakdown' },
  { id: 'studyForm', label: 'Study form' },
  { id: 'source', label: 'Source / channel' },
  { id: 'stage', label: 'Stage' },
  { id: 'education', label: 'Education' },
  { id: 'lost', label: 'Lost reasons' },
  { id: 'people', label: 'People list' },
];

export const DEFAULT_SECTIONS = ['summary', 'trend', 'programmes'];

// One flat table, for a CSV or a spreadsheet. `want` is the list of sections
// somebody ticked; leaving it out gives the sensible default rather than
// everything, because an export nobody can read is not a report.
// Which rows to set in bold: every section title, and the column names right under it.
export function boldRowsOf(rows) {
  const out = [];
  rows.forEach((r, i) => {
    if (!r || !r.head) return;
    out.push(i);
    if (i > 0 && rows[i + 1] && rows[i + 1].length > 1) out.push(i + 1);
  });
  return out;
}

export async function reportRows(db, opts = {}) {
  const want = new Set(
    Array.isArray(opts.sections) && opts.sections.length ? opts.sections : DEFAULT_SECTIONS);
  const r = await report(db, opts);
  const rows = [];
  const blank = () => rows.push([]);
  // A section title is marked, so a spreadsheet can set it (and the column names under
  // it) in bold. A CSV has no bold and simply ignores the mark.
  const head = (t) => { const r = [t]; r.head = true; rows.push(r); };

  head('Intake report');
  rows.push(['Period', r.period.label]);
  rows.push(['Prepared', localDateTime() + ' Riga time']);
  blank();

  if (want.has('summary')) {
    head('The headline figures');
    rows.push(['Metric', 'Value', 'Note']);
    rows.push(['New leads', r.summary.newLeads, 'arrived in the period']);
    rows.push(['Applications', r.summary.applications, 'reached Application or beyond']);
    rows.push(['Admitted', r.summary.admitted, 'admitted in the period, whenever they arrived']);
    rows.push(['Conversion %', r.summary.conversionPct ?? 'n/a', r.summary.conversionOf]);
    rows.push(['Active applicants', r.summary.activeApplicants, 'not admitted and not closed']);
    rows.push(['Overdue follow-ups', r.summary.overdue, 'open next steps past their due date']);
    rows.push(['People with no next step', r.summary.noNextAction, 'should be zero']);
    rows.push(['Median days to admission', r.summary.medianDaysToAdmission ?? 'n/a', 'first contact to admitted']);
    rows.push(['Maritime school graduates', r.summary.maritimeGraduates,
      `education recorded for ${r.coverage.education.filled} of ${r.coverage.education.of}`]);
    blank();
  }

  if (want.has('trend')) {
    head('Twelve-month trend');
    rows.push(['Month', 'New leads', 'Admitted']);
    for (const m of r.trend) rows.push([m.month, m.newLeads, m.admitted]);
    blank();
  }

  if (want.has('programmes')) {
    head('By programme');
    rows.push(['Programme', 'New leads', 'Admitted']);
    for (const x of r.programmes) rows.push([x.programme, x.newLeads, x.admitted]);
    blank();
  }

  for (const [id, title] of [['source', 'Where they came from'], ['studyForm', 'Study form'],
    ['education', 'Education'], ['nationality', 'Nationality'], ['stage', 'Stage right now']]) {
    if (!want.has(id)) continue;
    head(title);
    rows.push([title, 'Count']);
    for (const b of r.breakdowns[id]) rows.push([b.value, b.count]);
    blank();
  }

  if (want.has('lost')) {
    head('Why people did not proceed');
    rows.push(['Reason', 'Count']);
    for (const b of r.lostReasons) rows.push([b.value, b.count]);
    blank();
  }

  if (want.has('people')) {
    head('The people behind the numbers');
    rows.push(['Name', 'Programme', 'Study form', 'Education', 'Nationality', 'Source',
      'Stage', 'Owner', 'First contact', 'Admitted', 'Next step', 'Due']);
    const people = await db.prepare(`SELECT pe.*,
        (SELECT t.label FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL
          ORDER BY t.due_at LIMIT 1) next_label,
        (SELECT t.due_at FROM tasks t WHERE t.person_id = pe.id AND t.done_at IS NULL
          ORDER BY t.due_at LIMIT 1) next_due
      FROM people pe WHERE pe.created_at >= ? AND pe.created_at < ?
      ORDER BY pe.created_at DESC`).all(r.period.from, r.period.to);
    for (const x of people) {
      rows.push([x.name, x.programme, x.study_form, x.education, x.nationality,
        x.source_channel, x.status, x.owner,
        x.created_at ? localDate(x.created_at) : '', x.admitted_at ? localDate(x.admitted_at) : '',
        x.next_label, x.next_due ? localDate(x.next_due) : '']);
    }
    blank();
  }

  if (want.has('gaps')) {
    head('What is still thin');
    rows.push(['Metric', 'Kind', 'Where it stands', 'What would fix it']);
    for (const n of r.notMeasured) rows.push([n.metric, n.kind, n.why, n.toFix]);
    blank();
  }

  rows.push(['Every figure above is a count of rows in Intake over the chosen period. Nothing is estimated.']);
  return rows;
}
