# Channels lane - discovery, 01.10.2026

P0 steps 1-3, written before any code. Mode (P4): **technical prototype**. Kinds of statement (P1)
are tagged: [seen] evidence, [guess] hypothesis, [decided] his decision.

## Current production

- [seen] `crm-novikontas.vercel.app` = deployment `dpl_G1vvHuMFXirySJo9A6JxqcvkKWSm`, created
  01.10 10:27 Riga, matches `b8454f7` (the `crm-deploy` checkout is detached at b8454f7, committed 10:25).
- [seen] Functions: `api/index`, `api/cron/gmail-poll`, `api/cron/pbx-calls`, `api/cron/sis-sync`.
  `vercel.json` schedules only sis-sync (05:00 UTC) and pbx-calls (05:15 UTC). **No Gmail cron.**
- [seen] `/api/admin/pbx/live` answers 401 (exists, admin only). `/api/admin/gmail/*` is not in b8454f7.
- [seen] Vercel Production variable NAMES: `GMAIL_SERVICE_ACCOUNT_JSON` (set 30.09), `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CRM_SESSION_SECRET`, `PBX_API_TOKEN`,
  `CHANNEL_MODE_PHONE`, `CHANNEL_MODE_SIS`, `CHANNEL_MODE_MAILCHIMP`, `MAILCHIMP_WEBHOOK_SECRET`,
  `CRON_SECRET`, `SIS_API_TOKEN`. **Not set:** any `GMAIL_OAUTH_*`, `META_*`, `LINKEDIN_*`, `TIKTOK_*`, Tilda.
- [seen] The sign-in client is `924744265754-...apps.googleusercontent.com` (project
  `novikontas-academy-crm`, Gmail API enabled there 30.09), redirect
  `https://crm-novikontas.vercel.app/api/auth/google/callback`, `hd=novikontas.org`.

## Worktree

`Projects/College CRM/crm-channels`, branch `lane/channels`, cut at production `b8454f7`.
Baseline `node --test test/*.test.js`: **738 pass, 0 fail**.

## Gmail option B (`57222df`) - what it needs before Marina can use it

[decided] Ritvars chose B (user OAuth, edu@ signs in once), 01.10.

Read from the commit:
1. [seen] `/api/admin/gmail/callback` requires an **Intake admin session** in the same browser. edu@ is a
   `user` in crm_users, and Marina is not an Intake user. A link sent to Marina would end in 403.
   Fix: the callback trusts the signed, expiring `state` that only an admin can mint, and still
   accepts ONLY edu@novikontas.org.
2. [seen] Option A wins whenever `GMAIL_SERVICE_ACCOUNT_JSON` is set, and it IS set. B would never run.
   Fix: a stored edu@ sign-in wins over A.
3. [seen] Redirect `/api/admin/gmail/callback` is not registered on the Google client. Either Ritvars
   adds it in Google Cloud, or the callback rides the already-registered sign-in address.
4. [seen] After the callback it redirects to `/#/settings`, which Marina cannot open. She needs a plain
   "edu@ is connected" page.
5. [seen] No Gmail cron in production; `8e5717d` adds it.
6. [guess] The OAuth consent screen is Internal (Workspace). If it is External in testing,
   gmail.readonly is a restricted scope and Google shows an "unverified app" stop. Check: the first
   consent click shows it; cheap and reversible.

Scope stays `gmail.readonly`. Nothing is ever sent from Gmail.

## PBX filtration

[seen] Today (`src/sync.js storeCall`): known number -> logged on the person; unknown number -> a
New Leads item, **answered or missed alike**; withheld -> counted only. Every call from the same
unknown number is its own New Leads row. 01.10 05:27 UTC run: fetched 104, kept 6, logged 2, inbox 4,
three of the four answered (lane brief).
[decided] "there will be filtration", "build it now" (Ritvars, 01.10).
[seen] New Leads never qualifies anybody by itself: a person is only created when staff press qualify;
archive needs a reason (Spam, Not a prospective student, Supplier or vendor, Internal, Already handled, Other).

Proposal (to his A/B): rules in `config/prototype.json` `phoneFilter`, each one counted in the run result:
1. known person -> their timeline (unchanged);
2. withheld -> counted (unchanged);
3. a number staff already archived as Spam, Supplier or vendor, or Internal -> stored as filtered, with
   the reason, not in the queue;
4. a number that already has an open New Leads item -> the call is added to that item, no second row;
5. every other unknown caller -> New Leads as "Not clear yet", answered or missed shown, ring-back number.
   Never a lead until a person says so.

## Channel queue (state at 01.10, [seen] in source and Vercel)

| # | Channel | State | Next |
|---|---|---|---|
| 1 | Phone | LIVE, unfiltered | filtration (this lane) |
| 2 | Gmail edu@ | not connected; B not in production | fix 57222df, cron, Marina's link |
| 3 | Tilda | adapter only; no real event | Ritvars sets the webhook (he has access 01.10) |
| 4 | Facebook / Messenger / Instagram / WhatsApp | adapters, no token, no real event | bfdeb31 + 4f40f78, then Oksana's access |
| 5 | LinkedIn | adapter + 4f40f78 lead fetch, not deployed | Tetiana: access request below |
| 6 | TikTok | 095ae31 reads Developer-webhook content | [guess] wrong product: TikTok lead forms come through the Business API (Ads Manager), not the developer webhook. Tetiana's answer decides |
| 7 | Google Form | 0800af3 Apps Script, not deployed | form owner |
| 8 | Open Day | parked by Ritvars | - |
| 9 | Mailchimp | TEST since 30.09 | his switch to live |
| 10 | Agent / partner | built our side | first partner |
| 11 | In person | works | - |
| - | SIS | integration, TEST (applications lane) | not this lane |

## What can break (P7)

| Break | Check |
|---|---|
| Marina's link is dead | open the connect link on production before sending, expect Google's consent page |
| B never runs because A's key is set | a test with both set: the stored sign-in wins |
| Filtration hides a real enquiry | every filtered call is stored with its reason; the run result counts each rule; a test per rule |
| Folding repeats loses the second call | the call count and last-call time on the item; pbx_calls keeps every row |
| A secret in source | only names; grep the diff before each commit |
