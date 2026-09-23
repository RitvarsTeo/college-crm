# College CRM - backlog

Nothing is deleted here. A line changes status, it does not disappear.

**Statuses:** `SAID` - somebody said it, nothing checked · `DECIDED` - the owner decided it ·
`BUILT` - it exists in the prototype · `LIVE` - verified running in production (nothing is LIVE:
this is a local prototype) · `UNKNOWN` - named but not checked with the provider.

**PIN: COLLEGE CRM V1 - VALIDATE THE WORKFLOW WITH IEVA.** This is a prototype for testing the
real Admissions workflow on screen. It is not the product.

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
| 36 | **PBX incoming-call logger.** | **BUILT 23.09.2026, NOT DEPLOYED, NOTHING CONNECTED** | Vercel Cron every 5 min asks the tg.lv PBX for the last 15 min, keeps incoming calls on the three college queues, upserts on `uniqueid`. Europe/Riga handled explicitly with no hardcoded offset and both DST transitions tested. The token lives only in `process.env.PBX_API_TOKEN`, is never logged, and **must be rotated** before go-live. `sql/001` is written and NOT applied. See [PBX_CALL_LOGGER.md](PBX_CALL_LOGGER.md). |
| 37 | **Vercel plan for the 5-minute cron.** | **UNCHECKED, blocking** | A 5-minute cron needs Pro. On Hobby it silently becomes daily and a 15-minute window would then miss almost every call. Nobody has confirmed which plan the College CRM project is on. |
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
7. **TeleGroup:** does a post-call notification exist, and what does it carry? Until then the phone
   is manual.
8. **LinkedIn:** is any inbound integration possible at all? Nothing is known.
9. **Retention:** how long do we keep archived intake items and extracted data?
10. **Merging** two records that turn out to be one human. Needed, not designed.
11. Should the research text on the demo screens stay as provider quotation, or be rewritten?
12. What should the CRM actually say to an applicant, and at which step? English is decided; the
    wording is still placeholder.
