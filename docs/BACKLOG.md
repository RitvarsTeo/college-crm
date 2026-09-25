# Academy CRM - backlog

*Named "College CRM" until 24.09.2026. The product is **Academy CRM** (formally Novikontas
Academy CRM). The folder, the package name and the GitHub repository are still spelled
`college-crm`: those are identifiers other things point at, and renaming them is a separate
decision for Ritvars.*

Nothing is deleted here. A line changes status, it does not disappear.

**Statuses:** `SAID` - somebody said it, nothing checked · `DECIDED` - the owner decided it ·
`BUILT` - it exists in the prototype · `LIVE` - verified running in production (nothing is LIVE:
this is a local prototype) · `UNKNOWN` - named but not checked with the provider.

## Pin

**PIN: ACADEMY CRM - V1 VIRTUAL PROTOTYPE. NOT RELEASED, NOT DEPLOYED, NOT CONNECTED.**

- **Version:** V1
- **Scope: NOT LOCKED.** A clickable prototype for arguing with the Admissions workflow on screen,
  plus every channel adapter prepared but switched off and no provider contacted. It is changed
  daily by owner feedback and Ieva has not yet validated the workflow, so treat every row below as
  provisional until she has.
- **State:** implemented and tested locally; committed and pushed to `v1-test` for Aigars to test.
  Not deployed anywhere, so not verified anywhere but a local browser.
- **Release line / deployed:** `master` at `afea424`, unchanged and never deployed. It is the
  release line. `v1-test` at `b4d7ba3` is the **testing branch** Aigars works from, and it is meant
  to reach `master` through a pull request once Ieva has validated the workflow. That answer
  reached this file relayed rather than directly, so question 14 stays open until Ritvars confirms
  it himself. Nothing has been merged, deployed or tagged either way.
- **Next:** Ieva validates the workflow (rows 46, 50, 51). Next version: **UNKNOWN** - no V2 has
  been defined by the owner and this file does not invent one.
- **Blockers:** rows 46, 50, 51 (all for Ieva); open questions 1 to 6 and 9 to 14; the Google
  Workspace administrator; and every remaining item under "What is NOT done". Deployment is blocked
  by all of it. There is still no authentication, so every admin-only screen is a workflow rule and
  not a security boundary.

State as at 25.09.2026, read from Git and a test run, not from memory of a conversation:

| Delivery state | Answer | Evidence |
|---|---|---|
| Implemented | Yes | `git status --porcelain` is **empty**: the working tree is clean |
| Tested | Yes, locally | `node --test test/*.test.js` -> **326 pass, 0 fail**, run 25.09.2026 |
| Committed | **Yes** | `v1-test` = `b4d7ba3`. Five commits on top of `afea424` |
| Pushed | **Yes** | `origin/v1-test` = `b4d7ba3`, byte-identical to local. `origin/master` = `afea424`, untouched |
| Merged | **No** | nothing has been merged into `master`, by design. `git log --merges` is still empty |
| Deployed | **No** | no environment has ever received this code. No Supabase project, no Vercel project |
| Verified | **Locally only** | observed in a local browser. There is no deployed environment to verify in |
| Released | **No** | `git tag` is empty and there is no release record |

**A commit on GitHub is not a deployment and not a release.** `v1-test` existing on GitHub means
Aigars can fetch and run it. It means nothing about deployed, verified or released.

## Project control map

Where each concept lives in this project, so a session does not have to rediscover it. There is no
`CLAUDE.md` in this repository, so the map lives here.

| Concept | Home |
|---|---|
| Pin | this file, the **Pin** section above |
| Scope, and whether locked | this file, the **Pin** section above |
| Remaining work | this file: open rows below, plus **Open questions for Ritvars** and **What is NOT done** |
| Backlog | this file. Numeric `#` IDs, statuses `SAID` / `DECIDED` / `BUILT` / `LIVE` / `UNKNOWN` |
| Owner decisions and blockers | [DECISIONS.md](DECISIONS.md) - locked decisions with the test behind each, and the blocking table at its end. Plus **Open questions for Ritvars** here. |
| Release record | this file, the **Release record** section below. There was none before 24.09.2026. |
| Handoff | this file, the **Handoff** section below. There was none in the repository before 24.09.2026; it lived only in assistant memory, which no other account can read. |

Status words in this project do not mean what a generic checklist might assume:

- `BUILT` means it exists in the prototype. **It does not mean deployed, and it does not mean
  verified anywhere but a local browser.**
- `LIVE` means verified running in production. **Nothing in this project is LIVE, and nothing can
  be until something is deployed.**
- `DECIDED` means the owner decided it. It says nothing about whether it is built.

## Release record

**Nothing has ever been released.** No tag exists. No environment has received this code.

| Version | Released | Tag | Deployed to | Verified |
|---|---|---|---|---|
| V1 | No | none | nowhere | local browser only |

The published artefact is the GitHub repository `RitvarsTeo/college-crm` (private). It now holds
two branches: `master` at `afea424`, untouched, and `v1-test` at `b4d7ba3`, which is what Aigars
tests. **A commit on GitHub is not a deployment and not a release.**

## Handoff

Written 24.09.2026. A fresh session on any account should be able to work from this alone.

- **Branch:** `v1-test` at `b4d7ba3`. One worktree, no others (`git worktree list`). The working
  tree is **clean**.
- **Remote:** `origin` -> `https://github.com/RitvarsTeo/college-crm.git` (private, owner
  `RitvarsTeo`, collaborator `NovikontasAcademy` with write access). `origin/v1-test` = `b4d7ba3`,
  `origin/master` = `afea424` and **must stay there** - nothing is pushed or merged to `master`.
- **Other branch:** `deployment-audit` at `7438633` exists **locally only**. It holds a deployment
  audit that was deliberately not published. Do not delete it without asking.
- **What is on `v1-test`,** five commits on top of `afea424`: the 14 channel adapters and the
  locked navigation (`45afc38`), the Mailchimp check and typed blockers (`9638051`), Marina's
  WhatsApp and phone confirmations (`7305310`), the guide rebuilt as the connection task list
  (`690f1f5`), and four faults found by testing against real provider shapes (`b4d7ba3`).
- **Tests:** `node --test test/*.test.js` -> **326 pass, 0 fail**, run 25.09.2026.
- **Run it:** `npm start`, then `http://localhost:8800`.
- **Database:** `data/crm.db`, git-ignored. It **survives a restart** - verified by seeding a row,
  restarting and reading it back, after row 58 fixed a boot-time wipe that made an earlier claim of
  this wrong. `CRM_DB=:memory:` restores throwaway behaviour; the tests use it. `DATASET=empty|real|synthetic`
  forces a load at boot and therefore CLEARS what is there.
- **Open owner decisions:** the stage names (row 46), the real process after "To look at" (row 50),
  follow-up outcomes (row 51), and everything in [DECISIONS.md](DECISIONS.md)'s blocking table.
- **Exact next action:** Ieva validates the workflow (rows 46, 50, 51). Committing and pushing to
  `v1-test` is authorised; `master` is not, and nothing is deployed anywhere.
- **UNKNOWN:** whether V1 is ever meant to be deployed, and to what. No environment has been chosen.

### Git workflow: proposed, not established

This repository has **one commit and no merge commits**, so it has no established branch or PR
convention to follow. Rather than inventing one, here is the proposal for Ritvars to confirm or
reject:

- work on a feature branch per bounded change, named `feature/<row-id>-short-name` or
  `fix/<row-id>-short-name`, branched from `master`;
- open a pull request against `master` stating purpose, behaviour, evidence, what is unverified and
  the rollback, and merge it there;
- keep `master` as the release line, and tag only a commit that has actually been deployed and
  verified - which, today, means no tags at all.

**Superseded 24.09.2026.** Ritvars established the convention himself: `v1-test` is the testing
branch for Aigars, work is committed and pushed there directly, and `master` is never pushed to or
modified. No pull request has been opened and no branch has been merged. Whether `v1-test` later
becomes the release line, or merges into `master`, is open question 14.


**To connect a real channel, start at [CONNECTING_CHANNELS.md](CONNECTING_CHANNELS.md).** It is the
walk-through: the exact endpoint, the exact secret name, and the exact person outside this
repository who has to act first, in the order the work should be done.

The locked decisions live in [DECISIONS.md](DECISIONS.md), each with the test that keeps it honest.
The inbound design is in [INBOUND_ARCHITECTURE.md](INBOUND_ARCHITECTURE.md) and is **awaiting
approval - nothing is connected**. The questions for each provider are in
[PROVIDER_QUESTIONS.md](PROVIDER_QUESTIONS.md).

---

## From the meeting of 23.09.2026

| # | What | Status | Notes |
|---|---|---|---|
| 1 | Three owner roles: Admissions / Student Coordinator / Other | DECIDED, BUILT | Admissions is the default owner. The role reads **Admissions** on every screen. |
| 2 | Who holds each role | **SUPERSEDED by 16** | The 23.09 evening decision locks a user list, so the roles and the people are now two separate things in the config and on the screen. |
| 3 | Telephony provider is TeleGroup | SAID | Recorded on the phone channel in `config/providers.json`. |
| 4 | A call gives us the caller ID | SAID | Not verified with TeleGroup. |
| 5 | A call gives us the menu choice the caller presses (1-3) | SAID | Not verified with TeleGroup. |
| 6 | After the call, TeleGroup sends a notification to the app | **OPEN - external question** | Nobody has asked TeleGroup: *does the phone system provide a post-call notification, and what does it contain?* Until that is answered the phone stays **manual in V1** and the prototype does not claim automatic phone integration. |
| 7 | Email: a human reads it, the valuable part is pushed in by a browser EXTENSION | SAID (idea) | Recorded on the gmail channel as `alternativeApproach`. Not designed, not built, not costed. |
| 8 | Cost limits table | DELIVERED | `C:\Users\ritvarsv\Desktop\College_CRM_Cost_Limits.xlsx`, 12 rows, exactly as supplied. |
| 9 | **Edit a person.** | **DECIDED 23.09.2026, BUILT** | Editable: name, email, phone, programme, study form, education, owner, notes. **Locked: source channel, source campaign, source detail, first-contact date** - historical facts, not current state. A locked field is refused **by name and with a reason**, and a refused edit writes nothing at all, not even the legal half of it. Policy lives in `config/prototype.json` → `editPolicy` and in `src/history.js`. |
| 10 | **Manual tracking goes in the same log.** | BUILT | One table, one screen. Every entry carries `origin`: `manual` or `automatic`. Adding somebody by hand, logging a call, marking open-day attendance, changing a status by hand, editing - all `manual`. Integration inbound and outbound, and the automatic stage move - all `automatic`. `logEvent()` **throws** if a write does not say which, so it cannot be forgotten in one place and remembered in twenty. |
| 11 | **Edits go in the same log.** | BUILT | One entry per field that really changed: field, old value, new value, who, when. Two fields changed at once are two entries, not one lump. Setting a field to the value it already has writes nothing. |
| 12 | **The whole history log is for admins only.** | **DECIDED 23.09.2026, BUILT as far as it can be** | **The admins are Aigars, Ritvars and Marina.** Nobody in the admissions trio is an admin. **This is not security and the screen says so:** the prototype has no login, so "who you are" is a dropdown in the sidebar, not a check. Real enforcement waits for authentication. |
| 13 | **The interface is English only.** | DECIDED 23.09.2026, BUILT | The Latvian/English switch and the 274-pair dictionary are gone. They are archived, not deleted: `_archive/latvian-language-package/` holds `i18n.json` and a `.lv` copy of every file that was translated. |
| 14 | **An ordinary user sees the history of their own actions. An admin sees the full picture.** | **DECIDED 23.09.2026, BUILT** | Not a refusal any more: a non-admin gets a screen headed **My history** listing only what was done under their name, with no "By" column because every line is theirs. An admin gets the whole log, both origins, every person. Caveat printed on the screen: **a role is not yet a person** - "Admissions" is shared, so it shows everything done under that role. Per-person history needs a login. |
| 15 | **What the CRM writes to an applicant is in English.** | DECIDED 23.09.2026 | The outbound drafts are English. They are still prototype wording, not approved copy - what is actually sent, and when, is a separate decision. |
| 16 | **The CRM users are Ieva, Laura, Tetiana and Maris Cirulis. A role is not a person.** | **DECIDED 23.09.2026, BUILT** | The sidebar picker lists PEOPLE. The owner field lists ROLES and says so on the label. Tetiana is Head of Marketing, so Marketing joins the owner roles. No email addresses, no authentication: identity is still a setting. |
| 17 | **A normal user sees their own actions and their own corrections, never a colleague's corrections.** | **DECIDED 23.09.2026, BUILT** | The person's activity (calls, notes, messages, visits, status) stays visible to everybody who may open the record - otherwise two people ring the same applicant. An internal correction is private to whoever made it. The page counts what it is hiding instead of pretending nothing happened. Verified: Laura sees the notice and not the field change; Ieva and Marina see it. |
| 18 | **One person record from lead to admitted, then handed to SIS.** | **DECIDED 23.09.2026, BUILT** | Conversion stays measurable on the same row. A test walks a person through every stage and asserts one row, an unchanged source and an unchanged first-contact date. The CRM does not become the SIS. |
| 19 | **Ownership follows the current stage, not a permanent assignment.** | **PRINCIPLE LOCKED, map NOT decided** | `ownershipFollowsStage` is `false` and says why. The stage list and the stage-to-owner map are the first blocking decision. |
| 20 | **Notes carry a type and stay in the same history.** | **DECIDED 23.09.2026, BUILT** | Call note, On-site visit note, Admissions note, Stage note, Other note. A test asserts no separate notes table can exist. |
| 21 | **A person is never closed without a reason, and "Other" needs an explanation.** | **DECIDED 23.09.2026, BUILT** | Ten reasons, provisional until Admissions validates them. Two new columns hold the reason and the note. |
| 22 | **Duplicates are blocked, not warned about.** | **DECIDED 23.09.2026, BUILT** | A match returns 409 with the existing record and an Open button. Getting past it takes an explicit "this is a different person". One matcher serves both the live warning and the save, so they cannot disagree. **Merging two records is still missing.** |
| 23 | **Search reaches whatever the operator remembers.** | **DECIDED 23.09.2026, BUILT** | Name, email, phone, programme, study form, education, source, campaign, id, student number, notes - and the channel's plain name, so "instagram" works. |
| 24 | **Today is grouped, the order is the user's, and nothing is ever hidden.** | **DECIDED 23.09.2026, BUILT** | New leads / Follow-ups / Replies / Other attention. Each shows done/total; an empty group says "clear" rather than disappearing. The order is remembered per browser. |
| 25 | **Three core metrics, and the conversion caveat is stated out loud.** | **DECIDED 23.09.2026, BUILT** | New leads this month, admissions this month, conversion %. The screen says that admissions-this-month and conversion-this-month count different populations. The wider reporting dimensions are recorded as things to investigate, and **nationality is not in the schema at all**. |
| 26 | **The operator never sees API machinery.** | **DECIDED 23.09.2026, BUILT** | A test scans the daily screens for webhook / oauth / Pub/Sub / endpoint / API key and fails if any reaches a screen Ieva uses. |
| 27 | **Inbound information architecture.** | **DESIGNED 23.09.2026, AWAITING APPROVAL. NOTHING CONNECTED.** | A machine may sort, only a person may discard. Model B (intake queue) is the spine, Model A labels and ranks inside it, Model C is the fallback where App Review fails. See [INBOUND_ARCHITECTURE.md](INBOUND_ARCHITECTURE.md). |
| 28 | **Person page split into sections.** | DECIDED as a principle, **deliberately not built** | The visual hierarchy belongs to the next visual review, so the page was left alone rather than redesigned twice. |
| 29 | **Inbound -> Warm -> Hot. Marketing qualifies before Admissions sees anything.** | **DECIDED 23.09.2026 (Aigars), DESIGNED, not built** | Tetiana already works IG / WhatsApp / Facebook / LinkedIn, so broad inbound is hers. "Hi" is a raw contact, not a lead. Recorded in `config.qualification` as a **separate field**, never merged into the stage list. |
| 30 | **Warm-to-Hot threshold.** | **NOT DECIDED, and defended as not decided** | `warmToHotThreshold` is `null`; a test fails if anybody fills it in. Three candidate definitions are written up, none chosen. |
| 31 | **Notification model: raw notifies nobody, hot notifies Admissions.** | **DECIDED 23.09.2026, in config, not built** | Thirty "Hi" messages produce zero notifications for Ieva and thirty rows for Marketing. A raw contact is visible and searchable; being un-notified is not the same as being invisible. |
| 32 | **The machine proposes, never asserts.** | **DECIDED 23.09.2026, in config, not built** | Every field carries provenance. An `extracted` value is a suggestion, shown differently, and excluded from every count and report until a human confirms it. Missing information is displayed, never a reason to block creation. |
| 33 | **No conversation bodies in V1.** | **DECIDED 23.09.2026** | Identity, source, timestamp, thread key, qualification, extracted fields, notes, who processed it, next action, owner, audit. **The cost is recorded:** an extraction error becomes uncheckable, and the earlier claim that the queue "preserves full message context" is withdrawn in the architecture document rather than left standing. |
| 34 | **Browser extension demoted.** | **DECIDED 23.09.2026** | Not a V1 component. Marketing works on a phone. Fallback only if a provider approval is refused outright. |
| 35 | **LinkedIn is a real channel with zero research.** | **UNKNOWN, recorded as unknown** | Kept OUT of the researched provider config on purpose, with a test enforcing it, so it cannot look investigated. Questions written. |
| 36 | **PBX incoming-call logger.** | **BUILT 23.09.2026, NOT DEPLOYED, NOTHING CONNECTED** | Vercel Cron every 5 min asks the tg.lv PBX for the last 15 min, keeps incoming calls on the three college queues, upserts on `uniqueid`. Europe/Riga handled explicitly with no hardcoded offset and both DST transitions tested. The token lives only in `process.env.PBX_API_TOKEN`, is never logged, and is never logged. `sql/001` is written and NOT applied. See [PBX_CALL_LOGGER.md](PBX_CALL_LOGGER.md). |
| 37 | **Vercel plan for the 5-minute cron.** | **UNCHECKED, blocking** | A 5-minute cron needs Pro. On Hobby it silently becomes daily and a 15-minute window would then miss almost every call. Nobody has confirmed which plan the Academy CRM project is on. |
| 38 | **Call-record retention.** | **NOT DECIDED** | The table holds caller numbers. No purge job exists, because how long a call may be kept is a privacy decision and a default would be an invented policy. |

## Prototype state

| What | Status | Notes |
|---|---|---|
| Interface in English, no language switch | BUILT | `config/i18n.json` removed, `/api/i18n` removed, the runtime translator removed. Verified screen by screen in the browser. |
| Table starts empty, channel demo writes the first person in | BUILT | Verified end to end after the history work: 0 people / 0 history → demo → 7 people / 35 entries → clear → 0 / 0 → demo again → 7 / 35. |
| Edit a person, from the person's own record | BUILT | "Edit record" on the person page. The locked fields and the reason they are locked are printed inside the form, so the rule is visible on screen and not only in the server. |
| One history screen | BUILT | Sidebar → History. Person events and integration events are merged and sorted as one list. An admin gets the whole thing with Everything / Manual only / Automatic only filters; anybody else gets **My history** - their own actions, no filters, no "By" column. |
| "Acting as" picker in the sidebar | BUILT | Three roles and three admins, labelled **NO LOGIN**. Everything written carries that name as the actor. It is a demonstration of who would see what, not a permission system. |
| Next step is mandatory, chosen from a dropdown | BUILT | The server refuses to close an action without one. |
| Status follows the events automatically | BUILT | Forwards only, never past "Not proceeding", and the move is written to the history as `automatic`. |
| Open days sit inside Channels | BUILT | It is a channel, not a separate screen. |
| Real people from the admissions sheet | BUILT | 470 loadable on demand; the file is git-ignored and never leaves this machine. |
| Identity is a person, ownership is a role | BUILT | The sidebar picks Ieva / Laura / Tetiana / Maris Cirulis / the three admins. Records are owned by Admissions / Student Coordinator / Marketing / Other. |
| Typed notes | BUILT | Five types, one history. |
| Closing needs a reason | BUILT | Ten reasons; "Other" needs an explanation; both refused server-side. |
| Duplicates blocked | BUILT | 409 with the existing record and an Open button, and an explicit override. |
| Today grouped and re-orderable | BUILT | Four groups, done/total on each, order remembered, nothing hidden. |
| Three core metrics | BUILT | On Today, with the population caveat printed under them. |
| Tests | 182 PASSING | `node --test test/*.test.js`. Includes 33 for the intake flow and 35 for the PBX logger, none of which need a network or a real token. |
| The undecided things are defended by tests | BUILT | Sabotaging the config (inventing a threshold, notifying Admissions on raw, turning on body storage) was tried and **4 tests failed**, so these are real guards rather than decoration. |

## What is deliberately still in Latvian, and why

The **interface** is English everywhere. Three things are not, on purpose:

1. **Simulated inbound payloads.** The Google Form field is really called `Vārds uzvārds`; the
   applicant's WhatsApp message really is in Latvian. Translating them would misrepresent what the
   integration actually receives, and the field mapping panel exists to show exactly that.
2. **Latvian names** in the synthetic data. The applicants are Latvian.
3. **`Piemēri Profesiju`** in `config/providers.json` - the real name of a real event.

The **outbound** message drafts are English - decided 23.09.2026. They are still prototype wording,
not approved copy: what the CRM actually says to an applicant, and at which step, has not been
written by anybody who owns that text.

The research prose on the Integrations / Metrics / Privacy screens stays English because it quotes
provider documentation.

---

## From Aigars's first real test, 24.09.2026

He ran the prototype and wrote a braindump (`Crm braindump.docx`, six screenshots). This is what he
said, what was decided, and what was built the same day. Ritvars confirmed each decision before it
was built.

| # | What | Status | Notes |
|---|---|---|---|
| 40 | **CAR: clicking "open" threw an error.** | **BUG, FIXED** | Reproduced: the page said `Failed to load: not found`. The cause was not the link. The database lived in memory, so every restart emptied it while the open browser tab carried on showing rows that no longer existed. Two fixes: the database is now a **file** (`data/crm.db`, gitignored), and a missing record now says *"Not here any more"* with why, instead of the word "failed". |
| 41 | **People: the four filters did nothing at all.** | **BUG, FIXED** | Aigars drew a question mark over each one. They were unlabelled - and also had no change handler, so none of them had ever filtered anything. They now carry the name of what they filter (Search, Stage, Programme, Owner, Came from, Next step) and all of them work. |
| 42 | **Today: a table, not one card at a time.** | **DECIDED 24.09.2026, BUILT** | "Šeit vajadzētu tabulas view lai ir overview." The table is the default. The one-at-a-time card view is kept behind a **Table / One at a time** switch, because it is the better shape on a phone. This reverses the 23.09 instruction that Today must show one person at a time; both owners have now said table. The choice is remembered per browser. |
| 43 | **CAR: two tabs too many.** | **DECIDED 24.09.2026, BUILT** | The **Junk** tab is gone. Machine-filtered sales pitches and items a person marked *Not relevant* are now one list, hidden by default behind **Show not relevant**. Underneath they stay two states (`filtered` and `archived`) because the funnel counts real contacts and a sales pitch was never one. |
| 44 | **CAR: an operator could not say what somebody wanted.** | **BUG, FIXED - this was the real complaint** | Aigars wrote a note saying the person wanted the engineer programme, pressed Save, and the person landed in *Done* marked "Not clear yet". The dialog only offered tick boxes for what the **machine** had extracted, and a message saying "hello" gives the machine nothing to extract. So there was no way to record what he already knew, the item could only be filed as unclear, and the person came to rest with nobody owning them. The dialog now asks **"What do they want to study?"** with the programme list, pre-filled from the message when the machine did read one. Saying a programme makes it a lead, routes it to Admissions and puts the person on the pipeline. The value is stored with provenance `operator` - a person said it, not a machine. Stating an interest and filing it as unclear is now **refused**, not quietly accepted. |
| 45 | **A qualified lead must reach a pipeline.** | **DECIDED 24.09.2026, BUILT** | New **Pipeline** screen: a horizontal board, one column per configured stage, counts per column, people as compact cards showing programme, education, channel, owner and next step. Cards are **dragged between columns and that is a real stage change**: it saves the same way the person page does, so it lands in the history with who moved it, from which stage to which. Dropping somebody into *Not proceeding* still asks for a reason first and changes nothing until it is given. |
| 46 | **The pipeline stage names are not agreed.** | **OPEN - for Ieva** | The board reads `config/prototype.json` → `stages` and there is no stage list in the code. Renaming, reordering, adding or removing a column is a config edit. The screen says on it that the columns are provisional. **This is the first thing to walk through with Ieva.** |
| 47 | **People: edit without opening the profile.** | **DECIDED 24.09.2026, BUILT** | Every row has an **Edit** button that opens the eight editable fields plus a note box inline, under the row. It saves through the same route the person page uses, so the same field policy applies and the same history entries are written. |
| 48 | **The Documents card is removed.** | **DECIDED 24.09.2026, BUILT** | Aigars crossed it out: documents are collected in the admissions portal, not here. A half-mirrored checklist only invites somebody to trust the wrong copy. |
| 49 | **In-app feedback, like the one in Suggest.** | **DECIDED 24.09.2026, BUILT** | A floating **HELP** pill on every screen opens *Send feedback*: an idea or something broken, a message, and an optional screenshot that can be **pasted with Ctrl+V** straight after a Win+Shift+S capture. It records the screen it was sent from. Admins get a **Feedback** inbox with the screenshot inline, a link back to the screen, and *Mark handled*. Built from Aigars's own brief (`feedback-widget-brief.md`). |
| 50 | **The pipeline after "To look at" needs Ieva's real process.** | **OPEN - for Ieva** | Aigars: "šeit ir jāparunā ar Ievu, kāds šobrīd reali ir tas process". He named *contacted once*, *waiting for reply* as examples. Nothing has been invented: the board uses the stages that were already configured. |
| 51 | **Follow-up outcomes and next steps need Ieva.** | **OPEN - for Ieva** | Aigars had nothing to add himself and asked for Ieva to go through the lists and comment. |
| 52 | **Does every message reach the CRM, or does a human filter first?** | **OPEN - Aigars's question** | Today: obvious sales pitches are dropped on arrival by a word filter and everything else reaches *To look at*, where a person decides. That is the design, but Aigars did not find it obvious from the screens, which is itself worth fixing. |

| 53 | **Renamed to Novikontas Academy CRM, with the official logo.** | **DECIDED 24.09.2026, BUILT** | The header carries the **authorised logo file**, not a redrawn one, and there are two of them: `NoAca_logo_darkhor.svg` on the light shell and `NoAca_logo_whitehor.svg` on the dark one. Neither is recoloured by hand, which the brandbook forbids. Under it, one line only: `CRM - V1 virtual prototype`. The **"V1 DEMO DATA - 12 people" badge is gone from the header** and now sits in DEV CONTROL, next to the buttons that change the dataset. |
| 54 | **The logo is the way Home.** | **DECIDED 24.09.2026, BUILT** | Clicking it goes to Today from anywhere. |
| 55 | **The pipeline fills the page.** | **BUG, FIXED** | The board ran off the right-hand edge behind a scrollbar and the last column was clipped. The cause was the page itself stretching: `main` is a grid item, and a grid item defaults to `min-width:auto`, so wide content widens the column instead of scrolling inside it. With `min-width:0` the board's own scrolling works, and the stage columns now share the width so all seven are on screen at once. |
| 56 | **Dark mode: the dropdown lists were unreadable.** | **BUG, FIXED** | The list a `<select>` drops open is drawn by the browser, not by the stylesheet, so it stayed white while the options inherited light text - "Light" was white on white. `color-scheme` now tells the browser which theme it is drawing, and the options carry an opaque `--menu` colour. It had to be a new token: `--surface` is a 5.5% translucent overlay in this dark theme, and a browser-drawn menu has nothing of ours behind it. |

| 57 | **Black logo on the light theme.** | **OWNER OVERRIDE 24.09.2026, BUILT** | The dark theme uses the authorised `NoAca_logo_whitehor.svg` unchanged. The light theme does **not** use an authorised file: `src/assets/NoAca_logo_blackhor.svg` is the official `NoAca_logo_darkhor.svg` with its fill changed from Novikontas navy `#022367` to Pitch Black `#011111`. Exactly one line differs and the geometry is untouched, which was verified by diffing the two files. **The Novikontas brandbook lists recolouring among its nine don'ts and no official black variant exists anywhere on this machine.** Ritvars was told that and decided to use black anyway for this prototype. The file carries the same warning in its own header. If an official black asset ever appears, replace this file and delete it. |

| 58 | **The file database was still being wiped on every restart.** | **BUG, FIXED - my own regression** | Row 40 made the database a file so a restart would stop emptying it under a tester. It did not work, and I reported that it did. `src/server.js` ran `loadDataset(...)` at boot, and `loadDataset` clears every table first. That cost nothing while the database was in memory - a new process was empty anyway - but against a file it destroyed everything on every start. Only `feedback` survived, because `clearAll()` does not touch it, and that is what made it look like persistence was working. Boot now leaves an existing database alone and only applies the configured starting dataset to a new, empty one; `DATASET=...` still forces a load, which is what the tests use. **Proved by seeding a row, restarting, and reading it back.** |
| 59 | **One admin seat in the demo.** | **DECIDED 24.09.2026, BUILT** | The picker listed Aigars, Ritvars and Marina. It now offers one **Admin**. There are still three real admins and `config/prototype.json` → `_admins` names them; two tests assert that the note keeps naming all three, so the fact cannot be dropped quietly. The reason is honesty: without a login, three named admins in a dropdown was fiction - anybody could pick any of them. One seat says what is true, which is that admin is a level of access and not yet a person. |
| 60 | **Follow-ups and Replies merged into "Waiting on us".** | **DECIDED 24.09.2026, BUILT** | They were two tabs answering the same question, *who needs me today?*, and they differed only by **who started it**: Follow-ups were open tasks due or late (we planned them), Replies were people whose last event is inbound with nothing sent back (they wrote). Worse, somebody with both appeared **twice**. Now one queue, de-duplicated by person, oldest first. Each row carries a small marker - `we planned this`, `they wrote`, or `they also wrote` - and keeps its own action, because a planned step is marked done and a message is answered. Today is three tabs, not four. |

| 61 | **A person's timeline was a raw data dump.** | **BUG, FIXED** | A website application read `submission_id: web-so1np9hp submitted_at: 2026-09-24T10:12:51.730Z name: ... utm_source: instagram utm_medium: paid ...`, and its heading was in Latvian. Ieva reads this between phone calls. It now says: *Wants to study NAV, full time. Reach them on +371 26 411 900 or the email. Agreed to be contacted about applying and about news and offers. Found us through a paid Instagram ad (campaign nav-2026-09).* **The full payload is not lost** - it is kept in `sim_events` and shown on the Channels and Inspector screens, where somebody is deliberately looking at the plumbing. Same treatment for the Google form and the Mailchimp events. |
| 62 | **The timeline named the wrong channel.** | **BUG, FIXED** | A website form carrying `utm_source=instagram` was listed as an **Instagram** message, because the event took its channel from the traffic source. It now shows the channel the message ARRIVED on; where the traffic came from is a separate fact and is in the sentence and on the person record. That exposed three simulator channels with no plain name - `website_form`, `gmail`, `open_day` - which are now aliases of Website, Email and Open Day. A test fails if any simulator channel has no plain name, and I proved it fails by deleting one. |
| 63 | **Latvian on English-only screens.** | **BUG, FIXED** | Three headings were Latvian (`Pieteikuma forma`, `QR pieteikums`, `Google formas pieteikums`), and a website fixture wrote the study form as `Pilna laika` into a person record whose configured vocabulary is Full time / Part time. All English now. **What deliberately stays Latvian:** the raw Google Form field names, the raw notification email, and profession names like *Kuģu kapteinis*. Those are what genuinely arrives from Latvian systems and from real people; changing them would be inventing data. A real sender's email subject also keeps their own words - only our own system-generated notification says it in English. |
| 64 | **Today showed everybody's work under one person's name.** | **BUG, FIXED** | The sidebar said *waiting for you 4* and Today said *Waiting on us 6*, which is what Ritvars spotted. They were measuring different things: the sidebar is filtered to your role, Today was not filtered at all. Today now shows the acting person's role by default, with a **role / Everyone** switch beside the Table switch. |
| 65 | **The sidebar folded two different numbers into one.** | **BUG, FIXED** | *waiting for you* was live-leads-you-own plus overdue steps. The lead part only ever grows, so the number never emptied and never matched Today. It is now two lines: **needs you today** (messages to look at and late next steps - the same things Today asks for) and **leads you own** (how many people are in your pipeline, which is not a to-do). |
| 66 | **Feedback is for Aigars and Ritvars only.** | **DECIDED 24.09.2026, BUILT** | Not derived from the admin list: **Marina is an admin and must not see the feedback inbox.** `config/prototype.json` → `feedbackReaders` is its own list, every feedback route checks it, and the screen hides the inbox from anybody else. Proved by sabotage twice: adding Marina to the readers turns 3 tests red, and putting the routes back on `isAdmin` turns 4 red. Note the honest limit: with no login this checks the **name that is selected**, not who selected it. |
| 67 | **Being told when feedback arrives.** | **BUILT 24.09.2026, in-app only** | **This app has no email mechanism of any kind** - nothing here can send mail, and nothing is deployed to send it from. So the notification is in the app: a count beside the Feedback link, visible only to the two readers, that clears as items are handled. **An external channel is still an open decision** - see the question below. |

| 68 | **The person page crashed for everybody CAR produced.** | **BUG, FIXED** | `fieldChip` was called on the person page and defined nowhere. It broke **4 of 12** demo people - exactly those qualified through CAR with a confirmed field - and therefore **4 of the 5 open links in CAR Done**. Present since the V1 commit `afea424`. My earlier "open is fixed" report was half right: the stale-database cause was real and fixed, this second cause was never found. Now 0 of 12 crash. A test walks the person page and fails if it calls anything undefined; proved by deleting `fieldChip` again. |
| 69 | **Qualifying from CAR created duplicates in silence.** | **BUG, FIXED** | `config.duplicateRule.blockOnMatch` has been `true` since 23.09 and was applied on the manual Add person screen ONLY. `qualify()` never asked. That is how two Emīls Baltputnis records with the same phone got in. The matcher now lives in `src/identity.js` and every path uses it. Qualifying a known contact is refused and the screen **names who it already has**, offering three ways out: *This is them*, *Open*, or *No, this is a different person*. Phone matching normalises `+37120423829`, `37120423829` and `20423829` to one person. |
| 70 | **Qualifying created leads with nobody scheduled to act.** | **BUG, FIXED** | `config.nextActionRequired` has been `true` since 23.09 and was enforced when COMPLETING a task, never when creating a lead. Three demo leads sat on the pipeline with zero tasks. The dialog now asks **What happens next?** and the save is refused without it. The due date comes from the configured action's `days`, never from a number in the code. A later message about somebody who already has a step does not stack a second one. **People with no next step: 3 before, 0 now.** |
| 71 | **The demo walk-through reported work it had not done.** | **BUG, FIXED** | Found while fixing 70. The script pushed whatever `qualify()` returned into an array and reported its length as a success count. When the new gates started refusing every step it still announced `qualified: 5` with **nothing qualified** and quietly lost five people. It now reads the return value and fails loudly. A test asserts the number reported equals the number that happened. |
| 72 | **One inbound contract, and an adapter for all thirteen channels.** | **BUILT 24.09.2026** | `src/inbound.js` defines the normalised event; `src/adapters.js` maps every provider shape into it; `config/channels.json` is the register. The path is always `provider event -> adapter -> normalised event -> filter -> CAR -> human -> person`, with **no shortcut into CAR anywhere**, so what is tested locally is the path a real provider will take. The provider payload is kept raw and never becomes the CRM's data model. |
| 73 | **A generic inbound endpoint with real security interfaces.** | **BUILT 24.09.2026** | `POST /api/inbound/<channel>`. Meta signatures are verified with a real HMAC over the raw bytes; shared secrets are compared in constant time; Mailchimp's URL secret **says in its own result that it is the weak option**, because Mailchimp does not sign. A missing secret is an honest failure, never a silent pass. LinkedIn and TikTok report `unconfirmed` rather than pretending. Idempotency is by `(channel, external id)`: a provider retry is stored once. An event with no id to deduplicate on is refused rather than guessed at. |
| 74 | **Connections screen and inbound diagnostics.** | **BUILT 24.09.2026** | **Connections** shows every channel with its status, mechanism, event count, whether credentials are present, whether a webhook is verified, and what it is blocked on. **No secret value ever reaches the screen** - only present or absent, and a test asserts the value cannot leak. **What arrived** shows where each inbound event ended up and every delivery attempt including refused ones. Today: 3 ready for configuration, 9 waiting on somebody outside, 13 with an adapter, **0 connected**. |
| 75 | **Every channel can be simulated through the real path.** | **BUILT 24.09.2026** | Provider-shaped fixtures in `src/fixtures.js`, used by **both** the simulator and the test suite so what is demonstrated cannot drift from what is verified. All 13 simulate end to end over HTTP and every one terminates in a valid state. |
| 76 | **Channel readiness documentation.** | **BUILT 24.09.2026** | [CHANNEL_READINESS.md](CHANNEL_READINESS.md), generated from the config by `scripts/gen_readiness.py` so the document cannot drift from the register. Per channel: what we control, what the provider controls, credentials, who outside must act, how we test, how we go live, how we turn it off. Unknowns are marked **EXTERNAL CONFIRMATION REQUIRED**, never guessed. |

| 77 | **The navigation is the product now.** | **DECIDED 24.09.2026, BUILT** | Six items and nothing technical: **Today, Inbox, Admissions, Follow-ups, People, Reports**. CAR is gone as a word - it is the **Inbox**. Pipeline is gone - it is **Admissions**. Channels, Connections, What arrived, History and Privacy left the main product entirely. Old links still resolve (`#/car`, `#/pipeline`) so a bookmark or a link in a feedback report does not break. |
| 78 | **The Console is our control room; the CRM is their product.** | **DECIDED 24.09.2026, BUILT** | There is no demo mode inside the CRM any more: no simulator buttons, no demo banners, no dataset switch. All of it moved to `#/console`, which carries Send an event, Demo data, Connections, What arrived, Channel research, Full history and Privacy. **A Console event travels the real path** - payload, adapter, filter, Inbox - so what it demonstrates is the product and not a picture of it. Verified: a Messenger documents-question landed in the Inbox, a pitch was filtered, and an existing-person scenario matched a real imported person by phone. |
| 79 | **Messenger is its own channel; Meta is one connection.** | **DECIDED 24.09.2026, BUILT** | Facebook, Instagram, Messenger and WhatsApp share ONE Meta Business Suite connection. That is an integration detail. Each stays a **separate source** in the CRM for reporting, filtering and history, and a test fails if a combined "Meta" figure ever appears - it would hide where people actually came from. 14 channels now. |
| 80 | **Klātiene is In person.** | **BUILT 24.09.2026** | The channel id is `in_person` and the label is *In person*. The old id survives only as an alias so the 19 imported people who arrived that way still read correctly, and a test fails if any Latvian reaches a channel name on screen. |
| 81 | **Admissions ownership is always Ieva.** | **LOCKED 24.09.2026** | A confirmed Admissions case is owned by **Admissions**, and Ieva holds that role, whatever channel it arrived on. A test walks **all 14 channels** and asserts it. Channel access is a separate question: Tetiana is the only person who can open LinkedIn, and a LinkedIn lead is still Ieva's case. Arina has no social access at all and is phone button 3 backup only. |
| 82 | **Reports is a KPI meeting tool.** | **BUILT 24.09.2026** | Pick a period (this month, last month, this year, everything, or any two dates). Eight headline figures, a twelve-month trend of arrivals against admissions, per-programme leads and admissions, and breakdowns by source, programme, study form, education and stage, plus why people did not proceed. CSV download. **Every number is a count of rows**, and conversion names its population out loud because admitted-this-month counts a different one. |
| 83 | **What Reports cannot measure is listed, not left blank.** | **BUILT 24.09.2026** | Nationality (no field anywhere, and the export has none), HE applications (nothing marks one), maritime school graduates (partial - derived from an education field that is mostly empty), admission duration (partial - only exists for admitted people). Each says why and what would fix it. A blank column reads as zero; a named gap does not. |
| 84 | **The real database runs the whole product.** | **BUILT 24.09.2026** | `data/real_people.json` holds the full ADMISSIONS DATABASE export - **470 people**, git-ignored, never leaves the machine. The default selection is 116: the 91 open leads first contacted in 2026 plus the 25 most recently admitted. Verified working through People, Inbox, Admissions, Follow-ups and Reports. **Reports on real data:** 116 leads, 29 applications, 25 admitted, 21.6% conversion, 43-day median to admission, and the real programme split. |
| 85 | **The real data exposes a real problem, and the CRM shows it.** | **FINDING 24.09.2026** | **57 of the 91 active people carry no next step at all.** That is not a defect in the CRM; it is what the current spreadsheet actually contains. It is exactly the thing this product exists to prevent, and Reports puts it on the front page as a number that should be zero. Worth showing Ieva. |

| 86 | **The Console is a different address, not a hidden tab.** | **DECIDED 24.09.2026, BUILT** | The CRM is `http://127.0.0.1:8800/` and the Console is `http://127.0.0.1:8800/console`. Separate page, separate stylesheet, deliberately dark so the two can never be mistaken for one another. **The CRM carries no link and no route to it** and a test asserts both, along with the absence of demo wording. The technical screens - channel research, the event inspector, raw intake, privacy notes - are no longer routed from the product at all. |
| 87 | **Two databases, and the real one is always restorable.** | **BUILT 24.09.2026** | A clean snapshot is written **from the source file at the moment the real database is loaded**, never rebuilt afterwards from a database somebody has been testing in. Restoring wipes every table and replays it row for row, then **checksums the result and reports whether it matched**. Verified live: 116 people, switch to demo, send events, restore, `verified: true`, 116 people again. Feedback is deliberately outside the snapshot, so bug reports survive a restore. |
| 88 | **Destroying data takes a deliberate act.** | **BUILT 24.09.2026** | Switching to demo, restoring real data and emptying all return **HTTP 428** without an explicit confirmation, so a typo in a fetch cannot replace the database. The Console shows the current state in red for REAL and green for DEMO, with the people count and the snapshot age, and asks again in a dialog before acting. |
| 89 | **A calm demo environment, built the real way.** | **BUILT 24.09.2026** | 12 people, one per channel, spread across New, Contacted, Application, Contract and Admitted; 6 items waiting in the Inbox including a known person writing again and an unknown phone caller; 2 sales pitches filtered; 2 marked not relevant with a recorded reason; 1 overdue follow-up. **Every demo person arrived through the Inbox** - a test asserts there are no direct inserts - and nobody is left without a next step. |
| 90 | **A snapshot path that a test could not redirect.** | **BUG, FIXED - caught by its own test** | `SNAPSHOT_FILE` was a module constant, resolved at import. A test that set `CRM_SNAPSHOT` could not move it, so the first run of the snapshot test **wrote 25 fake people straight over the real snapshot** - precisely the accident the file exists to prevent. The path is resolved at call time now, and the test asserts it is writing somewhere harmless before it writes anything. |
| 91 | **Desktop QA.** | **DONE 24.09.2026** | All six screens measured at 1440x900: no page overflow, no main overflow, sidebar at its full 238px, desktop layout active on every one. The Follow-ups heading was saying "Follow-up list" while its tab said "Follow-ups"; they match now. |
| 92 | **A Meta message carries a name only when Meta sends one.** | **FIXED 24.09.2026** | The demo showed `@darja.s` as somebody's name. The adapter now reads `sender.name` when the payload has it and **still never invents one**, because a real Instagram DM often carries only a handle until the person says who they are. Separately, the Mailchimp fixture's own hardcoded name was overriding the person's, which put two different demo people into the CRM as "Marta Liepa". |

| 93 | **"Cannot measure" was mostly wrong. Three of the four were just missing a box.** | **CORRECTED 24.09.2026** | Ritvars asked whether nationality would not simply be collected by hand, and he was right. The report was presenting a **data-entry gap as a limit of the software**, which is a different job needing different work. Rewritten into three honest kinds: *needs typing in*, *needs a decision*, and *by definition*. Only **HE applications** genuinely needs a decision - nothing anywhere says what separates one, and no amount of typing fixes that. |
| 94 | **Nationality is a real field now.** | **BUILT 24.09.2026** | It was never unmeasurable; there was simply nowhere to type it. It is on the person record, editable on the person page and in the People quick edit, a People filter, searchable, and its own Reports breakdown. **Never derived** - not from a name, not from a phone prefix - and a test asserts it starts empty and only changes when somebody types it, with the change in the history. |
| 95 | **Maritime school graduates is a real number, not a gap.** | **CORRECTED 24.09.2026** | Education has been filled in by hand for years: **179 of 470 real records have it**, including 41 maritime. The count works today. What is thin is the coverage, so the report shows the number **and** how complete it is, instead of withholding it. `config.maritimeEducations` names which values count (Maritime school, LJA, LJK) and says Ieva confirms the list. |
| 96 | **The export sheet spoke two languages.** | **FIXED 24.09.2026** | The same school was typed as *Vidusskola* and *Secondary* over several years, and as *Jūrskola* and *Maritime school*. They are mapped on import, so a report can count them, and **the source export is never edited**. |
| 97 | **The download is a choice, not a dump.** | **BUILT 24.09.2026** | Ritvars: "the CSV has to be able to filtrate what exactly the person wants". **Export CSV** opens nine plain checkboxes - Summary, Monthly trend, Programme breakdown, Study form, Source / channel, Stage, Education, Lost reasons, People list - with the first three on. The chosen period travels with the file. A test proves what was not ticked does not appear, and that no label grows past a checkbox. My first version had eleven items with a sentence of explanation under each; Ritvars called it overengineered and he was right. |
| 98 | **A file database never gained a new column.** | **BUG, FIXED** | `CREATE TABLE IF NOT EXISTS` creates nothing for a table that already exists, so adding `nationality` left every existing `data/crm.db` on the old shape and Reports died with *no such column*. There is a small migration on open now that adds missing columns without touching the rows. Found by opening the demo database straight after adding the field. |
| 99 | **The Meta sentence left the Reports page.** | **DONE 24.09.2026** | "Facebook, Instagram, Messenger and WhatsApp share one connection but are never added together" explained our plumbing on a page about their numbers. The rule still holds and is still tested; it is simply not something Ieva needs to read. |

| 100 | **A how-to for connecting the channels.** | **WRITTEN 24.09.2026** | [CONNECTING_CHANNELS.md](CONNECTING_CHANNELS.md). Not a generic checklist: every endpoint, secret name and channel mode in it was checked against `config/channels.json`, so it cannot describe something that does not exist. Ordered by what is actually possible - the three channels needing nobody outside first, then the four long poles that are questions for people rather than code. |

| 101 | **The dialog asked about a conversation that had not happened.** | **FIXED 24.09.2026** | The note box said *"Anything worth knowing about this conversation"* while somebody was reading a message that had just arrived. Ritvars: "there hasn't been a conversation yet." It now says **"Anything you know that the message does not say"**, which is what the box is actually for at that moment, and the label admits it is optional. |
| 102 | **Four sentences still said "pipeline" after the tab was renamed.** | **FIXED 24.09.2026** | Found in the same screenshot. *"onto the pipeline at New"*, *"Nobody stays on the pipeline"*, *"how many people are in your pipeline"*, and the provisional note on the person page. All say **Admissions** now, the sidebar link points at `#/admissions`, and `viewPipeline` was renamed `viewAdmissions` so the code speaks the product's language too. The route alias stays, so an old link still works. **A test now fails if "pipeline" or "CAR" reaches the interface again**, checking the config's own on-screen text as well. |
| 103 | **And then the rename made it stutter.** | **FIXED 24.09.2026** | With the board renamed, *"goes to Admissions and into Admissions at New"* said the same word twice for two different things. The owner and the stage were two words before and are one now, so the sentence is written properly: *"this becomes an Admissions case starting at New"*, with the owner on the line below where it belongs. |

| 104 | **The explanation box in the qualify dialog is gone.** | **DECIDED 24.09.2026** | It restated the answers back at somebody who had just typed them: they pick a programme, they pick a next step, and a grey panel then tells them they picked a programme and a next step. The dialog asks its two questions plainly and the required hint already says why a next step is needed. Removed, along with the function behind it. Saving is unchanged and still verified. |
| 105 | **Two hints assumed a conversation that had not happened.** | **FIXED 24.09.2026** | Both sat in a dialog somebody opens while reading a message that has just arrived. *"Anything worth knowing about this conversation"* became **"Anything you know that the message does not say"**, and *"If you know from the conversation, say so here"* became **"If you already know, say so here."** |

### Also changed while fixing the above

- **The database is a file now.** `data/crm.db`, gitignored, override with `CRM_DB`. Tests still run
  in memory. A restart no longer empties the prototype under a tester's open tab.
- **The app page is never cached** (`cache-control: no-store`). A tester was holding a cached copy and
  would have kept reporting bugs that were already fixed.
- **Every request says who is asking.** The actor header used to be sent on writes only, so an
  admin-only screen could be refused for the wrong reason.
- **A slow request shows a thin bar** at the top of the window. A request that answers straight away
  shows nothing, so nothing flickers.
- The person page no longer prints a stray separator when somebody has no email.

### What is NOT done

- **Nothing is deployed.** No Supabase, no Vercel, no production anything. `sql/002_feedback.sql` is
  written but **NOT APPLIED**.
- **The PBX call logger is built and tested locally and is NOT connected.** No credentials are
  configured, the migration is not applied, and the cron is not enabled.
- There is still **no login**. "Acting as" is a dropdown. The admin-only screens are a workflow rule,
  not a security boundary, and they say so on screen.

## Open questions for Ritvars

**Answered since this list was written** (kept so the record shows they were closed, not dropped):

- ~~The person's own page: who sees a correction?~~ **ANSWERED 23.09.2026** - own corrections only,
  admins see all. Built, and item 17 records it.
- ~~Should a person's name ever show on screen, or only the role?~~ **ANSWERED 23.09.2026** - both,
  and they are different things. The USER is a person (Ieva). The OWNER is a role (Admissions).
  Item 16.
- ~~Is the browser extension the direction, or a fallback?~~ **ANSWERED 23.09.2026** - neither. It is
  demoted out of V1 entirely. Item 34.

**Still open:**

1. **The Warm-to-Hot threshold.** Three candidate definitions are written up in
   [INBOUND_ARCHITECTURE.md](INBOUND_ARCHITECTURE.md) section 7. None chosen, and a test fails if
   anybody invents one.
2. **The stage list**, and how raw / warm / hot relate to it. Ownership waits on this.
3. **Who qualifies when Tetiana is away?** The middle rung of the ladder currently has one person on it.
4. **Do we keep a message body until the qualification decision, then delete it?** Without it an
   extraction error is uncheckable. This is the one trade-off in the storage decision worth a second look.
5. **How many days** before an untouched raw contact is surfaced as ageing?
6. **Is a next action assigned to a role or to a person?** The "Owner: Ieva" example says person; the
   record's owner is a role. Two fields, one exists.
7. ~~**TeleGroup:** does a post-call notification exist, and what does it carry?~~ **ANSWERED
   24.09.2026 - do not ask again.** The event carries a `queue`, and the queue IS the button. It was
   in the original TeleGroup brief and has been mapped in `config/prototype.json` -> `phoneMenu`
   since 23.09.2026. Marina confirmed the 1/2/3 routing on 24.09.2026. Recorded in
   `config/prototype.json` -> `settled` as `pbxQueueIsTheButton` and `phoneButtonsConfirmed`, both
   `doNotReopen`. The phone channel waits on **one** thing: an API token from TeleGroup. The token
   itself is **not** being changed - that is settled too.
8. **LinkedIn:** is any inbound integration possible at all? Nothing is known.
9. **Retention:** how long do we keep archived intake items and extracted data?
10. **Merging** two records that turn out to be one human. Needed, not designed.
11. Should the research text on the demo screens stay as provider quotation, or be rewritten?
12. What should the CRM actually say to an applicant, and at which step? English is decided; the
    wording is still placeholder.
13. **How should Aigars and Ritvars be told that feedback has arrived, outside the app?** There is
    **no email mechanism in this project at all** - nothing can send mail and nothing is deployed.
    The in-app count works today. An external channel needs a decision and then real work:
    email would need a sending route (a transactional provider or the Gmail API) and somewhere
    deployed to send from; WhatsApp or Telegram would need an account and an integration. Until
    that is decided, feedback is only visible to somebody who opens the app.

14. **Is `v1-test` the release line, or a testing branch off `master`?** Today `master` sits
    untouched at `afea424` and all the work and all of Aigars's testing are on `v1-test`. The two
    readings lead somewhere different later: if `v1-test` is the release line, `master` is dead
    weight and should be retired; if it is a testing branch, the work has to merge back and
    `master` stays the thing that gets deployed and tagged. Nothing needs deciding to keep working,
    but "released" cannot be defined until it is. **Recommendation:** keep `master` as the release
    line and merge `v1-test` into it once Ieva has validated the workflow, because a release line
    that has never received a merge is easier to protect than one that is also the working branch.
    **Cost of waiting:** none today; it blocks only the first real release.

    **ANSWERED 25.09.2026, relayed - awaiting Ritvars's direct confirmation.** The answer came
    through another assistant session rather than from him in this one: *"v1-test is a testing
    branch; master stays the release line. When Ieva has validated the workflow, v1-test joins
    master through a pull request."* It matches the recommendation above and nothing has been done
    that depends on it. It is recorded here rather than acted on, and it is marked relayed because
    a decision in this file has to say where it came from. One word from him closes it.

## 24.09.2026 - settled decisions can no longer be reopened

| # | What | Status |
|---|---|---|
| | `config/prototype.json` -> `settled`: five decisions Ritvars made, each with the question, the answer, who decided and when, and `doNotReopen: true`. | LIVE |
| | `config/prototype.json` -> `openQuestions`: the ONLY five things genuinely unanswered. Every question list is generated from this and nothing else. | LIVE |
| | `scripts/make_desktop_guide.py` rewritten. It reads both registers, refuses to build if a settled phrase appears in the open list, and regenerates the Desktop file from config so it cannot drift. Sabotage-proved: adding a settled question exits 1. | LIVE |
| | Three tests in `test/regressions.test.js` fail if a settled item reappears as a question, blocker or checkbox in `config/channels.json` or any `docs/*.md`. Sabotage-proved: 1 failing. | LIVE |
| | Every token-rotation line removed from `config/channels.json`, `docs/BACKLOG.md`, `docs/PBX_CALL_LOGGER.md`, `docs/CONNECTING_CHANNELS.md`, `docs/CHANNEL_READINESS.md` and the Desktop file. The token is not being changed. | LIVE |
| | Instagram `externalBlocker` no longer claims the Professional-account check is outstanding. It is in Business Suite, so it is already Professional. | LIVE |
| | Phone `externalBlocker` no longer claims the menu button is unknown. The event carries `queue` and the queue is the button. | LIVE |

**Cause:** open-question lists were rebuilt from `externalBlocker` notes written before his
answers arrived, so his answers existed and the summaries did not read them. He had to repeat
the token decision three times.

**Test count: 282 passing, 0 failing.**

## 24.09.2026 - Mailchimp checked against the live account

Ritvars asked me to check it rather than ask him. Queried the Novikontas Mailchimp account
directly, read-only, using the key already on this machine in the Grand Opening hub. The key
was never copied into this project and never printed.

- Account **Novikontas**, monthly plan, 2,827 subscribers. Audience `c6ab4facba`, 2,779 members.
- The webhooks endpoint returns **200** and **zero** webhooks are configured.

So webhooks are available and nothing has to be bought or asked for. Mailchimp moved from
`waiting_for_external_access` to `ready_for_configuration`, its blocker removed, and the
question moved from `openQuestions` to `settled`. Recorded in `config/prototype.json` ->
`mailchimp`.

A blocker is now typed as `question` (somebody has to answer, and the answer may be no) or
`work` (the steps are known, nobody has done them). A `question` blocker with no owner in
`openQuestions` fails a test - that caught LinkedIn and TikTok, which are now recorded as
parked by decision rather than silently blocked.

**Remaining unknowns: 3 live, 1 parked.** A WhatsApp number, the Google Workspace administrator,
a TeleGroup API token. Parked: whether LinkedIn or TikTok allow this at all.

## 24.09.2026 - Marina closed WhatsApp and the phone buttons

- **WhatsApp number: +371 23111114**, the Higher Education number. Confirmed by Marina.
- **Phone buttons 1 / 2 / 3 confirmed** as the existing live routing.

Both are now in `settled` with `doNotReopen`. WhatsApp moved from a `question` blocker to a
`work` blocker: the number was the input we lacked, and what remains is the Meta build - a
WhatsApp Business Account, the number registered against it, the app connected, the webhook
pointed at us, business verification. None of that is a question for anybody at Novikontas.

Together with `pbxQueueIsTheButton`, the phone routing is closed entirely. The PBX API already
exposes the queue and the queue IS the button. The phone channel now waits on one thing only:
an API token from TeleGroup.

**Remaining unknowns: 3 live, 1 parked.** The Google Workspace administrator, a TeleGroup API
token, and the spam word list from Tetiana. Parked: whether LinkedIn or TikTok allow this at all.

## 24.09.2026 - the guide is now Ritvars's connection task list

He gave the list he actually wants to work from: a settled/done block at the top, then
fourteen channels in HIS order with per-channel steps. Both the order and the steps now live
in `config/channels.json` as `connectOrder` and `connectSteps`, and the Desktop guide renders
them, so his list and the generated document cannot drift apart.

Order: WhatsApp, Facebook, Instagram, Messenger, Gmail, Website, Google Form, Open Day, Agent,
Phone, Mailchimp, LinkedIn, TikTok, In person.

Each channel now states which of three it is, rather than a flat "blocked":

- **Ready to configure** - nobody outside needed
- **Waiting on an answer** - a `question` blocker, and it must have an owner in `openQuestions`
- **Nobody to ask, this is work** - the steps are known and nobody has done them

WhatsApp's `operationalNote` claimed its place in the shared Meta Business Suite was NOT
VERIFIED. Ritvars settled that, so the note and the test that guarded it were both corrected.
The rule did not change - the note must say which it is and never leave it hanging - only the
answer did.

**One human unknown remains: the Google Workspace administrator.** Everything else is either
known, technically actionable, or waiting on a provider.

## 24.09.2026 - four faults that only a real provider shape would have found

Every one of these passed 282 tests. All four were proved against the running
server BEFORE being fixed, and each fix was then proved by breaking it again.

| # | What | Consequence |
|---|---|---|
| 1 | No GET handshake route. `GET /api/inbound/facebook?hub.challenge=...` answered **404**. | Meta could never have been connected. It never gets as far as a message: it will not save a subscription whose challenge is not echoed back. |
| 2 | Every body went through `JSON.parse`. Mailchimp only ever posts `application/x-www-form-urlencoded`. | A real Mailchimp webhook answered **400 "the payload is not readable JSON"**. |
| 3 | The website adapter read consent as `raw.consent_admissions === true`. An HTML checkbox arrives as the STRING `"true"`. | A real form with **both consent boxes ticked recorded consent as NOT GIVEN**. Consent is a legal record. |
| 4 | `config/channels.json` declared `/api/cron/gmail-poll` and nothing implemented it. | The register read as ready for a route that did not exist. |

What they share: all four passed when driven by JSON fixtures we wrote
ourselves, and none survived the shape a provider actually sends.

**Built**

- `handshake()` in `src/inbound.js` - Meta's verify token compared in constant
  time and the exact challenge echoed as plain text; Mailchimp's URL check
  answered. Wrong token 403, missing token 503, and the real token is never
  echoed back in an error.
- `parseInboundBody()` - form-encoded (including Mailchimp's `data[email]`
  bracket notation and repeated keys), JSON, an undeclared content type, and the
  Gmail Pub/Sub envelope unwrapped from base64.
- `truthy()` in `src/adapters.js` - a ticked box in any of true/on/yes/1/Jā;
  anything not clearly yes, including an absent box, is NOT consent.
- `channel_handshake` table, so `webhookVerified` reports a handshake that
  really happened instead of a hardcoded `false`.
- `lib/gmail.js` and `api/cron/gmail-poll.js` - the whole Gmail path that does
  not need the administrator: the JWT assertion with `sub=edu@novikontas.org`,
  read-only scope, the poll window, header and multipart flattening, watch
  expiry, and `unauthorized_client` reported as *the administrator has not
  allowed this* rather than as 401. It refuses before making a request when
  there are no credentials, so a call that was never made is never reported as
  "nothing to do".
- `META_VERIFY_TOKEN` added to `.env.example` and to the register.

**One regression I caused and caught:** the handshake pattern `[a-z_]+` also
matched `GET /api/inbound/events`, and the observability view went blank. Three
existing tests failed, which is what they are for.

**Tests: 326 passing** (282 + 26 connection + 18 gmail). One of the new tests
walks every `pollPath` in the register and fails if the file does not exist, so
fault 4 cannot recur.

Nothing is enabled. Every channel is still off, no secret is set, and no
provider has been contacted.

## 25.09.2026 - a shared testing copy, so Aigars and Ieva can actually use it

Ritvars needs Aigars testing and Ieva reviewing the workflow, on a real address,
today. Two things stood between that and a public URL, and neither was optional.

**1. There is no sign-in.** `src/server.js` reads an `x-acting-as` header and
believes it. Searching that file for password, session, oauth, jwt or bcrypt
returns **zero** hits. Anybody with the address is anybody they type, including
Marina, who can read the whole history log.

**2. The database is a file.** 14 tables in SQLite. Vercel has no disk that
survives, so on Vercel the data would vanish between clicks.

**What was built instead of solving both today.** `src/gate.js`: one shared
password in front of the whole copy, and it is deliberately NOT called
authentication. Inside, identity is still a dropdown.

- The server **refuses to start** if `CRM_PUBLIC` is on and `CRM_ACCESS_PASSWORD`
  is missing or under 12 characters. A copy on the internet with no door is
  worse than no copy, and a warning in a log nobody reads is not a door.
- The server **refuses to start** with `DATASET=real` on a shared copy, and
  `loadDataset('real')` throws there too. **This is the control that makes the
  address safe to hand out**, not the password: the copy holds demo data only.
- The ticket is signed with a key derived from the password, so the password
  never reaches the browser and changing it invalidates every ticket. Expiry is
  checked after the signature, so an old ticket and a forged one look identical.
- A provider webhook stays reachable, because a signature is stronger than a
  password a human types.

**A leak my own test caught before it shipped.** Allowing `/api/inbound/*` by
prefix also published `/api/inbound/events` - the observability view, with sender
names and message bodies in it. Now only a path matching a real channel in the
register is open. Same trap as the Meta handshake route, which matched the same
path for the same reason. Prefix matching on a route namespace has now caused
two faults; match the whole path against the register.

`render.yaml` deploys `v1-test` to Render on the starter plan with a 1 GB disk,
health check at `/healthz`, and the password marked `sync: false` so it is set in
the dashboard and never written down in the repository.

**Not Vercel, and not yet Supabase.** Supabase is the database, not where code
runs, so "deploy to Supabase" is not a thing that can be done. Moving to
Vercel plus Supabase means porting ~113 SQL statements to Postgres and building
sign-in from nothing - `docs/PRODUCTION_MIGRATION.md`, written 23.09. Whose
Supabase account it eventually is matters for **who owns the applicant data**,
not for how code is committed.

**343 tests pass.** Verified end to end in a browser: the door appears, the
password opens the CRM, and the demo data is there.

