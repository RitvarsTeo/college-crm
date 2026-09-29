# Lifecycle facts: "Application form started" and "Matriculated"

Aigars, 29.09.2026: the CRM's goal is matriculation, and it has to show two facts about a person:
the application form was started, and they matriculated. **These are facts, not Journey stages.**
They are dated, they come from the SIS, and they never move anybody on the Journey.

## Where things are

| Piece | Where | State |
|---|---|---|
| The facts, the mapping, recording, reading | `src/lifecycle.js` | LIVE (v1-test) |
| The table | `lifecycle_events` in `src/db.js` (created only if missing; RLS on like every CRM table) | LIVE, empty |
| On screen | person page (above the next step), the Journey card (under the name), the Journey side card, Outcomes (Matriculated) | LIVE, shows nothing until the SIS says something |
| Fetching the SIS: Bearer token, `since` + `cursor` paging, 404/429, upsert by `reference`, matching | `lib/sis.js`, `src/sync.js`, `api/cron/sis-sync.js` (from the channels branch, 4f14180, merged 29.09) | DEPLOYED; `off`; never run against the real SIS (no token in Vercel yet) |
| The connection | `src/sync.js` `applyToPerson` calls `recordSisLifecycle()` for every SIS row linked to a person | DEPLOYED, tested (test/sync.test.js) |

## The mapping - PROVISIONAL

The SIS document (`Novikontas-CRM-API.md`, 28.09.2026) gives `status` = registered, started,
submitted, admitted, rejected, withdrawn, matriculated, and the times `registeredAt`, `submittedAt`,
`changedAt`. There is no `startedAt` and no `matriculatedAt`. So, until one real SIS reply is seen:

| Fact | Written when | Dated |
|---|---|---|
| Application form started | a row's `status` is `started` | that row's `changedAt` |
| Matriculated | a row's `status` is `matriculated` | that row's `changedAt` |

- A row first seen as `submitted` does not write "form started": the form was surely started, but
  the SIS does not say when, and a made-up date is worse than none.
- A row with no `changedAt` writes nothing.
- One fact per person, fact and SIS application (`reference:applicationId`): the same record seen on
  every later run writes nothing new, and the first date stands.

**To change the mapping** after a real payload is seen: edit `SIS_LIFECYCLE_MAP` in
`src/lifecycle.js` and its test in `test/lifecycle.test.js`. Nothing else.

## The connection (src/sync.js, done 29.09.2026)

In `applyToPerson`, which runs for every SIS person linked to a CRM person on every run:

```js
import { recordSisLifecycle } from './lifecycle.js';
await recordSisLifecycle(db, personId, row);   // row = the stored sis_applicants row
```

It never reads the token and never calls the SIS; it only turns a stored row into facts.

## The first real SIS reply (29.09.2026, read through GET /api/admin/sis/first-look by Ritvars)

Shape only - no person was seen. **6 applicants, one page.** Every documented field is there and
nothing else: reference 6/6, applicationId 2/6, givenName 6/6, familyName 6/6, email 6/6, phone 4/6,
programmeCode 2/6, programmeName 2/6, status 6/6, registeredAt 6/6, submittedAt 2/6, changedAt 6/6.
Status: **registered 4, submitted 1, matriculated 1**; no unknown status; **no field dates "started"
or "matriculated"** (no startedAt, no matriculatedAt).

What it means for the mapping:
- **Matriculated: CONFIRMED as a status** (1 real record). Its date stays `changedAt` - the SIS has no
  other date for it.
- **Application form started:** DECIDED by Ritvars 29.09.2026 ("Yes, by submit date"): `started`
  dated by changedAt, or an application past it dated by its submittedAt. `started` itself is still
  unseen in a real reply. Every SIS date is shown as "by <date>".
- **Where they are now** (Ritvars 29.09.2026, for nudging after submission): the person page says
  "In the SIS: <status> by <date> - next: <next SIS status>", with "(Student Coordinator)" after
  Submitted; the Journey card "SIS: <status>". `sisProgress()` in src/lifecycle.js.
- Registered-only people (4) have no application (applicationId empty) and correctly get no fact.

## What is still needed before real facts appear

1. ~~`SIS_API_TOKEN` and `CRON_SECRET` in Vercel~~ DONE 29.09 (Ritvars).
2. ~~One real reply looked at~~ DONE 29.09 (above); the "form started" rule for applications already past `started` is Ritvars' call.
3. ~~`CHANNEL_MODE_SIS=test`, one run by hand~~ DONE 29.09 14:30: 6 stored, 0 linked (none of them is a CRM person), 6 to the Inbox as simulated, 0 facts. Then `live` (Ritvars).
4. The schedule (every 5 minutes): Vercel Pro, or another scheduler calling the route with the secret.
   Until then a run happens only when the route is called.
- Known limit of the provisional mapping: a record that goes from `started` to `submitted` between
  two runs is only ever seen as `submitted`, so its "form started" is not written. The first real
  reply shows whether the SIS keeps a started date that would close this.
