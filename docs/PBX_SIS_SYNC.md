# Phone calls and SIS applicants into the CRM

Built 28.09.2026 on branch `channels-pbx-sis`. **Not deployed. Neither real API has been called.**
Tested on SQLite with fake providers (`test/sync.test.js`, 20 tests; full suite 590/590).

Decided by Ritvars, 28.09.2026: build for Supabase (the CRM database moves there), Vercel moves to
Pro so both jobs run every five minutes, and the SIS rule below.

## What runs

Vercel Cron, `*/5 * * * *`, both routes guarded by `Authorization: Bearer $CRON_SECRET`:

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

1. Vercel project on Pro. **This branch fails to deploy on Hobby** because of the two crons.
2. CRM database on Supabase, `DATABASE_URL` pointing at it, the Neon variables removed
   (`pgUrl()` prefers `CRM_DB_DATABASE_URL_UNPOOLED` while it exists), `CRM_PG_SCHEMA=crm`.
3. Ritvars puts `PBX_API_TOKEN` and `SIS_API_TOKEN` into the Vercel settings himself, plus
   `CRON_SECRET`. Never in chat, a file or the repo.
4. `CHANNEL_MODE_PHONE=test` and `CHANNEL_MODE_SIS=test`, trigger each route once by hand, check the
   rows and the Inbox, then `live`.

## Open

- Retention for `pbx_calls` and `sis_applicants` is not decided; nothing purges them.
- Not yet run against Postgres; the SQL translation was checked by eye. First run belongs on the
  Supabase database.
- `config/channels.json` still describes the old phone destination and has no SIS entry; that file
  carries another session's uncommitted edits, so it is updated after they land.
