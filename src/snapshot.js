// Real data must always be restorable.
//
// The rule here is that a snapshot is taken from the SOURCE, at the moment the
// real database is loaded, and is never reconstructed from whatever happens to be
// in the database afterwards. Once somebody has played in demo mode, the live
// tables are no longer evidence of anything.
//
// Restoring wipes every table and replays the snapshot row for row. A checksum is
// recorded at write time and checked after a restore, so "restored" is something
// that was verified rather than something that was assumed.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Read at CALL time, not at import time. As a module constant a test could not
// point it somewhere harmless, which meant a test run wrote over the real
// snapshot - exactly the accident this file exists to prevent.
export const snapshotFile = () => process.env.CRM_SNAPSHOT || path.join(ROOT, 'data', 'real_snapshot.json');

// Every table that carries CRM state. feedback is deliberately NOT here: it is
// about the software, not about the data, and it must survive a restore.
export const TABLES = ['people', 'events', 'tasks', 'documents', 'open_days', 'registrations',
  'consents', 'sim_events', 'inbound', 'field_values'];

const checksum = (payload) =>
  crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);

export function dump(db) {
  const tables = {};
  for (const t of TABLES) {
    tables[t] = db.prepare(`SELECT * FROM ${t}`).all().map((row) => {
      // a BLOB comes back as a typed array and does not survive JSON, so it is
      // stored as base64 with a marker rather than silently becoming an object
      const out = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = (v instanceof Uint8Array) ? { _b64: Buffer.from(v).toString('base64') } : v;
      }
      return out;
    });
  }
  return tables;
}

export function write(db, meta = {}) {
  const tables = dump(db);
  const payload = { tables, counts: Object.fromEntries(TABLES.map((t) => [t, tables[t].length])) };
  const snap = {
    takenAt: new Date().toISOString(),
    what: 'The real Novikontas admissions database, as loaded from data/real_people.json.',
    warning: 'Written once, from the source. Never rebuilt from a live database that somebody has been testing in.',
    ...meta,
    checksum: checksum(payload),
    ...payload,
  };
  const file = snapshotFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(snap));
  return { takenAt: snap.takenAt, counts: snap.counts, checksum: snap.checksum };
}

export function exists() {
  return fs.existsSync(snapshotFile());
}

export function info() {
  if (!exists()) return null;
  try {
    const s = JSON.parse(fs.readFileSync(snapshotFile(), 'utf8'));
    return { takenAt: s.takenAt, counts: s.counts, checksum: s.checksum,
      people: (s.counts && s.counts.people) || 0, source: s.source || null };
  } catch { return null; }
}

// Wipe and replay. Returns what was restored and whether it matches the checksum
// the snapshot was written with.
export function restore(db) {
  if (!exists()) return { error: 'there is no real-data snapshot to restore' };
  const snap = JSON.parse(fs.readFileSync(snapshotFile(), 'utf8'));
  const tables = snap.tables || {};

  db.exec('BEGIN');
  try {
    // children first, so a foreign key never blocks the wipe
    for (const t of [...TABLES].reverse()) db.exec(`DELETE FROM ${t}`);
    for (const t of TABLES) {
      const rows = tables[t] || [];
      if (!rows.length) continue;
      const cols = Object.keys(rows[0]);
      const stmt = db.prepare(
        `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
      for (const r of rows) {
        stmt.run(...cols.map((c) => {
          const v = r[c];
          return (v && typeof v === 'object' && v._b64) ? Buffer.from(v._b64, 'base64') : v;
        }));
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return { error: 'the restore failed and nothing was changed: ' + err.message };
  }

  // Proof, not assumption: read the database back and checksum it the same way.
  const after = dump(db);
  const payload = { tables: after, counts: Object.fromEntries(TABLES.map((t) => [t, after[t].length])) };
  const now = checksum(payload);
  return {
    ok: true,
    verified: now === snap.checksum,
    checksum: now,
    expected: snap.checksum,
    counts: payload.counts,
    takenAt: snap.takenAt,
  };
}
