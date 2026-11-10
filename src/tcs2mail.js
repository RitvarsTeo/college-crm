// STAGE 2 EMAILS, PERSONAL FROM THE LIST'S OWNER (06.11.2026). The owner's decision: "all stage 2 emails will be like from a
// personal manager." Every Stage 2 email and every after-answer email (src/tcgomail.js) is a short note in the owner's own
// voice ("I"), signed with their name and Novikontas Academy (his pick "Name only", 06.11.2026), from their own address so the reply goes
// to them. Since 10.11.2026 the Stage 2 letters wear the landing page design (s2Mail below).
//   'confirm' = saw the Save the Date   'invite' = it may not have reached them   'new' = never sent the Save the Date
//   opts.remind = Reminder 1 (no answer yet)   opts.from = { name, title } the list's owner
const S2_PAGE = 'https://novikontas.org/grand-opening';
export const esc_ = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const INK = 'color:#011111;font-size:16px;line-height:1.6';

/** The note's frame: white card, the owner's signature at the end. Shared with the after-answer emails. */
export function letter({ first = '', body = [], button = '', picture = '', after = [], from = {} }) {
  const hi = first ? 'Dear ' + esc_(first) + ',' : 'Hello,';
  const sig = [esc_(from.name || ''), 'Novikontas Academy'].filter(Boolean).join('<br>');
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
export const plainSig = (from = {}) => [from.name || '', 'Novikontas Academy'].filter(Boolean).join('\n');

// THE LANDING PAGE DESIGN (10.11.2026, his pick "L1: card on top": "these have to be updated to the design language of the
// landing page!"): the landing page's card on top (its campus photo, the blue "You are invited" band, "to the Grand Opening of
// Novikontas Academy", the grey date block with the address, the black "Yes, I'll attend"), then the owner's note and signature.
// No calendar line: the landing page offers the calendar after Yes. Email-safe: tables, inline styles, bgcolor, real text (the
// card reads with images off), one hosted photo (1376 px source for the 600 px slot).
const LP_PHOTO = 'https://mcusercontent.com/742b7cc5cefdc84b1134d8ca1/images/5791191e-9348-b914-d4e1-8f7027aa609e.jpg';
const FONT = 'font-family:Raleway,Arial,Helvetica,sans-serif';
function card(link) {
  const yes = link + '&rsvp=yes';
  return '<tr><td bgcolor="#ffffff" style="background:#ffffff;line-height:0;border-radius:6px 6px 0 0;overflow:hidden"><a href="' + yes + '"><img src="' + LP_PHOTO + '" width="600" alt="Novikontas Academy Campus, Riga" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr>'
    + '<tr><td bgcolor="#53a7db" style="background:#53a7db;padding:16px 36px;color:#011111;font-weight:800;font-size:30px;line-height:1.2;letter-spacing:-.01em;' + FONT + '">You are invited</td></tr>'
    + '<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:18px 36px 0;' + FONT + '"><div style="color:#415c8f;font-weight:600;font-size:16px;line-height:1.4">to the</div>'
    + '<div style="color:#011111;font-weight:800;font-size:40px;line-height:1.05;letter-spacing:-.02em">Grand Opening</div>'
    + '<div style="color:#011111;font-weight:500;font-size:21px;line-height:1.4;margin-top:2px">of Novikontas Academy</div></td></tr>'
    + '<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:20px 36px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td bgcolor="#e7ebf0" style="background:#e7ebf0;border-left:4px solid #53a7db;padding:14px 20px;' + FONT + '"><div style="color:#011111;font-weight:800;font-size:26px;line-height:1.2">27 May 2027</div>'
    + '<div style="color:#011111;font-size:15px;line-height:1.5;margin-top:6px"><span style="color:#53a7db">&#9679;</span>&nbsp; Novikontas Academy Campus, Duntes iela 17d, Riga</div></td></tr></table></td></tr>'
    + '<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:20px 36px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#011111" align="center" style="background:#011111">'
    + '<a href="' + yes + '" style="display:block;padding:16px 0;color:#ffffff;font-weight:700;font-size:17px;text-decoration:none;' + FONT + '">Yes, I&#39;ll attend</a></td></tr></table></td></tr>';
}

export function s2Mail(kind, first, code, opts = {}) {
  const from = opts.from || {};
  const link = S2_PAGE + '?c=' + code;
  const hi = first ? 'Dear ' + esc_(first) + ',' : 'Hello,';
  const hiPlain = first ? 'Dear ' + first + ',' : 'Hello,';
  const ask = 'Will you join us? It takes one minute to confirm.';
  let subject, lines;
  if (opts.remind) {
    subject = 'A quick reminder: Novikontas Academy Grand Opening, 27 May 2027';
    lines = ['A quick reminder from me. On 27 May 2027 we open the new Novikontas Academy Campus in Riga, and I would still be glad to welcome you there.', 'Will you be there? It takes one minute to confirm.'];
  } else if (kind === 'confirm') {
    subject = '27 May 2027: will you join me at the Novikontas Academy Grand Opening?';
    // his rule "never the same idea twice": the card says Grand Opening, 27 May 2027 and the campus, so the note does not
    lines = ['You saved the date for our Grand Opening, and I would be glad to welcome you there myself.', ask];
  } else if (kind === 'invite') {
    subject = 'You are invited: Novikontas Academy Grand Opening, 27 May 2027';
    // his words 06.11.2026: "i wanted to write to you personally is not ok": the facts in the owner's voice, no announcement
    lines = ['Our first invitation may not have reached you, so here it is again. It would mean a lot to me to welcome you there.', ask];
  } else {
    subject = 'You are invited: Novikontas Academy Grand Opening, 27 May 2027';
    lines = ['It would mean a lot to me to welcome you there.', ask];
  }
  const ink = 'color:#011111;font-size:16px;line-height:1.6;' + FONT;
  const html = '<div style="background:#e7ebf0;padding:24px 0"><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;margin:0 auto;' + FONT + '">'
    + card(link)
    + '<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:26px 36px 0;' + ink + '">' + hi + '<br><br>' + lines.map(esc_).join('<br><br>') + '</td></tr>'
    + '<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:22px 36px 0;' + ink + '">' + [esc_(from.name || ''), 'Novikontas Academy'].filter(Boolean).join('<br>') + '</td></tr>'
    + '<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:18px 36px 30px;border-radius:0 0 6px 6px;color:#415c8f;font-size:14px;line-height:1.6;' + FONT + '">You can reply to this email, it comes to me, or write to <a href="mailto:events@novikontas.org" style="color:#0a2463">events@novikontas.org</a>.</td></tr>'
    + '</table></div>';
  const plain = 'You are invited to the Grand Opening of Novikontas Academy\n27 May 2027, Novikontas Academy Campus, Duntes iela 17d, Riga\n\n'
    + hiPlain + '\n\n' + lines.join('\n\n') + '\n\nYes, I\'ll attend: ' + link + '&rsvp=yes\n\n' + plainSig(from)
    + '\n\nYou can reply to this email, it comes to me, or write to events@novikontas.org.';
  return { subject, html, plain, inline: null };
}
