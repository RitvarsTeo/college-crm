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
| Fetching the SIS: Bearer token, `since` + `cursor` paging, 404/429, 5-minute run, upsert by `reference` | `lib/sis.js`, `src/sync.js`, `api/cron/sis-sync.js` on branch **channels-pbx-sis** (the channels session, commit 4f14180) | BUILT, not merged, never run against the real SIS |

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

## The one line the SIS sync adds (channels-pbx-sis, src/sync.js)

Wherever a SIS row is linked to a CRM person (`applyToPerson`, and a stored row that already has a
`person_id`):

```js
import { recordSisLifecycle } from './lifecycle.js';
await recordSisLifecycle(db, personId, row);   // row = the stored sis_applicants row
```

It never reads the token and never calls the SIS; it only turns a stored row into facts.

## What is still needed before real facts appear

1. The channels branch merged into v1-test (the channels session, when its work is ready), with the
   line above.
2. The 5-minute run: Vercel Pro (Hobby runs a cron once a day), then `CHANNEL_MODE_SIS`.
3. `SIS_API_TOKEN` in Vercel (Ritvars; never in a file, a URL or a log).
4. One real reply looked at, to confirm or change the mapping above.
