// THE HELP CENTER CLIPS (24.11.2026, the owner's pick B "A + short videos", then "Live app, signed-in only", "Silent
// clip + captions" and "Database, admin upload"). Short silent clips of the live app, one per role plus the Grand
// Opening list, each with its captions (WebVTT). The clips show real names, so they never enter git: an admin uploads
// them in the Help center and they are kept here, in the database, and served only to a signed-in account that opens
// the clip's half of Intake (Academy: /api/video/..., Training Centre: /api/tc/video/..., the area gate decides).

/** The clips Intake knows. A name is matched exactly; nothing else is ever stored or served. */
export const CLIPS = {
  admissions: { area: 'academy', title: 'Admissions in Intake' },
  'training-centre': { area: 'tc', title: 'Training Centre in Intake' },
  'go-list': { area: 'tc', title: 'Your Grand Opening list' },
};
export const MAX_MP4 = 3_000_000;    // bytes; a request to Vercel carries at most 4.5 MB, base64 adds a third
export const MAX_VTT = 20_000;       // characters
export const MAX_B64 = Math.ceil(MAX_MP4 / 3) * 4 + 16;

export class BadClip extends Error {}

/** The address a page plays the clip from. */
export const clipPath = (name, kind = 'mp4') => `${CLIPS[name].area === 'tc' ? '/api/tc/video/' : '/api/video/'}${name}.${kind}`;

/** "/api/video/admissions.mp4" -> { name, kind } when that clip lives under that address, else null. */
export function clipOfPath(p) {
  const m = /^\/api\/(tc\/)?video\/([a-z-]+)\.(mp4|vtt)$/.exec(String(p || ''));
  if (!m || !Object.hasOwn(CLIPS, m[2])) return null;
  if ((CLIPS[m[2]].area === 'tc') !== Boolean(m[1])) return null;
  return { name: m[2], kind: m[3] };
}

/** An MP4 file: 'ftyp' at byte 4. The declared type is not consulted. */
export function isMp4(buf) {
  return Buffer.isBuffer(buf) && buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp';
}
/** Captions: WebVTT, plain text only (no cue markup, no tags). */
export function cleanVtt(text) {
  const t = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!t.startsWith('WEBVTT') || t.length > MAX_VTT || /[<>]/.test(t.replace(/-->/g, ''))) throw new BadClip('Captions must be a WebVTT file of plain text.');
  return t;
}

/** Stores (or replaces) one clip. mp4 arrives base64, vtt as text. */
export async function saveClip(db, name, { mp4, vtt }, by, at) {
  if (!Object.hasOwn(CLIPS, String(name))) throw new BadClip('Not a known clip.');
  const b64 = String(mp4 || '').replace(/^data:video\/mp4;base64,/, '');
  if (!b64 || b64.length > MAX_B64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new BadClip('The clip must be an MP4 file under 3 MB.');
  const buf = Buffer.from(b64, 'base64');
  if (!isMp4(buf) || buf.length > MAX_MP4) throw new BadClip('The clip must be an MP4 file under 3 MB.');
  const caps = cleanVtt(vtt);
  await db.prepare(`INSERT INTO help_videos (name, mp4, size_bytes, vtt, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (name) DO UPDATE SET mp4 = excluded.mp4, size_bytes = excluded.size_bytes, vtt = excluded.vtt,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at`).run(name, buf, buf.length, caps, String(by || ''), at);
  return { name, bytes: buf.length };
}

export async function getClip(db, name) {
  if (!Object.hasOwn(CLIPS, String(name))) return null;
  const r = await db.prepare('SELECT mp4, vtt, updated_at FROM help_videos WHERE name = ?').get(name);
  return r ? { mp4: Buffer.from(r.mp4), vtt: r.vtt, updatedAt: r.updated_at } : null;
}

/** Which clips are there: for the page (play it or not) and for the admin list. */
export async function listClips(db) {
  const rows = await db.prepare('SELECT name, size_bytes, updated_by, updated_at FROM help_videos').all();
  const at = Object.fromEntries(rows.map((r) => [r.name, r]));
  return Object.entries(CLIPS).map(([name, c]) => ({ name, title: c.title, area: c.area, mp4: clipPath(name), vtt: clipPath(name, 'vtt'),
    ready: Boolean(at[name]), bytes: at[name] ? Number(at[name].size_bytes) : 0, updatedBy: at[name]?.updated_by || null, updatedAt: at[name]?.updated_at || null }));
}

/** A Range header -> [start, end] inside the file, or null for the whole file. */
export function byteRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m || (!m[1] && !m[2])) return null;
  let start = m[1] ? Number(m[1]) : size - Number(m[2]);
  let end = m[1] && m[2] ? Number(m[2]) : size - 1;
  start = Math.max(0, start); end = Math.min(size - 1, end);
  return start <= end ? [start, end] : 'bad';
}
