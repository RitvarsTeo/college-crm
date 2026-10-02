import fs from 'node:fs';

// ---- server.js: the strings a person actually receives --------------------
let s = fs.readFileSync('src/server.js', 'utf8');
const serverPairs = [
  // the downloaded files carry their title in the sheet and in the filename
  [`sheetName: 'Report', title: 'Academy CRM report'`, `sheetName: 'Report', title: 'Intake report'`],
  ["name: `Academy CRM report ${periodRow ? periodRow[1] : ''} (made ${localDate()})`",
   "name: `Intake report ${periodRow ? periodRow[1] : ''} (made ${localDate()})`"],
  [`sheetName: 'Funnel', title: 'Academy CRM funnel'`, `sheetName: 'Funnel', title: 'Intake funnel'`],
  [`error: 'This person may already be in the CRM.'`, `error: 'This person may already be in Intake.'`],
  // the timeline line that says who did it. Written from here on as Intake; the rows
  // already in the database still say CRM and are mapped at display, never rewritten.
  [`origin: AUTOMATIC, actor: 'CRM',`, `origin: AUTOMATIC, actor: 'Intake',`],
  // our own outcome going back out to an ad platform is OUR outcome
  ['Sending a CRM admission back as a conversion', 'Sending an Intake admission back as a conversion'],
  ['A CRM outcome reaches Meta only through', 'An Intake outcome reaches Meta only through'],
  ['A CRM outcome reaches Mailchimp as a tag', 'An Intake outcome reaches Mailchimp as a tag'],
  ['console.log(`Academy CRM prototype on http://localhost:', 'console.log(`Intake on http://localhost:'],
];
let n = 0; const missed = [];
for (const [a, b] of serverPairs) {
  if (!s.includes(a)) { missed.push('server.js :: ' + a.slice(0, 60)); continue; }
  s = s.split(a).join(b); n++;
}
fs.writeFileSync('src/server.js', s);

// ---- app.html: show one name, whatever the row says ------------------------
let a = fs.readFileSync('src/app.html', 'utf8');
const anchor = 'function cStamp(';
if (!a.includes(anchor)) throw new Error('cStamp anchor missing');
a = a.replace(anchor,
`// WHO DID IT, under one name (02.10.2026). The product was renamed from CRM to
// Intake. Rows written before that say actor 'CRM' and are NOT rewritten: the history
// is what it is. The screen shows the current name, so a person reading a timeline
// does not meet two names for the same system.
const actorName = (x) => (x === 'CRM' ? 'Intake' : x);
${anchor}`);

let m = 0;
const before = a;
a = a.split("' · ' + esc(e.actor)").join("' · ' + esc(actorName(e.actor))");
a = a.split("' &middot; ' + esc(e.actor)").join("' &middot; ' + esc(actorName(e.actor))");
a = a.split("esc(r.actor || '-')").join("esc(actorName(r.actor) || '-')");
m = (before.length !== a.length) ? 1 : 0;
fs.writeFileSync('src/app.html', a);

console.log('server strings renamed:', n);
console.log('actor display mapped:', m ? 'yes' : 'NO - check');
if (missed.length) { console.log('NOT FOUND:'); for (const x of missed) console.log('  ' + x); }
