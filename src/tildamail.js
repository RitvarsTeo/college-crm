// TILDA FORM EMAILS (patch 190, his pick 27.11.2026: "Admissions need normal full information, not a notification").
//
// When somebody fills in a form on novikontas.org, Tilda emails edu@ from noreply@tilda.ws. That email is HTML only, and
// the Gmail pull keeps only plain text (lib/gmail.js plainTextOf), so the Inbox card read "Request from [novikontas.org]"
// and nothing else. For mail from Tilda only, the HTML is read here into the form's own fields: every "Label: value" line
// (or two-cell table row) the email shows, in its order. The labels are the form author's; the website adapter's
// field names read them (src/adapters.js tildaMailEvent). Tilda's own lines (Request ID, Form, Page / Block, Date) are
// kept apart: they say which form and page it was, and the Request ID is the same id the website webhook posts as
// tranid, which tells a copy of a submission Intake already has (src/sync.js syncGmail).
//
// The layout ASSUMED here is Tilda's standard notification (until a real one is read): one field per line or per table
// row, "Name: value", then Tilda's own lines. A layout with no such lines gives null, and the email stays as it was.

export const TILDA_SENDER = /(^|[<\s"])noreply@tilda\.(ws|cc)(?![\w.-])/i;
export const isTildaSender = (sender) => TILDA_SENDER.test(String(sender || ''));

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => String(s)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENT ? ENT[n.toLowerCase()] : m));

// Tilda's own lines, by any of the names it uses in English, Latvian and Russian notifications.
const OWN = [
  ['requestId', /^(request id|pieprasījuma id|id заявки|tranid)$/i],
  ['form', /^(form|forma|форма|form name|formname)$/i],
  ['page', /^(page|lapa|страница|block|bloks|блок|page url|url)$/i],
  ['date', /^(date|datums|дата|time|laiks|время)$/i],
];
const SKIP = /^(request details|request|pieprasījums|заявка|cookies|referer|ip|user agent|useragent)$/i;

export function tildaFieldsOf(html) {
  if (!html) return null;
  let t = String(html)
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ': ')          // a two-cell row reads "Label: value"
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  t = decode(t);
  const fields = [];
  const own = {};
  for (const raw of t.split('\n')) {
    const line = raw.replace(/[ \t ]+/g, ' ').trim();
    const m = /^([^:]{1,60}?)\s*:\s*(.+)$/.exec(line);
    if (!m) continue;
    const label = m[1].trim().replace(/^[-•*]\s*/, '');
    const value = m[2].trim();
    if (!label || !value || /^https?$/i.test(label) || SKIP.test(label)) continue;
    const mine = OWN.find(([, rx]) => rx.test(label));
    if (mine) { if (!own[mine[0]]) own[mine[0]] = value; continue; }
    fields.push([label, value]);
  }
  if (!fields.length) return null;
  return { fields, requestId: own.requestId || null, form: own.form || null, page: own.page || null };
}
