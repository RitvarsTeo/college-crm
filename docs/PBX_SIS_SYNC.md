# Phone calls and SIS applicants into the CRM

Built 28.09.2026 on branch `channels-pbx-sis` (4f14180). **Merged into v1-test and deployed on
29.09.2026** (the SIS feed wired to the lifecycle facts, docs/LIFECYCLE.md). **Neither real API has
been called yet**, and both channels are `off`. Tested on SQLite with fake providers
(`test/sync.test.js`, 24 tests).

Decided by Ritvars, 28.09.2026: build for Supabase (the CRM database moves there), Vercel moves to
Pro so both jobs run every five minutes, and the SIS rule below.

## What runs

Two routes, both guarded by `Authorization: Bearer $CRON_SECRET` (without it set they answer 500 and do nothing).
**The schedule is not configured yet**: Vercel Hobby refuses a deployment whose cron runs more than once
a day, so `*/5 * * * *` waits for Vercel Pro (or any scheduler that calls the route with the secret):

| Route | Does |
|---|---|
| `/api/cron/pbx-calls` | Last 15 minutes of PBX calls, three queues, incoming only. Each new call is stored in `pbx_calls`. The caller's number matches ONE person -> a `call` entry on their timeline (answered calls also set last contact). Unknown number, or two people share it -> Inbox item on channel `phone`. Withheld number -> stored only. |
| `/api/cron/sis-sync` | SIS records changed since the last run (`since` + every `nextCursor` page). Stored in `sis_applicants`, one row per application. Email or phone matches ONE person -> linked, and their stage moves forward. Anybody else -> one Inbox item on channel `sis`; once somebody confirms it, the next run links and moves them. |

SIS status -> CRM stage, forwards only, never reopening `Not proceeding`:
registered, started, submitted -> Application; admitted, matriculated -> Admitted.
**rejected and withdrawn do not move the stage**: they are written on the timeline, because closing
a person needs a reason from a human. The furthest application wins when there are several.

Both jobs do nothing while their channel mode is `off`, which is the default. `test` runs them but
marks Inbox items `simulated`; `live` marks them `provider`.

## Where the data lives

The CRM's own schema (`CRM_PG_SCHEMA`, `crm`), created by `src/db.js` with RLS on and no policy, so
the Supabase REST roles see nothing. The jobs connect with the same `pg` connection as the app;
there is no Supabase service key anywhere. On Supabase use the **direct or session-pooler** address
(port 5432): the transaction pooler (6543) drops the `search_path` every connection sets.

## To go live (in this order)

1. Ritvars puts `SIS_API_TOKEN` and `CRON_SECRET` (and `PBX_API_TOKEN` for the phone) into the Vercel
   settings himself. Never in chat, a file or the repo. Today (29.09) none of them is set.
2. The first look at a real reply, read-only, nothing written:
   `vercel env run -e production -- node scripts/sis_first_look.mjs` - field names, fill counts and
   status counts only. Confirm or change the mapping in src/lifecycle.js.
3. `CHANNEL_MODE_SIS=test`, call `/api/cron/sis-sync` once with `Authorization: Bearer $CRON_SECRET`,
   check `sis_applicants`, the Inbox and the lifecycle facts; then `live`.
4. The schedule: Vercel Pro and `"crons": [{ "path": "/api/cron/sis-sync", "schedule": "*/5 * * * *" }]`
   in vercel.json (the phone the same). The database does not have to move first: the routes run on
   today's Neon database with `CRM_PG_SCHEMA=crm`, and move with it to Supabase later.

## Open

- Retention for `pbx_calls` and `sis_applicants` is not decided; nothing purges them.
- The tables (`pbx_calls`, `sis_applicants`, `sync_state`) are created on production by the boot
  schema like every other; the sync SQL itself has not run against Postgres until step 3.
- `config/channels.json` still describes the old phone destination and has no SIS entry; that file
  carries another session's uncommitted edits, so it is updated after they land.
