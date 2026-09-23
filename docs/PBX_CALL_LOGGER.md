# PBX incoming-call logger

Built 23.09.2026. **Not deployed, not connected, no live call has been fetched.**

Collects incoming calls to the three college phone queues and stores them. That is the whole job.
It builds no UI, sends no notification, matches no person, creates no lead and downloads no
recording. Something later reads the table.

## What runs

```
Vercel Cron  */5 * * * *
  -> GET /api/cron/pbx-calls      (refuses anything without Authorization: Bearer $CRON_SECRET)
  -> asks the PBX for the last 15 MINUTES, in Riga wall clock
  -> keeps destination === "incoming" AND one of the three queues
  -> maps seven fields
  -> upserts on uniqueid into public.pbx_incoming_calls
```

**The 15-minute window on a 5-minute schedule is deliberate.** A late or skipped run leaves no gap,
and the overlap is absorbed by `uniqueid`.

## Files

| File | What it is |
|---|---|
| `lib/riga.js` | Europe/Riga, explicitly. No offset is written down anywhere in it. |
| `lib/pbx.js` | Filter, map, fetch, upsert, cron gate, redaction. All of it testable without a network. |
| `api/cron/pbx-calls.js` | The Vercel route. Auth, then one poll, then a redacted log line. |
| `sql/001_pbx_incoming_calls.sql` | The table. **NOT YET APPLIED.** |
| `vercel.json` | The cron, and the same security headers the other hubs use. |
| `.env.example` | The four variables, named and empty. |
| `test/pbx.test.js` | 35 tests, no network, no real token needed. |

## Time, which is the part that goes wrong quietly

The PBX speaks Riga wall-clock in **both** directions: the window we ask for, and every `created_at`
it returns. The database stores absolute instants. So:

- The window is built by subtracting 15 real minutes from an instant, then formatting **each end**
  in `Europe/Riga`. A clock change can therefore never make the window longer or shorter than the
  15 minutes asked for.
- A `created_at` is converted from Riga wall clock to an instant **before** it is written, so a call
  at 03:30 on a clocks-change Sunday lands where it really was.
- **No offset is hardcoded.** `+02:00` and `+03:00` appear nowhere in the code, and a test fails if
  they ever do. The offset is asked of the IANA zone database through `Intl`, for the specific
  instant in question.
- No dependency was added. `Intl` with a `timeZone` **is** the timezone-aware implementation and it
  is already in the runtime.

**One ambiguity, stated rather than hidden.** When the clocks go back, 03:30 happens twice and the
PBX stamp cannot say which. The code takes the **first** occurrence, says so in a comment, and a
test pins it. When the clocks go forward that wall clock never happened; the code returns the moment
the clock first read it rather than inventing one.

## The token

- Read only from `process.env.PBX_API_TOKEN`.
- It goes in the **query string**, because that is the only authentication this API accepts. Headers
  are refused by the provider.
- It is never returned, logged, thrown or put in an error. `redact()` strips it by value **and**
  strips any `token=` from any URL, so an upstream error that quotes the URL back cannot leak it.
- The poller hands back a `safeUrl` which is the only version anything is allowed to print.
- A missing token fails with `Missing required environment variable PBX_API_TOKEN` and nothing else.

**The token used during discovery was exposed in a chat and must be rotated before go-live.**

## Environment variables still to configure

None are set. All four are needed before anything runs.

| Variable | Notes |
|---|---|
| `PBX_API_TOKEN` | A **fresh** token from whoever manages the tg.lv PBX. Not the discovery one. |
| `SUPABASE_URL` | The College CRM Supabase project. |
| `SUPABASE_SERVICE_KEY` | The org convention, used by the other hubs. `SUPABASE_SERVICE_ROLE_KEY` is accepted as an alias so the brief's name also works. Server-side only. |
| `CRON_SECRET` | Guards the public route. Vercel sends it automatically on a scheduled run. |

## Before it is switched on

1. **Apply `sql/001_pbx_incoming_calls.sql`** and update its NOT YET APPLIED header.
2. **Confirm the Vercel plan is Pro.** A 5-minute cron is a Pro feature; Hobby caps crons at once a
   day, so on Hobby this silently becomes a daily job and the 15-minute window then loses almost
   everything. This has not been checked.
3. Set the four variables as Vercel environment variables.
4. Smoke test once by hand, confirm rows appear and a second run adds none.
5. Run the security audit.
6. **Decide retention.** The table holds caller numbers. There is no purge job because nobody has
   said how long a call record may be kept, and inventing 90 days would be inventing a policy.

## Security posture

- RLS is on and the migration creates **no** policy, so no role subject to RLS can read the table.
  The cron writes as the service role, which bypasses RLS. A dashboard gets its own policy, written
  when somebody decides which seats may see caller numbers.
- `anon` and `authenticated` are explicitly revoked as well.
- The route is public, so it is guarded by a shared secret compared in constant time. A missing
  `CRON_SECRET` closes the route rather than opening it.
