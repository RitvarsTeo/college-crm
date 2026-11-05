// Academy Home (the owner, 05.11.2026): "Last year around this time" under Admitted and Leads, quieter than the figure;
// Needs you only for CRD (Ieva, Arina, Marina, Laura, the Admissions account), not for anyone else, admins included.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../src/app.html', import.meta.url), 'utf8');
const cfg = JSON.parse(fs.readFileSync(new URL('../config/prototype.json', import.meta.url), 'utf8'));

test('Needs you is for the CRD accounts only', () => {
  assert.deepEqual([...cfg.needsYouFor].sort(), ['arina.danilevska@novikontas.org', 'edu@novikontas.org',
    'ieva.gudaneca@novikontas.org', 'laura.skirmante@novikontas.org', 'poma@novikontas.org']);
  assert.match(html, /function cSeesNeedsYou\(\) \{\n  const u = typeof AUTH !== 'undefined' && AUTH && AUTH\.user;\n  if \(!u\) return true;/);
  assert.ok(!/u\.role === 'admin'\) return true/.test(html.slice(html.indexOf('function cSeesNeedsYou'), html.indexOf('const cFig'))), 'an admin is not let in by role');
  assert.ok(html.includes('return `${cSeesNeedsYou() ? `<section class="kday m-scene" aria-label="Needs you">'));
});

test('Home asks for last year up to the same day, and says it quietly', () => {
  assert.ok(html.includes("ly ? api(`/api/report?from=${ly}-01-01&to=${ly}-${md}&asof=end`).catch(() => null) : null"), 'admissions up to that day');
  assert.ok(html.includes("const ly = year === cNowYear() ? year - 1 : null;"), 'only for the current year on its own');
  assert.ok(html.includes('<span class="kly">Last year around this time: ${n}</span>'));
  assert.ok(html.includes('${ly(D.lastYear && D.lastYear.admitted)}') && html.includes('${ly(D.lastYear && D.lastYear.leads)}')
    && html.includes('${ly(D.lastYear && D.lastYear.conversion)}'), 'Leads, Admitted and Conversion');
  assert.match(html, /html\.ui-c #view \.kly\{display:block;margin-top:4px;font-size:12px;font-weight:500;color:var\(--t3\)/);
});

test('the measured wave, the conversion bar and the median split: every number opens its Reports', () => {
  assert.match(html, /function cWave\(months, key, chapter\) \{/);
  assert.ok(html.includes('onclick="cGoReportMonth(${esc(JSON.stringify(String(chapter || \'\')))}, ${esc(JSON.stringify(months[i].month))});return false"'), 'a wave number opens its month');
  assert.match(html, /function cGoReportMonth\(chapter, ym\) \{\n  C_RPT_PRESET = 'year'; RPT = \{ from: ym\.slice\(0, 4\) \+ '-01-01', to: '' \}; C_REP_MONTH = ym;/);
  assert.match(html, /function cConvBar\(pct, lastYear\) \{/);
  assert.match(html, /function cDaysSplit\(days\) \{/);
  assert.match(html, /const C_MED_GROUPS = \[\['under 1 month', 0, 30\], \['1-3 months', 31, 91\], \['3-6 months', 92, 183\], \['over 6 months', 184, Infinity\]\];/);
  for (const f of ['cConvBar', 'cDaysSplit']) {
    const body = html.slice(html.indexOf(`function ${f}(`), html.indexOf('\n}\n', html.indexOf(`function ${f}(`)));
    assert.match(body, /cGoReportYear\('(conversion|median)'\)/, f + ' numbers open Reports');
  }
  const order = ['<div><span>Leads</span>', '<div class="khero"><span>Admitted</span>', '<div><span>Conversion</span>', '<div><span>Median time to admission</span>'].map((x) => html.indexOf(x));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'Leads, Admitted, Conversion, Median');
});

test('the server: median over known first contacts; last year counts admissions up to that day', async () => {
  const { openDb } = await import('../src/db.js');
  const { report } = await import('../src/reports.js');
  const db = await openDb(':memory:');
  const add = (id, ch, c, a) => db.prepare(`INSERT INTO people (id, name, status, first_channel, created_at, admitted_at) VALUES (?,?,?,?,?,?)`)
    .run(id, id, a ? 'Admitted' : 'New', ch, c, a);
  await add('s1', 'sis', '2025-03-01T09:00:00Z', '2025-03-01T09:00:00Z');        // one date: not a known first contact
  await add('k1', 'phone', '2025-01-10T09:00:00Z', '2025-03-01T09:00:00Z');      // 50 days
  await add('k2', 'email', '2025-02-01T09:00:00Z', '2025-03-03T09:00:00Z');      // 30 days
  await add('k3', 'email', '2025-01-05T09:00:00Z', '2025-12-01T09:00:00Z');      // admitted after the day
  const r = await report(db, { from: '2025-01-01', to: '2025-06-30', asOfEnd: true });
  assert.equal(r.summary.medianOf, 2, 'the SIS-only record is left out');
  assert.deepEqual(r.summary.admitDays, [30, 50]);
  const all = await report(db, { from: '2025-01-01', to: '2025-06-30' });
  assert.ok(r.summary.conversionA < all.summary.conversionA || r.summary.conversionA === all.summary.conversionA - 1,
    'as of the day, the December admission is not counted');
  await db.close();
});
