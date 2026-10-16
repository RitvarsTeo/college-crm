// An email card shows what the person newly wrote (the owner, 16.10.2026, with a screenshot: "why emails show up this
// messy???"). The card showed the whole thread: the person's two lines, our own quoted message, our signature with every
// link spelled out twice, image placeholders and a legal notice in Latvian. src/emailtext.js cleans for display only;
// the stored body stays as it came, for "Show original".

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { cleanEmailBody, emailShown, emailBodyFor } from '../src/emailtext.js';
import { openDb } from '../src/db.js';
import { receive, listInbound, messagesFor, landOnProfile } from '../src/intake.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = fs.readFileSync(path.join(ROOT, 'src', 'app.html'), 'utf8');

// The real example, anonymised: a registry's reply to edu@ (Outlook), our message quoted under it.
const REGISTRY_REPLY = [
  'Re: Diploma verification request',
  'Labdien!',
  'Apstiprinām, ka diploms Nr. 000000 ir reģistrēts. Izziņa pielikumā.',
  '',
  '[cid:image001.png@01DD3F2A.5B6C7D80]',
  '',
  'From: Novikontas Academy <edu@example.org>',
  'Sent: Friday, October 16, 2026 9:24 AM',
  'To: Registry Office <info@registry.example.lv>',
  'Subject: Diploma verification request',
  '',
  'Labdien!',
  '',
  'Lūdzam apstiprināt pielikumā esošā diploma autentiskumu.',
  '',
  'Sincerely,',
  '',
  'Laura Example',
  'Customer Relations Department',
  'www.novikontas.org<http://www.novikontas.org/>',
  '[https://ci3.googleusercontent.com/mail-sig/AIorK4zAbCdEfGhIjKlMnOpQrStUvWxYz0123456789]',
  'T: +371 60000000',
  'M: +371 20000000',
  'E: edu@example.org<mailto:edu@example.org>',
  'A: Example street 1, Riga, Latvia',
  '[Facebook Icon Small Square] <https://www.facebook.com/novikontas> [LinkedIn Icon Small Square] <https://lv.linkedin.com/company/novikontas-maritime-college> [Instagram Icon Small Square] <https://www.instagram.com/novikontascollege/?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw%3D%3D#>',
  '[cid:image002.png@01DD3F2A.5B6C7D80]',
  '* Your personal data or data we exchange is processed in accordance with Novikontas Data Protection Policy',
  '** Novikontas cancellation policy<https://novikontas.org/course-cancel>',
  '',
  'Šis e-pasts un tā pielikumā esošie dokumenti var saturēt ierobežotas pieejamības informāciju, kas paredzēta tikai adresātam. Ja Jūs neesat šī e-pasta adresāts, lūdzam par to informēt sūtītāju un izdzēst šo e-pastu.',
].join('\n');

test('the registry reply: only the two lines the person wrote, under the subject', () => {
  assert.equal(cleanEmailBody(REGISTRY_REPLY, { subjectFirstLine: true }),
    'Re: Diploma verification request\nLabdien!\nApstiprinām, ka diploms Nr. 000000 ir reģistrēts. Izziņa pielikumā.');
});

test('a notice right under the person\'s text goes, as a whole paragraph, and their signature contact lines go', () => {
  const body = [
    'Hello,', '', 'Could you send me the price list for the STCW basic training?', '',
    'Best regards,', 'John Example', 'Logistics Manager', 'Tel: +44 20 0000 0000', 'www.example.com <https://www.example.com>', '',
    'CONFIDENTIALITY NOTICE: This e-mail and any attachments are confidential and intended solely for the addressee. If you have received this e-mail in error, please notify the sender.',
    '', 'Sent from my iPhone',
  ].join('\n');
  assert.equal(cleanEmailBody(body), 'Hello,\n\nCould you send me the price list for the STCW basic training?\n\nBest regards,\nJohn Example');
});

test('English Outlook: the "From: / Sent: / To: / Subject:" block and the line above it end the message', () => {
  const body = [
    'RE: Course dates', 'Thank you, we will come on the 21st.', '',
    '________________________________', 'From: Novikontas Academy <edu@example.org>', 'Sent: Thursday, October 15, 2026 3:10 PM',
    'To: Person <person@example.com>', 'Subject: Course dates', '', 'Dear Person, the next course starts on 21 October.',
  ].join('\n');
  assert.equal(cleanEmailBody(body, { subjectFirstLine: true }), 'RE: Course dates\nThank you, we will come on the 21st.');
  // flattened onto one line, as some clients send it
  assert.equal(cleanEmailBody('Yes, thank you.\nFrom: Novikontas Academy <edu@example.org> Sent: Friday, October 16, 2026 9:24 AM To: X <x@example.com> Subject: Y\nold text'),
    'Yes, thank you.');
  // the Latvian Outlook block too
  assert.equal(cleanEmailBody('Paldies!\n\nNo: Novikontas Academy <edu@example.org>\nNosūtīts: piektdiena, 2026. gada 16. oktobris 09:24\nKam: x@example.lv\nTēma: Kursi\n\nVecais teksts'),
    'Paldies!');
  // "-----Original Message-----"
  assert.equal(cleanEmailBody('Agreed.\n\n-----Original Message-----\nFrom: A\nSent: B\n\nold'), 'Agreed.');
});

test('Gmail "On ... wrote:", wrapped over two lines, and the ">" lines under it', () => {
  const body = [
    'Jā der, varu ierasties. Vai kaut ko ņemt līdzi?', '',
    'On Fri, 2 Oct 2026, 15:45 Novikontas Academy, <edu@example.org>', 'wrote:', '',
    '> Mēs esam gatavi jūs uzņemt trešdien.', '>', '> Ar cieņu,', '> Laura',
  ].join('\n');
  assert.equal(cleanEmailBody(body), 'Jā der, varu ierasties. Vai kaut ko ņemt līdzi?');
  assert.equal(cleanEmailBody('Thanks!\n\nOn Thu, 7 May 2026 at 14:09, Novikontas Education <\nedu@example.org> wrote:\n\n> Hi'), 'Thanks!');
  // a stray ">" line in the person's own text is quoted history too
  assert.equal(cleanEmailBody('See below.\n> old line\nThanks'), 'See below.\nThanks');
});

test('Latvian Gmail "rakstīja:" and Russian "пишет:" / "написал(а):"', () => {
  assert.equal(cleanEmailBody('Labdien, paldies par atbildi!\n\npk, 2026. gada 16. okt., plkst. 09:24 — Novikontas Academy (<edu@example.org>)\nrakstīja:\n\n> Labdien!'),
    'Labdien, paldies par atbildi!');
  assert.equal(cleanEmailBody('Labdien!\n\n2026. gada 16. oktobrī 09:24 Novikontas Academy <edu@example.org> rakstīja:\n> teksts'), 'Labdien!');
  assert.equal(cleanEmailBody('Здравствуйте, спасибо!\n\nПятница, 16 октября 2026, 9:24 +03:00 от Novikontas Academy <edu@example.org>:\n> текст'),
    'Здравствуйте, спасибо!');
  assert.equal(cleanEmailBody('Спасибо, понятно.\n\n16 октября 2026 г., в 09:24, Novikontas Academy <edu@example.org> пишет:\n> текст'), 'Спасибо, понятно.');
  assert.equal(cleanEmailBody('Хорошо.\n\nпт, 16 окт. 2026 г. в 09:24, Laura написал(а):\n> текст'), 'Хорошо.');
});

test('a short plain message comes back unchanged', () => {
  const m = 'Labdien!\n\nVai vēl var pieteikties navigācijas programmā šoruden?\nMans tālrunis 26123456.\n\nAr cieņu,\nMārtiņš';
  assert.equal(cleanEmailBody(m), m);
  assert.equal(cleanEmailBody('Hi, what does the course cost?'), 'Hi, what does the course cost?');
  // a sentence that ends "wrote:" without a date or an address is the person's own
  assert.equal(cleanEmailBody('This is what my captain wrote:\nmy sea time is enough'), 'This is what my captain wrote:\nmy sea time is enough');
});

test('a message that is ONLY a forward shows what was forwarded, without its header block', () => {
  const body = [
    'Fwd: Question about the course', '',
    '---------- Forwarded message ---------', 'From: Person Example <person@example.com>', 'Date: Thu, 15 Oct 2026 at 18:02',
    'Subject: Question about the course', 'To: <office@example.org>', '',
    'Hello, is there a place left in the November group?', '', 'Sent from my iPhone',
  ].join('\n');
  assert.equal(cleanEmailBody(body, { subjectFirstLine: true }), 'Fwd: Question about the course\nHello, is there a place left in the November group?');
  // an Outlook FW: with nothing written above it
  assert.equal(cleanEmailBody('FW: Price\n\nFrom: Person <p@example.com>\nSent: Thursday\nTo: office@example.org\nSubject: Price\n\nWhat is the price?', { subjectFirstLine: true }),
    'FW: Price\nWhat is the price?');
  // a forward with a note: the note is what the sender newly wrote
  assert.equal(cleanEmailBody('Please see below.\n\n---------- Forwarded message ---------\nFrom: X <x@example.com>\nDate: Y\n\nold'), 'Please see below.');
});

test('a reply with nothing new never shows our quoted message as theirs: the original\'s first lines instead', () => {
  const body = 'Re: Documents\n\nOn Fri, 16 Oct 2026 at 09:24, Novikontas Academy <edu@example.org> wrote:\n> Please send the documents.';
  assert.equal(cleanEmailBody(body, { subjectFirstLine: true }), 'Re: Documents');
  assert.equal(emailShown(body, { subjectFirstLine: true }),
    'Re: Documents\nOn Fri, 16 Oct 2026 at 09:24, Novikontas Academy <edu@example.org> wrote:\n> Please send the documents.');
  assert.equal(emailShown(''), '');
});

test('litter inside the text: cid placeholders, mailto and link duplicates, icon labels, signature images, tracking', () => {
  assert.equal(cleanEmailBody('Write to info@example.com<mailto:info@example.com> please.'), 'Write to info@example.com please.');
  assert.equal(cleanEmailBody('Write to info@example.com <info@example.com> please.'), 'Write to info@example.com please.');
  assert.equal(cleanEmailBody('Our page www.example.com<http://www.example.com/> has it.'), 'Our page www.example.com has it.');
  assert.equal(cleanEmailBody('Here: <https://example.com/form?utm_source=x&id=7&fbclid=abc>'), 'Here: https://example.com/form?id=7');
  assert.equal(cleanEmailBody('Look [cid:image003.jpg@01DD0000.00000000] here [image: logo.png]'), 'Look here');
  assert.equal(cleanEmailBody('Hi\n[https://ci3.googleusercontent.com/mail-sig/AIorK4abc]'), 'Hi');
});

test('our own signature goes whole, also without a sign-off line; somebody\'s P.S. after a plain name stays', () => {
  assert.equal(cleanEmailBody('Labdien!\nKursi sākas 21. oktobrī.\n\nLaura Example\nCustomer Relations Department\nT: +371 60000000'),
    'Labdien!\nKursi sākas 21. oktobrī.');
  assert.equal(cleanEmailBody('Paldies,\nJānis\n\nP.S. Vai var maksāt pa daļām?'), 'Paldies,\nJānis\n\nP.S. Vai var maksāt pa daļām?');
});

test('a joined card cleans each email on its own, so the second one is not lost under the first one\'s quote', () => {
  const one = 'Re: Dates\nWe will come.\n\nOn Fri, 16 Oct 2026 at 09:24, Novikontas Academy <edu@example.org> wrote:\n> old';
  const two = 'Re: Dates\nAlso: is lunch included?\n\nOn Fri, 16 Oct 2026 at 10:00, Novikontas Academy <edu@example.org> wrote:\n> old';
  assert.equal(emailBodyFor('gmail', one + '\n' + two, [one, two]), 'Re: Dates\nWe will come.\n\nRe: Dates\nAlso: is lunch included?');
  assert.equal(emailBodyFor('phone', 'Missed call'), null);
  assert.equal(emailBodyFor('website_form', 'Name: X'), null);
});

test('the Inbox row and the person\'s History carry the cleaned text; the stored body is untouched', async () => {
  const db = await openDb(':memory:');
  const r = await receive(db, { channel: 'gmail', externalId: 'm1', email: 'office@registry.example.lv', name: 'Registry Office',
    body: REGISTRY_REPLY, source: 'provider' });
  const [row] = (await listInbound(db, { state: 'new' })).filter((x) => x.id === r.id);
  assert.equal(row.body, REGISTRY_REPLY);
  assert.equal(row.bodyClean, 'Re: Diploma verification request\nLabdien!\nApstiprinām, ka diploms Nr. 000000 ir reģistrēts. Izziņa pielikumā.');
  const stored = await db.prepare('SELECT body FROM inbound WHERE id = ?').get(r.id);
  assert.equal(stored.body, REGISTRY_REPLY);
  // the same text on the person's History
  await db.prepare("INSERT INTO people (id, name, status, created_at) VALUES ('P1', 'Registry Office', 'new', '2026-10-16T09:00:00.000Z')").run();
  assert.equal(await landOnProfile(db, r.id, 'P1'), 'P1');
  const [m] = await messagesFor(db, 'P1');
  assert.equal(m.body, REGISTRY_REPLY);
  assert.equal(m.bodyClean, row.bodyClean);
  // a phone card has no cleaned text
  const c = await receive(db, { channel: 'phone', externalId: 'c1', phone: '+37120000000', body: 'Missed call', source: 'provider' });
  const phone = (await listInbound(db, { state: 'new' })).find((x) => x.id === c.id);
  assert.equal(phone.bodyClean, undefined);
});

test('the card shows the cleaned text, Show more and Show original, everything escaped', () => {
  const card = APP.slice(APP.indexOf('const card = (r) => {'), APP.indexOf('// a band click narrows the board'));
  assert.match(card, /r\.bodyClean \? msgHtml\(r\) : /);
  const fn = APP.slice(APP.indexOf('  const msgHtml = (r) => {'), APP.indexOf('  const card = (r) => {'));
  const escLine = APP.split('\n').find((l) => l.startsWith('const esc = '));
  const ctx = {};
  vm.runInNewContext(escLine + '\n' + fn + '\nthis.cMsgHtml = msgHtml;', ctx);
  // an email with a thread: the clean text, the original hidden, both buttons
  const r = { body: REGISTRY_REPLY, bodyClean: 'Re: Diploma <b>\nLabdien!' };
  const html = ctx.cMsgHtml(r, '');
  assert.match(html, /<div class="ib-msg ib-msg-clean">Re: Diploma &lt;b&gt;\nLabdien!<\/div>/);
  assert.match(html, /<div class="ib-msg ib-msg-raw" hidden>Re: Diploma verification request\n/);
  assert.ok(!html.includes('<cid') && html.includes('&lt;edu@example.org&gt;'), 'the original is escaped');
  assert.match(html, />Show original</);
  assert.ok(!/Show more/.test(html), 'two short lines need no Show more');
  assert.match(html, /event\.stopPropagation\(\);cMsgToggle\(this,'orig'\)/);
  // a long cleaned text gets Show more
  assert.match(ctx.cMsgHtml({ body: 'x\ny\nz\nw', bodyClean: 'x\ny\nz\nw' }, ''), />Show more</);
  // nothing to clean: no Show original
  assert.ok(!/Show original/.test(ctx.cMsgHtml({ body: 'Hi there', bodyClean: 'Hi there' }, '')));
  // the buttons toggle the card's own classes and never open or close it
  const toggle = APP.slice(APP.indexOf('function cMsgToggle('), APP.indexOf('function cInboxPool('));
  assert.match(toggle, /classList\.toggle\('msg-full'\)/);
  assert.match(toggle, /raw\.hidden = !on; clean\.hidden = on/);
  // the History (both screens) and the Make a lead form read bodyClean first
  assert.ok(APP.includes('<div class="c-evt-body">${esc(e.bodyClean || e.body)}</div>${e.bodyClean && e.bodyClean !== e.body ? `<details class="c-evt-orig"><summary>Show original</summary><div class="c-evt-body">${esc(e.body)}</div></details>`'));
  assert.ok(APP.includes('<div class="said">${esc(e.bodyClean || e.body)}</div>'));
  assert.ok(APP.includes('<div class="msg">${esc(item.bodyClean || item.body)}</div>'));
});
