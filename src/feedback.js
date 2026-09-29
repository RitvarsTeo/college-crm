// Feedback from inside the app: a bug or an idea, optionally with a screenshot.
//
// The browser is asked to shrink and re-encode the image before sending, but the
// browser is a courtesy, not a control. Everything below assumes the string
// arriving from the network was written by somebody who wants to hurt us, so the
// declared type is ignored and the bytes themselves are read instead. An HTML
// file labelled image/png must never be stored and handed back to an admin.

const MAX_BYTES = 1536000;                     // 1.5 MB decoded
// Refuse on the length of the ENCODED string, before spending memory on a decode.
export const MAX_CHARS = Math.ceil(MAX_BYTES / 3) * 4 + 64;
const DATA_URL = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

// QUESTION (29.09.2026, dev kit part 3): asked from the Help center when the answer is not there yet.
export const KINDS = ['BUG', 'IDEA', 'QUESTION'];
export const MIN_BODY = 4;

// ------------------------------------------------ the Help center's questions (dev kit part 3)
// WHICH QUESTIONS PEOPLE OPEN, counted for everybody, so the Help center shows the most opened
// first. Only a count per question id: no person, nothing to say who opened what.
/** A help question id: lower-case words and hyphens, as written in config/help.json. */
export const HELP_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export async function helpOpened(db, id, at) {
  if (!HELP_ID.test(String(id || ''))) throw new BadScreenshot('Not a help question.');
  // one statement, so two people opening the same question at once both count
  await db.prepare(`INSERT INTO help_faq_opens (faq_id, opens, last_at) VALUES (?, 1, ?)
    ON CONFLICT (faq_id) DO UPDATE SET opens = help_faq_opens.opens + 1, last_at = excluded.last_at`).run(String(id), at);
}
export async function helpCounts(db) {
  const rows = await db.prepare('SELECT faq_id, opens FROM help_faq_opens').all();
  return Object.fromEntries(rows.map((r) => [r.faq_id, Number(r.opens)]));
}
export const MAX_BODY = 2000;

// What the first bytes say the file really is. The declared type is not consulted.
function sniff(buf) {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF'
    && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export class BadScreenshot extends Error {}

// null means 'no screenshot was sent', which is allowed. A screenshot that is
// present but wrong throws, because dropping it silently would let somebody
// believe their evidence went with the message when it did not.
export function readScreenshot(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new BadScreenshot('The screenshot must be sent as text.');
  if (value.length > MAX_CHARS) throw new BadScreenshot('That screenshot is too big to send.');

  const m = DATA_URL.exec(value);
  if (!m) throw new BadScreenshot('That does not look like an image we can read.');

  const b64 = m[2];
  const buf = Buffer.from(b64, 'base64');
  // Node's decoder skips characters it does not understand instead of failing, so
  // the only way to know the string was really base64 is to encode it back.
  const strip = (s) => s.replace(/=+$/, '');
  if (strip(buf.toString('base64')) !== strip(b64)) {
    throw new BadScreenshot('That screenshot did not survive the trip. Try attaching it again.');
  }
  if (!buf.length) throw new BadScreenshot('That screenshot is empty.');
  if (buf.length > MAX_BYTES) throw new BadScreenshot('That screenshot is too big to send.');

  const mimeType = sniff(buf);
  if (!mimeType) throw new BadScreenshot('Only PNG, JPEG and WebP images can be attached.');

  return { mimeType, bytes: buf, sizeBytes: buf.length };
}

export function readKind(value) {
  const kind = String(value || '').toUpperCase();
  if (!KINDS.includes(kind)) throw new BadScreenshot('Say whether this is an idea, something broken or a question.');
  return kind;
}

export function readBody(value) {
  const body = String(value ?? '').trim();
  if (body.length < MIN_BODY) throw new BadScreenshot('Write a little more, so we can act on it.');
  if (body.length > MAX_BODY) throw new BadScreenshot(`Keep it under ${MAX_BODY} characters.`);
  return body;
}

// The path is a hint from the client, for display only, and it is cut short.
// The query string is dropped, because a query string can carry a token or
// somebody's personal data. The hash is KEPT: this app routes on the hash, so
// location.pathname is '/' on every screen and would tell an admin nothing.
export function readPath(value) {
  if (!value) return null;
  const v = String(value).split('?')[0].slice(0, 200);
  // Only an address INSIDE the app is kept ("#/person/p1", "/"). The path is shown to
  // the readers as a link, so anything else - "javascript:...", "//elsewhere" - would
  // be a link a colleague could plant in an admin's inbox (found 28.09.2026).
  return /^(#\/|\/(?!\/))/.test(v) ? v : null;
}

// The feedback row and its screenshot are written together. A bug report must
// never exist without the evidence its sender attached to it.
export async function saveFeedback(db, { kind, body, path, screenshot, by, at }) {
  return db.transaction(async (tx) => {
    const r = await tx.prepare(`INSERT INTO feedback (author, kind, body, path, created_at)
      VALUES (?,?,?,?,?)`).run(by, kind, body, path, at);
    const id = Number(r.lastInsertRowid);
    if (screenshot) {
      await tx.prepare(`INSERT INTO feedback_screenshots (feedback_id, mime_type, size_bytes, data, created_at)
        VALUES (?,?,?,?,?)`).run(id, screenshot.mimeType, screenshot.sizeBytes, screenshot.bytes, at);
    }
    return { id, screenshot: Boolean(screenshot) };
  });
}

// Open items first, then the handled ones, which the inbox fades rather than
// hides. The image bytes are deliberately not selected here.
export async function listFeedback(db, limit = 200) {
  return (await db.prepare(`SELECT f.*, s.mime_type, s.size_bytes
    FROM feedback f LEFT JOIN feedback_screenshots s ON s.feedback_id = f.id
    ORDER BY (f.handled_at IS NOT NULL), f.created_at DESC LIMIT ?`).all(limit))
    .map((r) => ({
      id: r.id, kind: r.kind, body: r.body, path: r.path,
      author: r.author, createdAt: r.created_at, handledAt: r.handled_at,
      screenshot: r.mime_type ? { mimeType: r.mime_type, sizeBytes: r.size_bytes } : null,
    }));
}

export async function getScreenshot(db, id) {
  return await db.prepare('SELECT mime_type, data FROM feedback_screenshots WHERE feedback_id = ?').get(id) || null;
}

export async function setHandled(db, id, handled, by, at) {
  const before = await db.prepare('SELECT handled_at FROM feedback WHERE id = ?').get(id);
  if (!before) return { error: 'not found' };
  const was = Boolean(before.handled_at);
  await db.prepare('UPDATE feedback SET handled_at = ?, handled_by = ? WHERE id = ?')
    .run(handled ? at : null, handled ? by : null, id);
  return { ok: true, handled, changed: was !== Boolean(handled) };
}
