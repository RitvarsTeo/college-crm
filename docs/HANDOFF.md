# HANDOFF: College CRM ("Intake"), the move to Aigars's Vercel + Supabase

Updated: 2026-10-07 (Europe/Riga)

Read this first, then `docs/BACKLOG.md` (Ritvars's running record) only as needed. The entry audit is
`Desktop\VibeCoding\CRM-AUDIT-2026-10-07.md` (outside the repo on purpose).

## Current state

Two copies exist. **Ritvars's copy** (crm-novikontas.vercel.app, his personal Vercel Hobby + Neon Free)
is still the one Admissions works in, holds the real 2026 applicants (about 190 people), and still pulls
Phone (TeleGroup) and the edu@ mailbox daily. **The college copy** (https://intake.novikontas.org, also
college-crm-ivory.vercel.app) is DEPLOYED and VERIFIED as a rehearsal: Aigars's Vercel team, a dedicated
Supabase project, every audit "must fix" item in, Google sign-in working, six accounts, but the database
is EMPTY and every channel is off. The switchover (Ritvars's data restored into Supabase, his project
deleted) is waiting on Ritvars handing over a backup, which Aigars asks for on 2026-10-08. Aigars has a
demo on the college copy today (2026-10-07), so it may still be empty during the demo unless the backup
arrives first.

Repo: `RitvarsTeo/college-crm` (private, stays on Ritvars's GitHub by Aigars's decision; NovikontasAcademy
is a collaborator). Work branch: **`fix/security-2026-10-07`** (head `d5d1d3d`), which is Ritvars's
`release/2026-10-05-intake-9` up to his 31st patch plus our fixes. Ritvars's release branch is untouched.
Deploys go through Aigars/Claude only (no Ritvars seat on the Vercel team, no git auto-deploy).

## What changed this session

Infrastructure (all on Aigars's accounts):
- Supabase project **College CRM**, ref `cjnkzhypvennbqfmjziq`, eu-central-1, Pro org "Novikontas Academy".
  Daily backups confirmed ON by Aigars. DB password only in the clone's gitignored `.env.local`
  (`SUPABASE_DB_PASSWORD`).
- Vercel project **college-crm**, team `novikontas-academy-s-projects`, Node 24.x, region fra1.
  Production env vars (names only): `DATABASE_URL`, `CRM_SESSION_SECRET`, `CRON_SECRET`, `CRM_PG_SCHEMA`
  (=crm), `CRM_AUTH` (=1), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
  (=https://intake.novikontas.org/api/auth/google/callback). No channel secrets yet.
- Domain intake.novikontas.org: CNAME `intake` -> `7ba8714f3ec43058.vercel-dns-016.com` at nano.lv,
  Let's Encrypt certificate issued.
- Google OAuth client created by Aigars in a college Google Cloud project (Internal consent screen,
  Gmail API enabled). Values were placed in `.env.local` and loaded into Vercel by script.
- Accounts (`crm.crm_users`, inserted by SQL, since `scripts/manage_users.mjs` is SQLite only):
  admin: aigars.kluga, ritvars.vilcins, poma, mc; user: ieva.gudaneca, laura.skirmante (all @novikontas.org).

Code on `fix/security-2026-10-07` (one commit per finding, tests in `test/security_2026_10_07.test.js`,
1389 tests pass with `node --test test/*.test.js`):
- C1: pull channels (gmail, phone, in_person, bearer_token) refuse outside POSTs (`src/inbound.js`
  `acceptsWebhook`, `src/server.js`).
- C2: a hosted copy (VERCEL set) refuses to start unless `CRM_AUTH=1` (CRM_PUBLIC demo excepted); laptop
  copy binds 127.0.0.1 unless `HOST` is set.
- H1: LinkedIn handshake answers a UUID challenge only.
- H3 + M3: production lock (hosted + sign-in): POSTs to /api/reset, /api/dataset, /api/demo/scenario,
  /api/console/*, /api/intake/demo, /api/intake/receive, /api/sim/*, /api/inbound/<ch>/simulate answer
  410; x-crm-simulated no longer skips signature checks.
- H2: `esc()` escapes `'`; all 45 inline handlers pass strings as `${esc(JSON.stringify(String(x ?? '')))}`;
  `channelLabel()` strips non-word characters from unknown values; Today card meta lines escaped. Nine of
  Ritvars's tests that pinned the old quote character were updated.
- M1: non-GET /api requests with sign-in on must be same-origin (Sec-Fetch-Site or Origin); webhooks,
  crons, sign-in exempt.
- H4 + M6 + M11: boot refuses unless `current_schema()` equals `CRM_PG_SCHEMA`; TLS verified (Supabase
  hosts use `config/supabase-root-2021-ca.crt`, fingerprint matched to the chain the pooler presents);
  web server refuses Postgres without `CRM_PG_SCHEMA`.
- First visit no longer shows "Your session has ended" under the login (year scope fetched
  /api/scope/years before sign-in). This bug is also on Ritvars's live copy.
- Merged Ritvars's release up to patch 31 (`f45340e`) into the branch (Aigars's go-ahead).

## Verified live

- Supabase catalog: 27 tables in schema `crm`, RLS on for all, 0 tables in `public`, 0 grants to
  anon/authenticated/PUBLIC, no USAGE on `crm` for anon/authenticated (queried directly).
- Against the real Supabase pooler: boot lands in `crm` with verified TLS; a client without the Supabase
  root is refused (SELF_SIGNED_CERT_IN_CHAIN); `CRM_PG_SCHEMA` missing is refused.
- intake.novikontas.org: `/` 200, `/api/people` 401 unauthenticated, `/api/auth/me` 200, POST
  /api/inbound/gmail, /phone and /api/reset 401 unauthenticated; HSTS, X-Frame-Options DENY, X-Robots-Tag
  noindex present.
- Google sign-in: Aigars signed in on his phone 2026-10-07 13:17 Riga (`crm_login_attempt`
  google:success_google). The start redirect carries the right client id, redirect URI and hd=novikontas.org.
- Fresh visit shows the login with no red message (checked in the browser pane after deploy `d5d1d3d`).
- NOT yet verified: the year filter loads after sign-in (Aigars to look); any screen with real data; any
  channel; the crons on this project (they run but have no tokens, so they do nothing).

## Open threads

1. **Switchover with Ritvars** (Aigars asks him 2026-10-08). Why: the college copy is empty; the real
   data is only on his personal account. Next steps, in this order:
   a. Ritvars freezes his copy, takes a final verified backup, and puts the backup plus a text file with
      the VALUES of all his Vercel env vars (SIS_API_TOKEN, SIS_APPLICATION_SECRET, PBX_API_TOKEN,
      WEBSITE_FORM_SECRET, MAILCHIMP_WEBHOOK_SECRET, META_*, LINKEDIN_*, PHONE_EVENT_SECRET, VAPID_*,
      and any others) in a Google Drive folder shared only with Aigars. Never via chat.
   b. Claude loads the secrets into Vercel with the Node stdin script pattern (sensitive), restores the
      backup into schema `crm`, and compares row counts table by table with his backup. Backup format is
      unknown until it arrives (his tooling is on his laptop, `Projects\Backups`).
   c. After restore: FORCE every channel off in table `channel_mode` until his project is deleted (the
      switches travel with the data, and both copies would pull PBX and edu@ Gmail). Re-add any of the six
      accounts above that his `crm_users` lacks. Clear `push_subscriptions`.
   d. Ritvars deletes his Vercel project and the Neon database.
   e. Claude immediately adds `crm-novikontas.vercel.app` as a domain on the college project, so every
      provider webhook (Tilda, Meta, Mailchimp, SIS fast path, TeleGroup push) keeps working unchanged
      (Aigars's decision: webhooks and their secrets stay). Not yet proven Vercel releases the name.
   f. Switch channels back on to what his copy had; edu@ reconnects Gmail once (its refresh token belongs
      to Ritvars's OAuth client and is encrypted with his session secret).
   g. Live checks: people count matches; a known person has full history; a test website enquiry reaches
      the Inbox; next morning after 08:15 Riga the previous day's calls appear.
2. **Ritvars should build on `fix/security-2026-10-07` from now on.** Why: C1 (anyone can plant fake
   emails and calls) is open on his live copy until then, and his next release would otherwise drop the
   fixes. Next step: Aigars tells him (message drafted in the 2026-10-07 session).
3. **Year filter after sign-in**: Aigars to confirm the corner year picker still shows years once signed in.
4. **ARCHITECTURE.md** (global rule 11) once live, including the "If Aigars is unavailable" section.
5. Audit "can follow" items (see the audit report section 8): M2 history `?as=`, M4 retention cron for
   people/Inbox contact details (GDPR), M5 separate token key + feedback mail from a shared mailbox, M7
   error bodies and the Gmail bookmark, M8 pool size, M9 migration files, M10 monitoring/heartbeats, the LOWs.
6. Decisions parked by Aigars: phone pull frequency (once a day now; Pro allows more, Ritvars has a branch
   `account-move/pbx-every-minute` that was never pushed); feedback emails go from/to Ritvars's personal
   mailbox (`lib/notify.js` hard-codes it).

## Keys to rotate

- **PBX_API_TOKEN (TeleGroup)**: Ritvars's own notes record it as exposed in an earlier chat (audit M12).
  Aigars decided on 2026-10-07 to KEEP it (copied from Ritvars at switchover). Flagged once; his call.
  Under the global rule this list should be empty before go-live, so raise it once more at switchover.
- Nothing else. No secret value appeared in the 2026-10-07 session.

## Deferred ideas

- Domain-wide sign-in ("any @novikontas.org"): Aigars floated it; advised against with real applicant
  data (GDPR need-to-know, students may hold novikontas.org accounts). If wanted later, use the Google-group
  access module already used by Waypoint and Parking rather than opening the whole domain.
- Fake demo data in the college copy (`DATASET=demo` boot) was offered for demos and not chosen.

## Gotchas specific to this project

- The app connects through the Supabase **session pooler** `aws-1-eu-central-1.pooler.supabase.com:5432`
  as `postgres.cjnkzhypvennbqfmjziq`; the direct host is IPv6 only and unreachable from Vercel. The schema
  rides on the `options=-c search_path=crm` startup parameter (verified honoured; the boot now refuses if not).
- The pooler's certificate is signed by Supabase's private root, so TLS verification needs
  `config/supabase-root-2021-ca.crt`; Node's default CAs reject it.
- Sign-in is Google only (password route hard-coded 410) and needs a `crm_users` row; signing in never
  creates an account. One redirect URI serves sign-in and both Gmail flows.
- A restore replaces `crm_users` and `channel_mode`: re-add accounts, force channels off first.
- `vercel api` from Git Bash needs `MSYS_NO_PATHCONV=1`. Bash heredocs on this machine halve backslashes:
  write regex-heavy scripts with the Write tool.
- Ritvars's tests pin exact HTML text in many places; a markup change can fail a dozen tests that check
  wording, not behaviour.
- Never run the test suite with a production `DATABASE_URL` in the environment: tests create throwaway
  `crm_t_*` schemas in whatever database is set.
- Office DNS (DC1) caches "does not exist" answers; after any DNS fix, test on mobile data or have IT clear
  DC1's cache.
- Deploy pattern: never from the working clone (Vercel uploads the working tree). Make a fresh clone in a
  scratch folder, `git checkout --detach origin/fix/security-2026-10-07`, `vercel link --project
  college-crm --scope novikontas-academy-s-projects --yes`, run the suite, then
  `vercel --prod --yes --scope novikontas-academy-s-projects`.
