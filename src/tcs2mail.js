// STAGE 2 EMAILS (30.10.2026): the three emails of the Apps Script that sent Stage 2 until now (his picks 22.10 and 28.10),
// copied word for word from Grand Opening/Contacts/stage2_emails_appsscript_2026-10-22.js so Intake sends exactly the same.
// 'confirm' = saw the Save the Date (date-led dark card + the building picture), 'invite' = it may not have reached them,
// 'new' = never sent the Save the Date. No signature (his words).
const S2_PAGE = 'https://novikontas.org/grand-opening';
const S2_INVITE_IMG = 'https://mcusercontent.com/742b7cc5cefdc84b1134d8ca1/images/aa5828e0-30d8-8a91-b894-9f4501f6b9ca.jpg';
const esc_ = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function s2Mail(kind, first, code) {
  const link = S2_PAGE + '?c=' + code;
  const hi = first ? 'Dear ' + esc_(first) + ',' : 'Hello,';
  const hiPlain = first ? 'Dear ' + first + ',' : 'Hello,';
  const contact = 'You can reply to my email or write to <a href="mailto:events@novikontas.org" style="color:#0a2463">events@novikontas.org</a>.';
  const contactPlain = 'You can reply to my email or write to events@novikontas.org.';
  const cal = 'Haven\'t added it to your calendar yet? <a href="' + link + '#go-calendars" style="color:#0a2463">Add it here</a>.';
  const btn = function (label, bg, fg) { return '<a href="' + link + '&rsvp=yes" style="display:inline-block;background:' + bg + ';color:' + fg + ';font-weight:bold;font-size:16px;text-decoration:none;padding:15px 28px;border-radius:3px">' + label + ' &rarr;</a>'; };
  const wrap = function (inner) { return '<div style="background:#e7ebf0;padding:24px 0"><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;margin:0 auto;font-family:Raleway,Arial,sans-serif">' + inner + '</table></div>'; };
  // 'new' (28.10) = people who never got the Save the Date: the invite without the 'may not have reached you' line.
  if (kind === 'invite' || kind === 'new') {
    const p = (kind === 'new' ? '' : 'It looks like our first invitation may not have reached you, so here it is again.<br><br>') + 'We would be delighted to welcome you at the <b>Novikontas Academy Grand Opening</b> on <b>27 May 2027</b> in Riga.';
    return { subject: 'You are invited: Novikontas Academy Grand Opening, 27 May 2027',
      html: wrap('<tr><td style="background:#fff;border-radius:6px 6px 0 0;overflow:hidden"><a href="' + link + '&rsvp=yes"><img src="' + S2_INVITE_IMG + '" width="600" alt="You are invited - 27 May 2027" style="display:block;width:100%;max-width:600px;border:0"></a></td></tr>'
        + '<tr><td style="background:#fff;padding:30px 36px 6px;color:#011111;font-size:16px;line-height:1.6">' + hi + '<br><br>' + p + '</td></tr>'
        + '<tr><td style="background:#fff;padding:18px 36px 8px">' + btn('Yes, I\'ll attend', '#0a2463', '#ffffff') + '</td></tr>'
        + '<tr><td style="background:#fff;border-radius:0 0 6px 6px;padding:14px 36px 30px;color:#415c8f;font-size:14px;line-height:1.6">' + cal + '<br>' + contact + '</td></tr>'),
      plain: hiPlain + '\n\nWe would be delighted to welcome you at the Novikontas Academy Grand Opening on 27 May 2027 in Riga.\n\nYes, I\'ll attend: ' + link + '&rsvp=yes\n\nHaven\'t added it to your calendar yet? Add it here: ' + link + '#go-calendars\n\n' + contactPlain,
      inline: null };
  }
  // 'confirm' = his pick B 22.10: the date leads, dark card like the landing page.
  const p2 = 'to prepare the day well, we are now putting together the guest list. It takes one minute.';
  const td = function (pad, css, inner) { return '<tr><td style="background:#0a182e;padding:' + pad + ';' + css + '">' + inner + '</td></tr>'; };
  const lk = 'color:#53a7db';
  return { subject: 'Novikontas Academy Grand Opening, 27 May 2027 - will you be there?',
    html: wrap(td('44px 48px 0', 'border-radius:6px 6px 0 0;color:#53a7db;font-weight:800;font-size:11px;letter-spacing:.16em', 'NOVIKONTAS ACADEMY GRAND OPENING')
      + td('20px 48px 0', 'color:#ffffff;font-weight:800;font-size:56px;line-height:1;letter-spacing:-.03em', '27 May 2027')
      + td('10px 48px 0', 'color:#8fa9cf;font-size:14px', 'Novikontas Academy Campus, Riga')
      + td('22px 48px 0', 'color:#53a7db;font-weight:bold;font-size:22px;line-height:1.3', 'You saved the date. Will you be there?')
      + td('28px 48px 0', '', '<div style="height:1px;line-height:1px;font-size:0;background:#22385a">&nbsp;</div>')
      + td('24px 48px 0', 'color:#c9d4e3;font-size:15px;line-height:1.65', (first ? 'Dear ' + esc_(first) + ',' : 'Hello,') + '<br>' + p2)
      + td('32px 48px 44px', '', btn('Yes, I\'ll attend', '#53a7db', '#ffffff'))
      + '<tr><td style="background:#0a182e;line-height:0"><img src="cid:building" width="600" alt="Novikontas Academy Campus, 2005 to 2027" style="display:block;width:100%;max-width:600px;border:0"></td></tr>'
      + td('28px 48px 36px', 'border-radius:0 0 6px 6px;color:#8fa9cf;font-size:13px;line-height:1.7', cal.replace('color:#0a2463', lk) + '<br>' + contact.replace('color:#0a2463', lk))),
    plain: '27 May 2027 - Novikontas Academy Grand Opening, Novikontas Academy Campus, Riga\n\nYou saved the date. Will you be there?\n\n' + hiPlain + '\n' + p2 + '\n\nYes, I\'ll attend: ' + link + '&rsvp=yes\n\nHaven\'t added it to your calendar yet? Add it here: ' + link + '#go-calendars\n\n' + contactPlain,
    inline: 'building' };
}
