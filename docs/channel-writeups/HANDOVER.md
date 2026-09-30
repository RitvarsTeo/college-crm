# Handover from Session C (channel write-ups), 30.09.2026

Session C writes documents only (plus, on Ritvars' yes 30.09: phone set to live, Mailchimp set up in test mode). Nothing below was fixed; each item goes to the session that owns
the file. Checked against production commit `e52e1b4`.

## Status 30.09 evening

C1-C7 BUILT by Session B on `feat/channel-gaps-2026-09-30` (bfdeb31, 4f40f78, 8e5717d, f927437,
57222df, 0800af3, 095ae31), NOT deployed. C8, C9, C10 and training@ as a second mailbox: asked of
Session B 30.09, not built. Production = `release/patches-2026-09-30` 4d174c7, none of the above.

## Code items found while writing (for Session B: server.js, adapters.js, sync.js)

| # | What | Where | Why it matters |
|---|---|---|---|
| C1 | **DECIDED 30.09 by Ritvars (popup B):** the Facebook Page registers ONE address, `/api/inbound/facebook`; inside it, `messaging[]` events must be recorded as channel `messenger`, `changes[].field = leadgen` as `facebook`. Today both are recorded as `facebook`. | `src/adapters.js` `metaAll()`, route in `src/server.js` | Meta has one callback per object (Page), so `/api/inbound/messenger` would never receive anything |
| C2 | A Meta lead form webhook carries ids only (`leadgen_id`, `form_id`, `ad_id`, `created_time`). The adapter reads `full_name`, `email`, `phone_number` from it, which Meta does not send; the fetch `GET /{leadgen_id}` with a page token is not built | `src/adapters.js` `metaLead()` | every real Meta lead would arrive with no name, email or phone. Verify against Meta's docs before building |
| C3 | `/api/cron/gmail-poll` is not in `vercel.json` `crons`, so nothing ever calls it | `vercel.json` | Gmail stays silent even after Marina grants access |
| C4 | Open Day: attendance sent later for the same `booking_ref` is dropped as a duplicate | `open_day` adapter + dedup | "did they come" can never arrive |
| C5 | Gmail option B (OAuth on the one mailbox, backlog row 130) needs code; only service-account delegation exists | `lib/gmail.js` | only matters if Ritvars and Marina pick B |
| C6 | Google Form: no Apps Script exists anywhere, though older documents say "documented" | none | the form owner has nothing to paste |
| C7 | TikTok `content` and the LinkedIn Lead Sync answers are not read | adapters | every channel is MVP (Ritvars 30.09), so both are needed |
| C8 | The website is Tilda. The `website` adapter needs `submission_id` and the `x-crm-secret` header; Tilda's webhook sends its own field names (id probably `tranid`) and may not set custom headers | `website` adapter, `shared_secret_header` | a real Tilda submission would be refused. Wait for Oksana's two answers (03-website-form-oksana.md) |
| C9 | Mailchimp `upemail` events carry `data[new_email]`, not `data[email]`, so the adapter would refuse them; the webhook has "email changed" switched off until this is read | `mailchimp` adapter | email changes in Mailchimp do not reach the CRM |
| C10 | `config/channels.json` still says Tetiana owns and administers Meta (`ownerPerson`, `administeredBy`); Ritvars 30.09: Oksana owns Meta Business Suite. Open Day `ownerPerson` Aigars, parked by Ritvars 30.09 | config | the Channels screen names the wrong person |

## The three existing documents: what is now false

All three are uncommitted in `crm-prototype/docs/` and were left untouched.

**CHANNEL_READINESS.md** (generated, so fix `config/channels.json` and rerun `scripts/gen_readiness.py`):
- Line 6 "Nothing in this repository is connected to anything... nothing is deployed": false. Live at
  `e52e1b4`; phone and SIS run daily in test mode.
- Rows for Email and Phone (lines 25, 32, 72, 175, 205, 429, 438, 459): "NOTHING hands the messages
  to receive()", "calls stop at pbx_incoming_calls", "no scheduler": all fixed since. Phone writes to
  the CRM's own database (78108be, 7ded9c2); Gmail writes to New Leads (e52e1b4) but has no cron (C3).
- LinkedIn and TikTok (lines 54-55, 75-76) say "manual, capability unconfirmed", while
  `config/channels.json` has had webhooks for both since 27.09. The file was not regenerated.
- SIS is missing entirely.

**INBOUND_ARCHITECTURE.md**
- Line 4 "Nothing here is built. Nothing is connected.": false, as above.
- The RAW / WARM / HOT ladder (sections 5 to 8, lines 232-481, 582-602) was dropped; what shipped is
  "Not clear yet" and "Lead". The note at line 9 says so, but the sections still read as the design.
- Lines 89 and 135 "not enforced by the database": the unique index is in the live code (5f921eb);
  whether it has been applied to the production database was not checked here.
- Lines 102-104, 138-146 (Gmail stops at the reply, phone stops at its own table, no scheduler):
  fixed, as above.
- Line 543 "LinkedIn: no research has been done": false since 27.09.

**PROVIDER_QUESTIONS.md**
- Opening "Nothing in this file is an answer": most TeleGroup, Mailchimp, Meta access and WhatsApp
  number questions are answered (see the write-ups' section 5).
- "LinkedIn - nothing is known" and "TikTok - nothing is known" (lines 170-205): both researched 27.09.
- Lines 220-222 (Warm-to-Hot threshold, raw contact ageing): the ladder was dropped.
- TeleGroup section: the four questions still open are now in `05-phone-telegroup.md`.
