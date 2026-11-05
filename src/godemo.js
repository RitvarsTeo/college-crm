// THE GRAND OPENING DEMO IN INTAKE (05.11.2026). The owner: "demo should be in the intake. For me, MC, Marcis, Aigars,
// Aleksejs." and "We need the links on the demo to be clickable for anyone that can open the demo!" The demo page and every
// file it links to (the letters, the 32x32 position list, the QR and the puzzle pictures) sit in src/go-demo, copied from the
// Grand Opening folder, and are served side by side under /api/tc/go/demo/, so each relative link opens. Behind the sign-in
// door and the Training Centre area like every /api/tc/ path, and then only for the accounts in config/tc.json
// grandOpening.demo.viewers (fails closed: an empty list opens it to nobody). Only files that exist in src/go-demo are served.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TC } from './tc.js';
import { s2Mail } from './tcs2mail.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'go-demo');
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
export const PREFIX = '/api/tc/go/demo/';

function walk(dir, base = '') {
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) for (const [k, v] of walk(path.join(dir, e.name), rel)) out.set(k, v);
    else if (TYPES[path.extname(e.name).toLowerCase()]) out.set(rel, path.join(dir, e.name));
  }
  return out;
}
const FILES = walk(DIR);

export const viewers = () => (((TC.grandOpening || {}).demo || {}).viewers || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
export const mayView = (me) => Boolean(me && me.email && viewers().includes(String(me.email).toLowerCase()));

// THE STAGE 2 LETTERS (05.11.2026, his words: "ŠĪ vēstule nav īštā vēstule, iznem no demo. tak tas nav stage 2 rsvp!!"): the
// demo shows the three Stage 2 emails exactly as Intake sends them, drawn from src/tcs2mail.js on each open, to the viewer's
// first name, with the test link code the Grand Opening demo uses. The building picture is the one the email carries inline.
const LETTERS = { 'letters/2_will_you_be_there.html': 'confirm', 'letters/3_you_are_invited.html': 'invite', 'letters/4_new_contact.html': 'new' };
const BUILDING = path.join(path.dirname(DIR), 'assets', 'go-building.jpg');
const DEMO_CODE = 'rvtst1';
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function letter(kind, first) {
  const m = s2Mail(kind, first, DEMO_CODE);
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(m.subject)
    + '</title><style>body{margin:0;background:#e7ebf0}.subj{max-width:600px;margin:16px auto 0;padding:10px 16px;background:#fff;border-radius:6px;font:600 14px Raleway,Arial;color:#0a2463}</style></head><body>'
    + '<div class="subj">Subject: ' + esc(m.subject) + '</div>' + m.html.replace('src="cid:building"', 'src="building.jpg"') + '</body></html>';
}

/** The file for a path under PREFIX: { file | body, type } or null. The folder itself is the page. */
export function fileFor(pathname, me = null) {
  let rel;
  try { rel = decodeURIComponent(String(pathname).slice(PREFIX.length)); } catch (e) { return null; }
  if (LETTERS[rel]) return { body: letter(LETTERS[rel], String((me && me.name) || '').split(/\s+/)[0] || ''), type: TYPES['.html'] };
  if (rel === 'letters/building.jpg') return { file: BUILDING, type: TYPES['.jpg'] };
  const file = FILES.get(rel || 'index.html');
  return file ? { file, type: TYPES[path.extname(file).toLowerCase()] } : null;
}
export const read = (f) => (f.body !== undefined ? Buffer.from(f.body, 'utf8') : fs.readFileSync(f.file));
