// DATA DELETION, A PUBLIC PAGE (27.11.2026, his pick "Yes, on Intake" for Meta App Review). Meta asks every app that
// receives people's data for a page that says how a person asks for it to be deleted. This is that page: STATIC text,
// English and Latvian, no data read, no form, nothing sent (test/security_guards.test.js lists it in OPEN_PAGES).
//
// Every fact here has a source:
//   - the controller, its registration number, address and the privacy contact: novikontas.org/privacy-policy
//     ("Our contacts", Rev. 12.09.2023), which also says a request is made in writing and is free of charge, and that
//     data the law requires us to keep is kept;
//   - "within one month": GDPR Article 12(3);
//   - message texts emptied 13 months after they arrive: src/sync.js RETENTION_MONTHS and src/intake.js purgeLineBodies;
//   - the complaint authority: the privacy policy (www.dvi.gov.lv).

export const DATA_DELETION_PATH = '/data-deletion';

export const DATA_DELETION_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Data deletion - Novikontas Intake</title>
<meta name="robots" content="index,follow">
<style>
  :root{--ink:#011111;--t2:#415c8f;--line:#dde3ea;--navy:#0a2463;--blue:#29a8df;--bg:#f5f7fa;--card:#fff}
  @media (prefers-color-scheme:dark){:root{--ink:#e8eef4;--t2:#a9bccf;--line:#26405f;--navy:#9cc7ea;--bg:#0b1a2e;--card:#10243d}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
  main{max-width:1080px;margin:0 auto;padding:32px 16px 48px}
  header{border-bottom:4px solid var(--blue);padding-bottom:12px;margin-bottom:24px}
  h1{font-size:28px;margin:0 0 4px;color:var(--navy)}
  header p{margin:0;color:var(--t2)}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:20px}
  @media (max-width:760px){.cols{grid-template-columns:1fr}}
  section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px}
  h2{font-size:19px;margin:0 0 12px;color:var(--navy)}
  h3{font-size:15px;margin:18px 0 4px}
  p,li{margin:0 0 8px}
  ul{padding-left:20px;margin:0 0 8px}
  a{color:var(--navy)}
  .mail{font-weight:700}
  footer{margin-top:24px;color:var(--t2);font-size:14px}
</style></head>
<body><main>
<header><h1>Data deletion</h1><p>Novikontas Intake · Datu dzēšana</p></header>
<div class="cols">
<section lang="en">
  <h2>How to ask us to delete your data</h2>
  <p>Novikontas Intake is the tool our admissions and Training Centre staff use to answer people who write or call us,
  including through Facebook Messenger, Instagram and WhatsApp.</p>
  <h3>1. Write to us</h3>
  <p>Email our Data Protection Specialist at <a class="mail" href="mailto:dataregulation@novikontas.org?subject=Delete%20my%20data">dataregulation@novikontas.org</a>
  with the subject "Delete my data". So that we can find you, please give your name and the account or number you wrote
  from (for example your Facebook or Instagram name, or your WhatsApp number). It is free of charge.</p>
  <h3>2. What we delete</h3>
  <ul>
    <li>the messages you sent us and our replies kept in Intake;</li>
    <li>your contact details kept with them: name, email address, phone number and social media account;</li>
    <li>the notes our staff wrote about your enquiry.</li>
  </ul>
  <p>We keep only what the law requires us to keep.</p>
  <h3>3. When</h3>
  <p>Within one month of your request, and we tell you when it is done.</p>
  <h3>Even if you do not ask</h3>
  <p>The text of every message is deleted from Intake automatically 13 months after it arrived.</p>
  <h3>Complaints</h3>
  <p>You may also complain to the Data State Inspectorate of Latvia, <a href="https://www.dvi.gov.lv">www.dvi.gov.lv</a>.</p>
</section>
<section lang="lv">
  <h2>Kā lūgt dzēst savus datus</h2>
  <p>Novikontas Intake ir rīks, ar kuru mūsu uzņemšanas un Mācību centra darbinieki atbild cilvēkiem, kuri mums raksta
  vai zvana, arī caur Facebook Messenger, Instagram un WhatsApp.</p>
  <h3>1. Uzrakstiet mums</h3>
  <p>Rakstiet mūsu datu aizsardzības speciālistei uz <a class="mail" href="mailto:dataregulation@novikontas.org?subject=Dz%C4%93st%20manus%20datus">dataregulation@novikontas.org</a>
  ar tēmu "Dzēst manus datus". Lai mēs jūs atrastu, norādiet savu vārdu un kontu vai numuru, no kura rakstījāt
  (piemēram, savu Facebook vai Instagram vārdu vai WhatsApp numuru). Tas ir bez maksas.</p>
  <h3>2. Ko mēs dzēšam</h3>
  <ul>
    <li>jūsu mums sūtītās ziņas un mūsu atbildes, kas glabājas Intake;</li>
    <li>kopā ar tām glabātos kontaktdatus: vārdu, e-pasta adresi, tālruņa numuru un sociālo tīklu kontu;</li>
    <li>piezīmes, ko mūsu darbinieki rakstījuši par jūsu jautājumu.</li>
  </ul>
  <p>Paturam tikai to, ko glabāt prasa likums.</p>
  <h3>3. Kad</h3>
  <p>Viena mēneša laikā pēc jūsu pieprasījuma, un mēs jums paziņojam, kad tas ir izdarīts.</p>
  <h3>Arī tad, ja nelūdzat</h3>
  <p>Katras ziņas teksts no Intake tiek automātiski dzēsts 13 mēnešus pēc tās saņemšanas.</p>
  <h3>Sūdzības</h3>
  <p>Varat arī vērsties Datu valsts inspekcijā, <a href="https://www.dvi.gov.lv">www.dvi.gov.lv</a>.</p>
</section>
</div>
<footer>SIA "Novikontas Jūras koledža", reg. Nr. 40003746413, Duntes iela 17a, Rīga, LV-1005, Latvia ·
<a href="https://novikontas.org/privacy-policy">Privacy and Cookies Policy</a></footer>
</main></body></html>`;
