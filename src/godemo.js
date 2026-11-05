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

/** The file for a path under PREFIX: { file, type } or null. The folder itself is the page. */
export function fileFor(pathname) {
  let rel;
  try { rel = decodeURIComponent(String(pathname).slice(PREFIX.length)); } catch (e) { return null; }
  const file = FILES.get(rel || 'index.html');
  return file ? { file, type: TYPES[path.extname(file).toLowerCase()] } : null;
}
export const read = (f) => fs.readFileSync(f.file);
