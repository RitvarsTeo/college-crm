// STAGE 2 EMAILS, PERSONAL FROM THE LIST'S OWNER (06.11.2026). The owner's decision: "all stage 2 emails will be like from a
// personal manager." Every Stage 2 email and every after-answer email (src/tcgomail.js) is a short note in the owner's own
// voice ("I"), signed with their name (and title when config/tc.json has one), sent from their own address so the reply goes
// to them. The facts, the picture (27.05.2005 -> 27.05.2027), the Yes button and the calendar link stay.
//   'confirm' = saw the Save the Date   'invite' = it may not have reached them   'new' = never sent the Save the Date
//   opts.remind = Reminder 1 (no answer yet)   opts.from = { name, title } the list's owner
const S2_PAGE = 'https://novikontas.org/grand-opening';
// the picture as the Grand Opening changed it 03.11.2026 (27.05.2005 -> 27.05.2027), Contacts/stage2_emails_appsscript_2026-10-22.js
const S2_INVITE_IMG = 'https://mcusercontent.com/742b7cc5cefdc84b1134d8ca1/images/52205135-b22f-0b43-d49c-4436ba613cd8.jpg';
export const esc_ = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const INK = 'color:#011111;font-size:16px;line-height:1.6';

/** The note's frame: white card, the owner's signature at the end. Shared with the after-answer emails. */
export function letter({ first = '', body = [], button = '', picture = '', after = [], from = {} }) {
  const hi = first ? 'Dear ' + esc_(first) + ',' : 'Hello,';
  const sig = [esc_(from.name || ''), from.title ? esc_(from.title) : '', 'Novikontas Academy'].filter(Boolean).join('<br>');
  const tr = (pad, css, inner) => '<tr><td style="background:#fff;padding:' + pad + ';' + css + '">' + inner + '</td></tr>';
  return '<div style="background:#e7ebf0;padding:24px 0"><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;margin:0 auto;font-family:Raleway,Arial,sans-serif">'
    + (picture ? '<tr><td style="background:#fff;border-radius:6px 6px 0 0;line-height:0">' + picture + '</td></tr>' : '')
    + tr('30px 36px 0', INK + (picture ? '' : ';border-radius:6px 6px 0 0'), hi + '<br><br>' + body.join('<br><br>'))
    + (button ? tr('22px 36px 0', '', button) : '')
    + after.map((a) => tr('18px 36px 0', INK, a)).join('')
    + tr('24px 36px 0', INK, sig)
    + tr('20px 36px 30px', 'border-radius:0 0 6px 6px;color:#415c8f;font-size:14px;line-height:1.6', 'You can reply to this email, it comes to me, or write to <a href="mailto:events@novikontas.org" style="color:#0a2463">events@novikontas.org</a>.')
    + '</table></div>';
}
export const plainSig = (from = {}) => [from.name || '', from.title || '', 'Novikontas Academy'].filter(Boolean).join('\n');

export function s2Mail(kind, first, code, opts = {}) {
  const from = opts.from || {};
  const link = S2_PAGE + '?c=' + code;
  const hiPlain = first ? 'Dear ' + first + ',' : 'Hello,';
  const btn = '<a href="' + link + '&rsvp=yes" style="display:inline-block;background:#0a2463;color:#ffffff;font-weight:bold;font-size:16px;text-decoration:none;padding:15px 28px;border-radius:3px">Yes, I\'ll attend &rarr;</a>';
  const cal = 'Haven\'t added it to your calendar yet? <a href="' + link + '#go-calendars" style="color:#0a2463">Add it here</a>.';
  const calPlain = 'Haven\'t added it to your calendar yet? Add it here: ' + link + '#go-calendars';
  const opens = 'On <b>27 May 2027</b> we open the new <b>Novikontas Academy Campus</b> in Riga';
  const opensPlain = 'On 27 May 2027 we open the new Novikontas Academy Campus in Riga';
  let subject, lines;
  if (opts.remind) {
    subject = 'A quick reminder: Novikontas Academy Grand Opening, 27 May 2027';
    lines = ['A quick reminder from me. ' + opens + ', and I would still be glad to welcome you there.', 'Will you be there? It takes one minute to confirm.'];
  } else if (kind === 'confirm') {
    subject = '27 May 2027: will you join me at the Novikontas Academy Grand Opening?';
    lines = ['You saved the date for our Grand Opening. ' + opens + ', and I would be glad to welcome you there myself.', 'Will you join us? It takes one minute to confirm.'];
  } else if (kind === 'invite') {
    subject = 'You are invited: Novikontas Academy Grand Opening, 27 May 2027';
    lines = ['I wanted to write to you personally, as our first invitation may not have reached you. ' + opens + ', and it would mean a lot to me to welcome you there.', 'Will you join us? It takes one minute to confirm.'];
  } else {
    subject = 'You are invited: Novikontas Academy Grand Opening, 27 May 2027';
    lines = ['I wanted to write to you personally. ' + opens + ', and it would mean a lot to me to welcome you there.', 'Will you join us? It takes one minute to confirm.'];
  }
  const picture = kind === 'confirm'
    ? '<img src="cid:building" width="600" alt="Novikontas Academy Campus, 27.05.2005 to 27.05.2027" style="display:block;width:100%;max-width:600px;border:0;border-radius:6px 6px 0 0">'
    : '<a href="' + link + '&rsvp=yes"><img src="' + S2_INVITE_IMG + '" width="600" alt="You are invited, 27.05.2005 to 27.05.2027" style="display:block;width:100%;max-width:600px;border:0;border-radius:6px 6px 0 0"></a>';
  const html = letter({ first, body: lines, button: btn, picture, after: [cal], from });
  const plain = hiPlain + '\n\n' + lines.map((l) => l.replace(/<[^>]+>/g, '')).join('\n\n').replace(opens.replace(/<[^>]+>/g, ''), opensPlain)
    + '\n\nYes, I\'ll attend: ' + link + '&rsvp=yes\n\n' + calPlain + '\n\n' + plainSig(from)
    + '\n\nYou can reply to this email, it comes to me, or write to events@novikontas.org.';
  return { subject, html, plain, inline: kind === 'confirm' ? 'building' : null };
}
