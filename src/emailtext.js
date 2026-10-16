// WHAT THE PERSON NEWLY WROTE (the owner, 16.10.2026, with a screenshot: "why emails show up this messy???").
// An email arrives as the whole thread: the person's two lines, then our own message quoted under an Outlook
// "From: ... Sent: ... To: ... Subject:" block, our signature with every link spelled out twice, image placeholders
// and a legal notice in Latvian. cleanEmailBody keeps only the person's own new text, for DISPLAY: the stored body is
// never changed, so "Show original" still has every byte. One pure function, used by every reader that shows an email
// body (listInbound for the Inbox card and the Make a lead form, messagesFor for the person's History).
//
// Never cuts the person's own message: a sign-off is trimmed only when what follows it is clearly a signature
// (contact lines, links), a notice only as a whole paragraph that matches a known notice, and when nothing is left
// the first lines of the original are shown instead (emailShown).

export const EMAIL_CHANNELS = ['gmail', 'email'];
export const isEmailChannel = (channel) => EMAIL_CHANNELS.includes(String(channel || ''));

// --------------------------------------------------------------- where the quoted history starts --
const FORWARD_MARK = /^\s*[-_=]{2,}\s*(forwarded message|pārsūtīta ziņa|pārsūtītā vēstule|пересланное сообщение|weitergeleitete nachricht)\s*[-_=]{2,}\s*$/i;
const ORIGINAL_MARK = /^\s*[-_=]{2,}\s*(original message|sākotnējā ziņa|sākotnējais ziņojums|исходное сообщение|ursprüngliche nachricht)\s*[-_=]{2,}\s*$/i;
const RULE_LINE = /^\s*_{8,}\s*$/;                                    // Outlook's line above its header block
const HEAD_FROM = /^\s*\*?\s*(from|no|sūtītājs|от|von)\s*:\s*\*?\s*\S/i;
const HEAD_NEXT = /^\s*\*?\s*(sent|date|to|cc|subject|nosūtīts|datums|kam|tēma|отправлено|дата|кому|тема|gesendet|an|betreff)\s*:/i;
// "On Fri, 16 Oct 2026 at 09:24, Name <x@y> wrote:" - Gmail wraps it over two or three lines
const WROTE_END = /((\bwrote|rakstīja|написал\(а\)|написала|написал|пишет|schrieb|a écrit)\s*:|<[^<>\s]+@[^<>\s]+>\s*:)\s*$/i;
// how such a line starts: "On", "Am", "Le", a date, a short day name and a date ("pk, 16. okt.", "пт, 16 окт.")
const WROTE_START = /^\s*(on\b|am\b|le\b|\d|\p{L}{1,4}[.,]?\s+\d|\p{L}+,\s+\d)/iu;

const quoted = (l) => /^\s*>/.test(l);

// The index of the first line of the quoted history, the kind of break, and where the header block ends.
function findBreak(lines) {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (quoted(l)) continue;
    if (FORWARD_MARK.test(l)) return { at: i, forward: true, body: headerEnd(lines, i + 1) };
    if (ORIGINAL_MARK.test(l)) return { at: i, forward: false, body: headerEnd(lines, i + 1) };
    // Outlook's block, one field a line ("From: ...", "Sent: ...") or flattened into one line
    if (HEAD_FROM.test(l) && (lines.slice(i + 1, i + 5).some((n) => HEAD_NEXT.test(n))
      || /\s(sent|date|nosūtīts|datums|отправлено|дата)\s*:\s*\S.*\s(to|kam|кому|subject|tēma|тема)\s*:/i.test(l))) {
      const at = i > 0 && RULE_LINE.test(lines[i - 1]) ? i - 1 : i;
      return { at, forward: false, header: true, body: headerEnd(lines, i) };
    }
    // the "... wrote:" line, joined with up to two lines above it when Gmail wrapped it
    if (WROTE_END.test(l)) {
      let at = i;
      for (let k = 1; k <= 2 && i - k >= 0; k++) {
        const up = lines[i - k];
        if (!up.trim() || quoted(up)) break;
        const joined = lines.slice(i - k, i + 1).join(' ');
        if (joined.length > 320) break;
        if (WROTE_START.test(up) || /[<@]/.test(up)) at = i - k;
      }
      const said = lines.slice(at, i + 1).join(' ');
      if ((WROTE_START.test(lines[at]) && /\d/.test(said)) || /<[^<>\s]+@[^<>\s]+>/.test(said)) {
        return { at, forward: false, body: i + 1 };
      }
    }
  }
  return null;
}

// After a forward or header block: the header lines run to the first blank line.
function headerEnd(lines, from) {
  let i = from;
  while (i < lines.length && !lines[i].trim()) i++;
  while (i < lines.length && lines[i].trim()) i++;
  return i;
}

// ------------------------------------------------------------------------------------- signatures --
const SIGN_OFF = /^\s*(sincerely|best regards|kind regards|warm regards|regards|best wishes|best|thanks|thank you|many thanks|cheers|ar cieņu|ar labiem vēlējumiem|ar sveicieniem|ar cieņu un labiem vēlējumiem|paldies|sveicieni|с уважением|с наилучшими пожеланиями|всего доброго|спасибо|mit freundlichen grüßen)\s*[,.!]?\s*$/i;
// what a signature line looks like: a phone, an address, a link, a title, an image
const CONTACT = /(\+?\d[\d\s()./-]{6,}\d)|(@[\w-]+\.[\w.]+)|(https?:\/\/|www\.)|(^\s*\*?\s*[TMEAPF]\s*:)|(\b(tel|tālr|mob|phone|fax|e-?mail|e-?pasts|адрес|тел)\b\.?\s*:?)|(\[image)|(\b(iela|street|str\.|LV-\d{4})\b)/i;
const OUR_SIGNATURE = /(customer relations department|novikontas academy|novikontas maritime college|www\.novikontas\.org|@novikontas\.org)/i;

// a line that can sit in a signature: short, no sentence that runs on, no question
const sigLike = (l) => l.trim().length <= 90 && !/\?\s*$/.test(l);

function cutSignature(lines) {
  // RFC 3676 "-- " separator: everything under it is the signature
  const dash = lines.findIndex((l) => /^\s*--\s*$/.test(l));
  if (dash > 0 && lines.length - dash <= 20) lines = lines.slice(0, dash);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!SIGN_OFF.test(lines[i])) continue;
    const after = lines.slice(i + 1);
    const filled = after.filter((l) => l.trim());
    if (!filled.length) continue;
    // ours (Laura ... Customer Relations Department ... NOVIKONTAS Academy): the whole block goes, sign-off and all
    const ours = filled.some((l) => /customer relations department/i.test(l))
      || (filled.some((l) => OUR_SIGNATURE.test(l)) && filled.filter((l) => CONTACT.test(l)).length >= 2);
    if (ours && filled.length <= 30) return lines.slice(0, i);
    // anybody's: only when what follows is clearly a signature, and then the sign-off and the name stay
    if (filled.length <= 15 && filled.some((l) => CONTACT.test(l)) && filled.every(sigLike)) {
      const keep = [];
      for (const l of after) {
        if (!l.trim()) { if (keep.length) break; continue; }
        if (CONTACT.test(l) || keep.length >= 1) break;
        keep.push(l);
      }
      return [...lines.slice(0, i + 1), ...keep];
    }
  }
  // our own signature with no sign-off line above it (the name, then the department)
  const dept = lines.findIndex((l) => /customer relations department/i.test(l));
  if (dept >= 0 && lines.length - dept <= 30) {
    let at = dept;
    if (at > 0 && lines[at - 1].trim() && lines[at - 1].trim().length <= 40) at--;
    return lines.slice(0, at);
  }
  return lines;
}

// ------------------------------------------------------------------------- notices and phone lines --
const NOTICE = [
  /šis e-pasts(\s+un\s+tā\s+pielikum\S*)?.{0,80}(var saturēt|satur|konfidenciāl|ierobežotas pieejamības)/i,
  /šī e-pasta vēstule.{0,80}(konfidenciāl|paredzēta)/i,
  /ja jūs neesat (šī e-pasta|šīs vēstules|paredzētais) (adresāts|saņēmēj)/i,
  /\bthis (e-?mail|message|communication)\b.{0,80}\b(confidential|privileged|intended (solely|only)|may contain)/i,
  /\bif you (are not the intended recipient|have received this (e-?mail|message|communication) in error)/i,
  /^\s*(confidentiality notice|disclaimer|legal notice|privileged (&|and) confidential)\b/i,
  /(это|данное) (электронное )?(письмо|сообщение).{0,80}(конфиденциальн|предназначен)/i,
  /если вы не являетесь (адресатом|получателем)/i,
  /please consider the environment before printing/i,
  /lūdzu,? padomājiet par vidi/i,
  // our own lines under the signature
  /your personal data or data we exchange is processed/i,
  /novikontas (data protection|cancellation) policy/i,
];
const DEVICE = /^\s*(sent from (my )?\S.*|sent with .{1,30}|get outlook for \S.*|nosūtīts no (mana|manas|sava) .*|sūtīts no .*|отправлено с .*|отправлено из .*)$/i;

// ----------------------------------------------------------------------------- inline litter --
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|igsh|igshid|mc_cid|mc_eid|_hsenc|_hsmi|mkt_tok|yclid|si)$/i;
function untrack(url) {
  const q = url.indexOf('?');
  if (q < 0) return url;
  const hashAt = url.indexOf('#', q);
  const base = url.slice(0, q);
  const query = url.slice(q + 1, hashAt < 0 ? undefined : hashAt);
  const hash = hashAt < 0 ? '' : url.slice(hashAt);
  const kept = query.split('&').filter((kv) => kv && !TRACKING.test(kv.split('=')[0]));
  return base + (kept.length ? '?' + kept.join('&') : '') + (hash === '#' ? '' : hash);
}

function tidyInline(text) {
  return text
    // [cid:image001.png@01DD...] placeholders
    .replace(/\[cid:[^\]]{0,200}\]/gi, '')
    // an icon or image label with its link: "[Facebook Icon Small Square] <https://...>", "[image: X]\n<https://...>"
    .replace(/\[(?:image:)?[^\]\n]{0,80}(?:\n[^\]\n]{0,80})?\]\s*<https?:[^>\s]*>/gi, '')
    // Gmail's "[image: ...]" and icon labels on their own
    .replace(/\[image:[^\]]{0,160}\]/gi, '')
    .replace(/\[[^\]\n]{0,60}\b(icon|logo|banner)\b[^\]\n]{0,60}\]/gi, '')
    // Google signature images
    .replace(/\[?\s*https?:\/\/[\w.-]*googleusercontent\.com\/mail-sig\/[^\s\]>]*\s*\]?/gi, '')
    // "name@x.org<mailto:name@x.org>" and "name@x.org <name@x.org>": the address once
    .replace(/\s*<mailto:[^>\s]*>/gi, '')
    .replace(/([\w.+-]+@[\w-]+\.[\w.-]+)(\s*\*?\s*)<\1>/gi, '$1')
    // "www.x.org<http://www.x.org/>" and "click here <https://...>": the link text once ("Here: <https://...>" is
    // the link itself, kept below)
    .replace(/([^\s:])[ \t]*<https?:\/\/[^>\s]*>/g, '$1')
    // a link left alone in angle brackets: the link itself
    .replace(/<(https?:\/\/[^>\s]*)>/g, '$1')
    // tracking query strings
    .replace(/https?:\/\/[^\s<>\])]+/g, (u) => untrack(u));
}

// ---------------------------------------------------------------------------------------- the cleaner --
// subjectFirstLine: the stored email body is "<subject>\n<text>" (src/adapters.js toIntake); a first line that is the
// subject is kept and never counted as something the person wrote before a forward.
export function cleanEmailBody(text, { subjectFirstLine = false, depth = 0 } = {}) {
  if (text === null || text === undefined) return '';
  let lines = String(text).replace(/\r\n?/g, '\n').replace(/[   ]/g, ' ').replace(/​|﻿/g, '').split('\n');

  const brk = findBreak(lines);
  if (brk) {
    const before = lines.slice(0, brk.at);
    const own = before.filter((l, i) => l.trim() && !(subjectFirstLine && i === 0)
      && !/^\s*(re|fwd?|fw|aw|wg|tr|pārs|пересл|отв)\s*:/i.test(l));
    // a message that is ONLY a forward: what was forwarded IS the message, without its header block. Only a forward:
    // a reply with nothing new in it never shows our own quoted message as if the person had written it.
    const fwSubject = before.some((l) => /^\s*(fwd?|fw|wg|tr|pārs|пересл)\s*:/i.test(l));
    if (!own.length && depth < 2 && (brk.forward || (brk.header && fwSubject))) {
      const inner = cleanEmailBody(lines.slice(brk.body).join('\n'), { depth: depth + 1 });
      if (inner) return [...before.filter((l) => l.trim()).map((l) => tidyInline(l).trim()), inner].filter(Boolean).join('\n');
    }
    lines = before;
  }
  lines = lines.filter((l) => !quoted(l));

  // notices go as whole paragraphs and device lines one by one, then the signature (a notice's long lines under a
  // signature would otherwise make it look like text the person wrote)
  const paras = [];
  let cur = [];
  for (const l of lines) {
    if (l.trim()) cur.push(l); else if (cur.length) { paras.push(cur); cur = []; }
  }
  if (cur.length) paras.push(cur);
  const kept = paras
    .map((p) => p.filter((l) => !DEVICE.test(l)))
    .filter((p) => p.length && !NOTICE.some((rx) => rx.test(p.join(' '))));
  const body = cutSignature(kept.map((p) => p.join('\n')).join('\n\n').split('\n'));

  const out = tidyInline(body.join('\n'))
    .split('\n').map((l) => l.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out;
}

// What a reader shows: the cleaned text, else (cleaning left nothing) the first lines of the original.
export function emailShown(text, opts = {}) {
  const clean = cleanEmailBody(text, opts);
  const firstLines = (t) => String(t || '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5).join('\n');
  const subjectOnly = opts.subjectFirstLine && clean && !clean.includes('\n') && clean === firstLines(text).split('\n')[0]
    && firstLines(text).includes('\n');
  if (clean && !subjectOnly) return clean;
  return firstLines(text);
}

// The Inbox and the History read through this: the shown text for an email channel, null for anything else (so a
// reader can say "nothing changed" without comparing). A joined card's lines are cleaned one by one: cleaning the
// joined text would cut the second email at the first one's quoted history.
export function emailBodyFor(channel, body, lineBodies = null) {
  if (!isEmailChannel(channel)) return null;
  const parts = (lineBodies || []).filter((b) => String(b || '').trim());
  const shown = parts.length
    ? parts.map((b) => emailShown(b, { subjectFirstLine: true })).filter(Boolean).join('\n\n')
    : emailShown(body, { subjectFirstLine: true });
  return shown || null;
}
