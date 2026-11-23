// ONE-OFF (patch 162, 23.11.2026): TeleGroup's pushed `date` is UTC, but patch 161 read it as Riga time, so every
// event it stored is exactly 2 hours early. This moves those rows forward 2 hours, and only those:
//   call_events  source 'provider', received since 161 went live, `at` 115-125 minutes before received_at
//   pbx_calls    the calls of those events stored since then (called_at)
//   events       the person's history line written for such a call (kind 'call', occurred_at = the old called_at)
//   tasks        a Call back step made for such a call (due_at = the old called_at, created since then)
//   people       last_contact_at when it is exactly the old called_at
//   inbound      received_at / surface_at when exactly the old called_at
// DRY RUN by default: prints every row it would change and changes nothing. --apply writes it all in ONE transaction,
// after a verified backup. No phone numbers or names are printed.
//
//   node scripts/fix_telegroup_utc_2026_11_23.mjs            (dry run)
//   node scripts/fix_telegroup_utc_2026_11_23.mjs --apply
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/ritvarsv/Desktop/WF/Local Repo/Projects/Backups/x.js');
const pg = require('pg');
const { readEnv } = await import('file:///C:/Users/ritvarsv/Desktop/WF/Local%20Repo/Projects/Backups/lib.mjs');
const env = readEnv('C:/Users/ritvarsv/Desktop/WF/Local Repo/Projects/College CRM/crm-applications/.env.local', ['INTAKE_SUPABASE_DATABASE_URL']);
const purl = new URL(env.INTAKE_SUPABASE_DATABASE_URL.trim()); purl.searchParams.delete('sslmode'); purl.searchParams.delete('channel_binding');
const APPLY = process.argv.includes('--apply');
const SINCE = '2026-11-23T10:00:00Z';
const SHIFT = 2 * 3600 * 1000;
const plus = (iso) => new Date(Date.parse(iso) + SHIFT).toISOString();
const iso = (v) => (v instanceof Date ? v.toISOString() : String(v));
const pc = new pg.Client({ connectionString: purl.toString(), ssl: { ca: fs.readFileSync('C:/Users/ritvarsv/Desktop/WF/Local Repo/Projects/College CRM/crm-tc-data2/config/supabase-root-2021-ca.crt', 'utf8'), rejectUnauthorized: true } });
await pc.connect();
const plan = [];
try {
  await pc.query(APPLY ? 'BEGIN' : 'BEGIN READ ONLY');
  const evs = (await pc.query(`SELECT id, call_id, event, at, received_at FROM crm.call_events WHERE source = 'provider' AND received_at >= $1 ORDER BY id`, [SINCE])).rows
    .filter((r) => { const d = (Date.parse(iso(r.received_at)) - Date.parse(iso(r.at))) / 60000; return d >= 115 && d <= 125; });
  for (const r of evs) plan.push(['call_events', r.id, 'at', iso(r.at), plus(iso(r.at)), r.event]);
  const ids = [...new Set(evs.map((r) => r.call_id))];
  const calls = ids.length ? (await pc.query(`SELECT uniqueid, called_at, person_id, inbound_id FROM crm.pbx_calls WHERE uniqueid = ANY($1) AND inserted_at >= $2`, [ids, SINCE])).rows : [];
  for (const c of calls) {
    const old = iso(c.called_at);
    // only a call whose time is the one an early event gave it
    if (!evs.some((e) => e.call_id === c.uniqueid && iso(e.at) === old)) continue;
    plan.push(['pbx_calls', c.uniqueid, 'called_at', old, plus(old)]);
    if (c.person_id) {
      for (const e of (await pc.query(`SELECT id, occurred_at FROM crm.events WHERE person_id = $1 AND kind = 'call' AND occurred_at = $2`, [c.person_id, old])).rows)
        plan.push(['events', e.id, 'occurred_at', old, plus(old)]);
      for (const t of (await pc.query(`SELECT id FROM crm.tasks WHERE person_id = $1 AND label = 'Call back' AND due_at = $2 AND created_at >= $3`, [c.person_id, old, SINCE])).rows)
        plan.push(['tasks', t.id, 'due_at', old, plus(old)]);
      if ((await pc.query(`SELECT 1 FROM crm.people WHERE id = $1 AND last_contact_at = $2`, [c.person_id, old])).rows.length)
        plan.push(['people', c.person_id, 'last_contact_at', old, plus(old)]);
    }
    if (c.inbound_id) {
      const ib = (await pc.query(`SELECT received_at, surface_at FROM crm.inbound WHERE id = $1`, [c.inbound_id])).rows[0];
      if (ib && iso(ib.received_at) === old) plan.push(['inbound', c.inbound_id, 'received_at', old, plus(old)]);
      if (ib && iso(ib.surface_at) === old) plan.push(['inbound', c.inbound_id, 'surface_at', old, plus(old)]);
    }
  }
  console.table(plan.map(([table, id, column, from, to, note]) => ({ table, id: String(id), column, from, to, note: note || '' })));
  if (APPLY) {
    const KEY = { call_events: 'id', pbx_calls: 'uniqueid', events: 'id', tasks: 'id', people: 'id', inbound: 'id' };
    let n = 0;
    for (const [table, id, column, from, to] of plan) {
      // only while the value is still the early one: a row changed meanwhile is left alone
      const r = await pc.query(`UPDATE crm.${table} SET ${column} = $1 WHERE ${KEY[table]} = $2 AND ${column} = $3`, [to, id, from]);
      n += r.rowCount;
    }
    if (n !== plan.length) throw new Error(`expected ${plan.length} rows, changed ${n}: rolled back`);
    await pc.query('COMMIT');
    console.log(`APPLIED: ${n} values moved +2 h`);
  } else {
    await pc.query('ROLLBACK');
    console.log(`DRY RUN: ${plan.length} values would move +2 h; nothing written`);
  }
} catch (e) { await pc.query('ROLLBACK').catch(() => {}); console.error('FAILED, nothing written:', e.message); process.exitCode = 1; }
finally { await pc.end(); }
