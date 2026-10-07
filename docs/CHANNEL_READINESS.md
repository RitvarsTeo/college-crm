# Channel readiness

**Generated from `config/channels.json` by `scripts/gen_readiness.py`. Do not hand-edit:**
change the config and regenerate, or the register and this document drift apart.

Nothing in this repository is connected to anything. No channel has credentials, no webhook has
been registered with any provider, and nothing is deployed. What exists is the adapter, the
contract, the security interface and the tests. Switching a channel on later should be:

1. configure credentials,
2. configure the webhook or endpoint at the provider,
3. verify,
4. switch the channel from test to live.

It should not require redesigning the CRM. That is the whole purpose of this file.

## Where every channel stands

| Channel | Readiness | How it arrives | Blocked on |
|---|---|---|---|
| **Website form** | READY FOR CONFIGURATION | inbound webhook | nothing - our side is finished |
| **Google Form** | WAITING FOR EXTERNAL ACCESS | inbound webhook | Nobody has named who created the form. Only its owner can paste the Apps Script onto the response sheet and approve the permission box. |
| **Email** | WAITING FOR EXTERNAL ACCESS | inbound poll | Twenty minutes of Marina's time. She is the Google Workspace administrator and only she can grant the service account domain-wide delegation. Everything on our side is built. |
| **Facebook** | WAITING FOR EXTERNAL ACCESS | inbound webhook | A Meta app, page access from the business portfolio, and APP REVIEW for messaging permissions. Review takes weeks and can be refused. |
| **Messenger** | WAITING FOR EXTERNAL ACCESS | inbound webhook | A Meta app, page access from the business portfolio, and APP REVIEW for messaging permissions. Review takes weeks and can be refused. |
| **Instagram** | WAITING FOR EXTERNAL ACCESS | inbound webhook | APP REVIEW for messaging permissions. The account is already Professional - it is in Meta Business Suite - so that part is settled and is not a blocker. |
| **WhatsApp** | WAITING FOR EXTERNAL ACCESS | inbound webhook | The Meta build: a WhatsApp Business Account, +371 23111114 registered against it, the app connected and business verification. The NUMBER is settled - Marina confirmed it on 24.09.2026 - so this is work, not a question. |
| **Mailchimp** | READY FOR CONFIGURATION | inbound webhook | nothing - our side is finished |
| **Open Day** | READY FOR CONFIGURATION | inbound webhook | nothing - our side is finished |
| **Phone** | WAITING FOR EXTERNAL ACCESS | inbound poll | Nothing from TeleGroup. Ritvars holds the API token; it goes into PBX_API_TOKEN on the host, then the channel needs the three deployment prerequisites. |
| **Agent or partner** | WAITING FOR EXTERNAL ACCESS | inbound webhook | Nobody has named which agent we start with, or who at their end would set up the link. |
| **In person** | MANUAL ONLY, BY DESIGN | manual | nothing - our side is finished |
| **LinkedIn** | CAPABILITY UNCONFIRMED | manual | EXTERNAL CONFIRMATION REQUIRED: whether LinkedIn offers any inbound messaging integration for a page like ours at all. Nothing has been confirmed. Do not promise it. |
| **TikTok** | CAPABILITY UNCONFIRMED | manual | EXTERNAL CONFIRMATION REQUIRED: whether TikTok offers any inbound messaging integration. Nothing has been confirmed. Do not invent one. |

## How each channel stays reliable

Added 27.09.2026 after an outside architecture review. Getting an event once is not enough; each channel has to answer: did we get it, did we get it twice, did we process it, what if processing failed, what if the provider retries, what if the CRM was down, can we reconstruct what happened. 'reliability' says what protects the channel TODAY, read from the code. 'reconciliation' says how something missed would be found again, and says 'none built' where that is the truth. Three gaps are shared by every channel and are not repeated per row: (1) the dedupe is not database-enforced (see _idempotency); (2) the log of refused and failed deliveries is an in-memory list of 500 in src/server.js, lost on every restart and, on Vercel, different on every instance - so a refused or failed delivery leaves NO durable trace; (3) a delivery that fails inside the CRM answers 500, which makes a retrying provider try again, but nothing records that it failed.

| Channel | CRM source | How it arrives | What protects it today | How a missed event is found again |
|---|---|---|---|---|
| **Website form** | `website` | inbound webhook | Shared-secret header, compared in constant time. A submission without a submission_id is refused. A repeat submission_id is dropped. | None built. Depends on whether the website keeps its own copy of submissions - UNKNOWN. |
| **Google Form** | `google_form` | inbound webhook | Shared-secret header from the Apps Script. A repeat responseId is dropped. | Possible and not built: the Form keeps every response, so they can be re-read and compared. |
| **Email** | `gmail` | inbound poll | Read-only scope (gmail.readonly), one mailbox. A repeat Gmail message id would be dropped. | The poll IS the re-read, but it looks back a fixed 15 minutes and takes at most 25 messages, so a missed run or a busy window loses mail. A history-id cursor would close that. Not built. |
| **Facebook** | `facebook` | inbound webhook | Meta's X-Hub-Signature-256 over the raw body with the app secret. A repeat provider event id is dropped. | None built. The Graph API can list conversations, so a backfill is possible later. |
| **Messenger** | `messenger` | inbound webhook | As Facebook: the same Meta signature and the same connection. A repeat event id is dropped. | None built. As Facebook. |
| **Instagram** | `instagram` | inbound webhook | As Facebook: the same Meta signature. A repeat event id is dropped. | None built. As Facebook. |
| **WhatsApp** | `whatsapp` | inbound webhook | As Facebook: the same Meta signature. A repeat WhatsApp message id is dropped. | None built. |
| **Mailchimp** | `mailchimp` | inbound webhook | Secret in the webhook URL. A repeat of type + email + fired_at is dropped. | Not built. The review recommends exactly our intended shape: the webhook is the event stream, the API is the correction tool - re-read the audience and compare. |
| **Open Day** | `open_day` | inbound webhook | Shared-secret header. A repeat booking reference is dropped. | None built. Whether the booking tool has an API to re-read from is UNKNOWN (PROVIDER_QUESTIONS.md). |
| **Phone** | `phone` | inbound poll | Poll every 5 minutes for the last 15, so two missed runs lose nothing; upsert on uniqueid absorbs the overlap. | The overlap window is the reconciliation. |
| **Agent or partner** | `agent` | inbound webhook | A token per partner, checked server-side. A repeat partner id + partner reference is dropped. | None built. |
| **In person** | `in_person` | manual | Typed by staff. The server refuses the save (409) when the email, phone or name matches somebody, unless staff confirm it is a different person. | Not applicable - the person is standing there. |
| **LinkedIn** | `linkedin` | manual | Not applicable until the capability is known. | Not applicable. |
| **TikTok** | `tiktok` | manual | Not applicable until the capability is known. | Not applicable. |

**On duplicates:** Every adapter declares an externalId, and receive() in src/intake.js looks for an inbound row with the same channel and external_id before inserting, so the same provider event delivered twice is stored once. Providers retry; that is normal and must never make two people. CORRECTED 27.09.2026: this used to say a unique index enforces it. NO SUCH INDEX EXISTS - it is a look-then-insert check in application code. That is sound on SQLite, where one process runs one request at a time, and NOT sound on PostgreSQL behind Vercel, where two retries of one event can run at once, both look, both find nothing and both insert. The fix - a partial unique index on (channel, external_id) plus an insert that tolerates the conflict - is part of the PostgreSQL move. See docs/BACKLOG.md, 27.09.2026.

## What Novikontas has to do, by channel

These are the actions nobody in this repository can perform.

- **Website form** - Whoever maintains the website points the form at the endpoint and sets the same secret.
- **Google Form** - The form owner runs the script once and approves the permission prompt.
- **Email** - Marina grants domain-wide delegation to the service account at admin.google.com, and the key file comes back by password manager or in person.
- **Facebook** - Confirm WHO owns the page and the business portfolio, create the app, subscribe the page, pass App Review.
- **Messenger** - Confirm WHO owns the page and the business portfolio, create the app, subscribe the page, pass App Review.
- **Instagram** - Confirm the account is professional, link it to the app, request the permission, pass review.
- **WhatsApp** - Register +371 23111114 as the WhatsApp Business number and complete business verification at Meta. Nobody at Novikontas has to be asked anything first.
- **Mailchimp** - Somebody with Mailchimp access pastes our address into the Novikontas audience (c6ab4facba) under webhooks. Nothing has to be bought or asked for - checked 24.09.2026.
- **Open Day** - Point the existing booking tool at the endpoint.
- **Phone** - None. Nobody outside Novikontas is waiting on anything.
- **Agent or partner** - Agree the format with each partner and issue their token.
- **LinkedIn** - Somebody has to establish what, if anything, LinkedIn permits.
- **TikTok** - Somebody has to establish what, if anything, TikTok permits.

---

## Website form

| | |
|---|---|
| Readiness | **READY FOR CONFIGURATION** |
| Mechanism | We publish an endpoint. The website posts to it. |
| Direction | inbound webhook |
| Security | shared secret header |
| Endpoint | `/api/inbound/website` |
| External id | submission_id supplied by the form |
| Timestamp | submitted_at supplied by the form |
| Deduplicated on | channel + external_event_id |
| Rate limits | Ours to set. A public form needs a spam control in front of it. |
| Reliability today | Shared-secret header, compared in constant time. A submission without a submission_id is refused. A repeat submission_id is dropped. |
| Reconciliation | None built. Depends on whether the website keeps its own copy of submissions - UNKNOWN. |

**What we control:** the endpoint; the field names; the secret; the spam rule

**What the provider controls:** nothing - this is our own website

**Credentials required:** WEBSITE_FORM_SECRET, generated by us

**Somebody outside has to:** Whoever maintains the website points the form at the endpoint and sets the same secret.

**How we test:** Simulate from DEV CONTROL, or post a fixture to the endpoint with the test secret.

**How we go live:** Deploy, set the secret both sides, send one real submission, check it appears in CAR, switch mode to live.

**How we turn it off:** Set the channel mode to off. The endpoint then refuses and says so.


## Google Form

| | |
|---|---|
| Readiness | **WAITING FOR EXTERNAL ACCESS** |
| Mechanism | Apps Script on the response sheet posts to our endpoint on submit. |
| Direction | inbound webhook |
| Security | shared secret header |
| Endpoint | `/api/inbound/google_form` |
| External id | responseId from the form response |
| Timestamp | the response timestamp |
| Deduplicated on | channel + responseId |
| Rate limits | Apps Script quotas apply to the sender, not to us. |
| Reliability today | Shared-secret header from the Apps Script. A repeat responseId is dropped. |
| Reconciliation | Possible and not built: the Form keeps every response, so they can be re-read and compared. |

**What we control:** the endpoint; the payload contract; the secret

**What the provider controls:** the trigger; the authorisation; the field names on the form

**Credentials required:** GOOGLE_FORM_SECRET, generated by us and pasted into the script

**EXTERNAL BLOCKER:** Nobody has named who created the form. Only its owner can paste the Apps Script onto the response sheet and approve the permission box.

**Somebody outside has to:** The form owner runs the script once and approves the permission prompt.

**How we test:** Simulate from DEV CONTROL using the documented Apps Script payload.

**How we go live:** Deploy, install the script, submit one real test response, check CAR, switch to live.

**How we turn it off:** Remove the trigger at Google, or set the mode to off here.

**Note:** A second architecture exists - the Forms API with a Cloud project and Pub/Sub. It is heavier and needs a Cloud project. The Apps Script route is what this contract assumes. EXTERNAL CONFIRMATION REQUIRED on which one Novikontas wants.

**Architecture review, 27.09.2026:** The review recommends binding the script to the FORM's own submit trigger rather than the response sheet, so a Sheet is not a middleman unless someone actually works in it. The register still says response sheet; which one is used is the form owner's choice when the owner is named.


## Email

| | |
|---|---|
| Readiness | **WAITING FOR EXTERNAL ACCESS** |
| Mechanism | We poll the Gmail API for new messages. Push over Pub/Sub is possible later. |
| Direction | inbound poll |
| Security | service account with domain delegation |
| Endpoint | `/api/cron/gmail-poll` |
| External id | the Gmail message id |
| Timestamp | the message Date header |
| Deduplicated on | channel + gmail message id |
| Rate limits | Gmail API quota per user. Polling every few minutes is well inside it. |
| Reliability today | Read-only scope (gmail.readonly), one mailbox. A repeat Gmail message id would be dropped. |
| Reconciliation | The poll IS the re-read, but it looks back a fixed 15 minutes and takes at most 25 messages, so a missed run or a busy window loses mail. A history-id cursor would close that. Not built. |

**What we control:** the polling schedule; what we extract; what we keep

**What the provider controls:** the mailbox; the delegation; the quota

**Credentials required:** a service account key; the delegated user address

**EXTERNAL BLOCKER:** Twenty minutes of Marina's time. She is the Google Workspace administrator and only she can grant the service account domain-wide delegation. Everything on our side is built.

**Somebody outside has to:** Marina grants domain-wide delegation to the service account at admin.google.com, and the key file comes back by password manager or in person.

**How we test:** Simulate from DEV CONTROL with a Gmail-shaped message fixture.

**How we go live:** Deploy, add the key, poll once by hand, check CAR, then enable the schedule.

**How we turn it off:** Disable the schedule. The key can also be revoked at Google.

**On the message body:** The message body is held until somebody qualifies the item (makes a lead), then deleted; what survives is the structured record. Decided 23.09.2026. **Changed for set aside on 07.10.2026:** asked "Set aside: keep the message text?", the owner answered "Keep the text". A message set aside (by a person, or by the filter) keeps its text until the 13-month retention empties it, so it can be brought back whole. **Changed for making a lead on 07.10.2026 (Q76):** asked "when a message becomes a lead, keep what the person wrote in their profile history?", the owner answered "Keep the text". A lead's message keeps its text too, and the person's History shows it, until the 13-month retention empties it.

**Architecture review, 27.09.2026:** BUILT ONLY TO THE FETCH. lib/gmail.js reads messages and api/cron/gmail-poll.js returns them in its reply; NOTHING passes them to receive(), so no email reaches the Inbox yet. Also an open decision the review raised: domain-wide delegation lets the service account read ANY mailbox in the Workspace with that scope - the code chooses one, the grant does not limit it. OAuth on a dedicated mailbox limits it to that mailbox. Ritvars and Marina decide.


## Facebook

| | |
|---|---|
| Readiness | **WAITING FOR EXTERNAL ACCESS** |
| Mechanism | Meta sends a webhook to us when a message or lead arrives. |
| Direction | inbound webhook |
| Security | meta app secret signature |
| Endpoint | `/api/inbound/facebook` |
| External id | the message id, or leadgen_id for a lead form |
| Timestamp | the event timestamp, seconds since epoch |
| Deduplicated on | channel + provider event id |
| Rate limits | Meta rate limits apply to our calls back to them, not to their webhook. |
| Reliability today | Meta's X-Hub-Signature-256 over the raw body with the app secret. A repeat provider event id is dropped. |
| Reconciliation | None built. The Graph API can list conversations, so a backfill is possible later. |

**What we control:** the endpoint; signature verification; normalisation

**What the provider controls:** the app; the permissions; the review; the page access

**Credentials required:** app secret; verify token; a page access token

**EXTERNAL BLOCKER:** A Meta app, page access from the business portfolio, and APP REVIEW for messaging permissions. Review takes weeks and can be refused.

**Somebody outside has to:** Confirm WHO owns the page and the business portfolio, create the app, subscribe the page, pass App Review.

**How we test:** Simulate from DEV CONTROL with a Meta-shaped webhook body, signed with a test secret.

**How we go live:** Deploy, set the callback URL and verify token at Meta, pass the handshake, send one real message, switch to live.

**How we turn it off:** Unsubscribe the page at Meta, or set the mode to off here.

**Operationally:** Facebook and Instagram are worked through the shared Meta Business Suite inbox. The channel is Facebook; who owns the person in the CRM is decided after qualification and is not the same question.


## Messenger

| | |
|---|---|
| Readiness | **WAITING FOR EXTERNAL ACCESS** |
| Mechanism | Meta webhook. The same connection as Facebook; the originating channel is recorded separately. |
| Direction | inbound webhook |
| Security | meta app secret signature |
| Endpoint | `/api/inbound/messenger` |
| External id | the message id, or leadgen_id for a lead form |
| Timestamp | the event timestamp, seconds since epoch |
| Deduplicated on | channel + provider event id |
| Rate limits | Meta rate limits apply to our calls back to them, not to their webhook. |
| Reliability today | As Facebook: the same Meta signature and the same connection. A repeat event id is dropped. |
| Reconciliation | None built. As Facebook. |

**What we control:** the endpoint; signature verification; normalisation

**What the provider controls:** the app; the permissions; the review; the page access

**Credentials required:** app secret; verify token; a page access token

**EXTERNAL BLOCKER:** A Meta app, page access from the business portfolio, and APP REVIEW for messaging permissions. Review takes weeks and can be refused.

**Somebody outside has to:** Confirm WHO owns the page and the business portfolio, create the app, subscribe the page, pass App Review.

**How we test:** Simulate from DEV CONTROL with a Meta-shaped webhook body, signed with a test secret.

**How we go live:** Deploy, set the callback URL and verify token at Meta, pass the handshake, send one real message, switch to live.

**How we turn it off:** Unsubscribe the page at Meta, or set the mode to off here.

**Operationally:** Messenger shares the Meta Business Suite connection with Facebook and Instagram. It stays a separate channel for reporting, filtering, source and history, because a combined "Meta" number would hide where people actually came from.


## Instagram

| | |
|---|---|
| Readiness | **WAITING FOR EXTERNAL ACCESS** |
| Mechanism | Meta webhook, object instagram. |
| Direction | inbound webhook |
| Security | meta app secret signature |
| Endpoint | `/api/inbound/instagram` |
| External id | the message id |
| Timestamp | the event timestamp, milliseconds since epoch |
| Deduplicated on | channel + provider event id |
| Rate limits | As Facebook. |
| Reliability today | As Facebook: the same Meta signature. A repeat event id is dropped. |
| Reconciliation | None built. As Facebook. |

**What we control:** the endpoint; signature verification; normalisation

**What the provider controls:** the account type; the permission; the review

**Credentials required:** app secret; verify token; a page or IG access token

**EXTERNAL BLOCKER:** APP REVIEW for messaging permissions. The account is already Professional - it is in Meta Business Suite - so that part is settled and is not a blocker.

**Somebody outside has to:** Confirm the account is professional, link it to the app, request the permission, pass review.

**How we test:** Simulate from DEV CONTROL.

**How we go live:** As Facebook.

**How we turn it off:** As Facebook.

**Operationally:** Same shared Meta Business Suite inbox as Facebook.


## WhatsApp

| | |
|---|---|
| Readiness | **WAITING FOR EXTERNAL ACCESS** |
| Mechanism | WhatsApp Business Platform webhook, field messages. |
| Direction | inbound webhook |
| Security | meta app secret signature |
| Endpoint | `/api/inbound/whatsapp` |
| External id | the WhatsApp message id |
| Timestamp | the message timestamp, seconds since epoch |
| Deduplicated on | channel + message id |
| Rate limits | Messaging limits apply to what we SEND, not to what arrives. |
| Reliability today | As Facebook: the same Meta signature. A repeat WhatsApp message id is dropped. |
| Reconciliation | None built. |

**What we control:** the endpoint; signature verification; normalisation

**What the provider controls:** the number; the verification; the messaging window rules

**Credentials required:** app secret; verify token; a phone number id; an access token

**EXTERNAL BLOCKER:** The Meta build: a WhatsApp Business Account, +371 23111114 registered against it, the app connected and business verification. The NUMBER is settled - Marina confirmed it on 24.09.2026 - so this is work, not a question.

**Somebody outside has to:** Register +371 23111114 as the WhatsApp Business number and complete business verification at Meta. Nobody at Novikontas has to be asked anything first.

**How we test:** Simulate from DEV CONTROL.

**How we go live:** Deploy, register the number, set the webhook, send one real message, switch to live.

**How we turn it off:** Remove the webhook at Meta, or set the mode to off here.

**Operationally:** WhatsApp sits in the same Meta Business Suite as Facebook and Instagram - settled 24.09.2026. Access today: Ieva, Laura, Marina. Not Tetiana. Access is not ownership: a confirmed study lead belongs to Ieva whatever channel it arrived on.


## Mailchimp

| | |
|---|---|
| Readiness | **READY FOR CONFIGURATION** |
| Mechanism | Audience webhook for subscribe, unsubscribe, profile and cleaned events. |
| Direction | inbound webhook |
| Security | secret in url |
| Endpoint | `/api/inbound/mailchimp` |
| External id | type + email + fired_at, because Mailchimp sends no event id |
| Timestamp | fired_at |
| Deduplicated on | channel + type + email + fired_at |
| Rate limits | Not a concern for inbound events. |
| Reliability today | Secret in the webhook URL. A repeat of type + email + fired_at is dropped. |
| Reconciliation | Not built. The review recommends exactly our intended shape: the webhook is the event stream, the API is the correction tool - re-read the audience and compare. |

**What we control:** the endpoint; the secret in the path; normalisation

**What the provider controls:** the plan; the audience settings

**Credentials required:** a secret we generate and put in the callback URL

**Somebody outside has to:** Somebody with Mailchimp access pastes our address into the Novikontas audience (c6ab4facba) under webhooks. Nothing has to be bought or asked for - checked 24.09.2026.

**How we test:** Simulate from DEV CONTROL.

**How we go live:** Deploy, paste the URL, trigger one subscribe, check it lands, switch to live.

**How we turn it off:** Delete the webhook in Mailchimp.

**On identity:** A Mailchimp event is ACTIVITY about somebody, not automatically a new person. It matches on the member id or the email. A newsletter subscriber is not a lead.


## Open Day

| | |
|---|---|
| Readiness | **READY FOR CONFIGURATION** |
| Mechanism | The existing booking tool posts a registration to our endpoint. |
| Direction | inbound webhook |
| Security | shared secret header |
| Endpoint | `/api/inbound/open_day` |
| External id | the booking reference |
| Timestamp | the booking time |
| Deduplicated on | channel + booking reference |
| Rate limits | Not a concern. |
| Reliability today | Shared-secret header. A repeat booking reference is dropped. |
| Reconciliation | None built. Whether the booking tool has an API to re-read from is UNKNOWN (PROVIDER_QUESTIONS.md). |

**What we control:** the endpoint; the registration model; attendance

**What the provider controls:** the booking tool

**Credentials required:** OPEN_DAY_SECRET

**Somebody outside has to:** Point the existing booking tool at the endpoint.

**How we test:** Simulate from DEV CONTROL.

**How we go live:** Deploy, point the tool at it, make one real booking, switch to live.

**How we turn it off:** Set the mode to off.

**On identity:** A registration attaches to an existing person when one matches, and never creates a second record for somebody we already hold. Attendance is a separate fact recorded later.

**Known gap:** Attendance is not yet linked back to the person record. The model is prepared; no attendance data is invented.


## Phone

| | |
|---|---|
| Readiness | **WAITING FOR EXTERNAL ACCESS** |
| Mechanism | We poll the TeleGroup PBX for recent calls. |
| Direction | inbound poll |
| Security | token in query |
| Endpoint | `/api/cron/pbx-calls` |
| External id | uniqueid |
| Timestamp | created_at, read as Europe/Riga |
| Deduplicated on | uniqueid |
| Rate limits | UNKNOWN. Must be asked. |
| Reliability today | Poll every 5 minutes for the last 15, so two missed runs lose nothing; upsert on uniqueid absorbs the overlap. |
| Reconciliation | The overlap window is the reconciliation. |

**What we control:** the polling window; timezone handling; the queue filter; retention

**What the provider controls:** the API; the fields; the token; whether the button is included

**Credentials required:** PBX_API_TOKEN, server side only, never in the client

**EXTERNAL BLOCKER:** Nothing from TeleGroup. Ritvars holds the API token; it goes into PBX_API_TOKEN on the host, then the channel needs the three deployment prerequisites.

**Somebody outside has to:** None. Nobody outside Novikontas is waiting on anything.

**How we test:** A local mock of the PBX list endpoint plus fixtures. The real API is never called in development.

**How we go live:** Deploy, set the token, apply sql/001, poll once by hand, check the rows, then enable the schedule.

**How we turn it off:** Disable the schedule.

**Note:** V1 logs calls by hand and says so on screen. The logger is built and tested locally and has never called the real API. The queue field gives us the button; that question is settled.

**Architecture review, 27.09.2026:** TWO GAPS, 27.09.2026. (1) NO TRIGGER: the Vercel team is on Hobby, which rejects any cron more frequent than daily, so the 5-minute cron was removed from vercel.json; something else must call /api/cron/pbx-calls every 5 minutes before this channel goes live. (2) Calls are written by lib/pbx.js into its own table, pbx_incoming_calls, through the Supabase REST API. Nothing in src/ reads that table, so no call reaches the Inbox yet. Still worth asking TeleGroup whether a reliable call-event push exists (open question 9); if not, polling stays - it works.


## Agent or partner

| | |
|---|---|
| Readiness | **WAITING FOR EXTERNAL ACCESS** |
| Mechanism | A tokenised link the partner submits through, or a spreadsheet import. |
| Direction | inbound webhook |
| Security | per partner token |
| Endpoint | `/api/inbound/agent` |
| External id | the partner's own reference |
| Timestamp | the submission time |
| Deduplicated on | channel + partner id + partner reference |
| Rate limits | Ours to set per partner. |
| Reliability today | A token per partner, checked server-side. A repeat partner id + partner reference is dropped. |
| Reconciliation | None built. |

**What we control:** the endpoint; the token per partner; the field contract

**What the provider controls:** nothing standard - every agent is different

**Credentials required:** one token per partner, issued by us

**EXTERNAL BLOCKER:** Nobody has named which agent we start with, or who at their end would set up the link.

**Somebody outside has to:** Agree the format with each partner and issue their token.

**How we test:** Simulate from DEV CONTROL.

**How we go live:** Issue a token to one partner, take one real referral, switch to live.

**How we turn it off:** Revoke the token.

**On identity:** The agent is a SOURCE and an attribution. It is never automatically the CRM owner.

**Note:** No public agent API exists to integrate with. This is a contract we define, not one we discover.

**Architecture review, 27.09.2026:** The review suggests the simplest version needs no partner system at all: the agent hands out a unique referral link to OUR website form, the form carries the token, and the CRM records source = agent and which agent. Worth choosing before anybody builds a partner-side webhook.


## In person

| | |
|---|---|
| Readiness | **MANUAL ONLY, BY DESIGN** |
| Mechanism | A member of staff types it in at the desk. |
| Direction | manual |
| Security | none needed |
| Endpoint | not applicable |
| External id | generated by us at entry |
| Timestamp | when it was typed |
| Deduplicated on | channel + generated id |
| Rate limits | Not applicable. |
| Reliability today | Typed by staff. The server refuses the save (409) when the email, phone or name matches somebody, unless staff confirm it is a different person. |
| Reconciliation | Not applicable - the person is standing there. |

**What we control:** everything

**What the provider controls:** nothing

**Credentials required:** none

**How we test:** Add a person from the app.

**How we go live:** Already usable.

**How we turn it off:** Not applicable.

**On identity:** Manual entry runs the SAME duplicate check as every automated channel. It is not a way around the rule.


## LinkedIn

| | |
|---|---|
| Readiness | **CAPABILITY UNCONFIRMED** |
| Mechanism | UNKNOWN. No inbound message API is known to be available to us. |
| Direction | manual |
| Security | unknown |
| Endpoint | not applicable |
| External id | entered by the person copying it in |
| Timestamp | entered by the person copying it in |
| Deduplicated on | channel + generated id |
| Rate limits | Not applicable while manual. |
| Reliability today | Not applicable until the capability is known. |
| Reconciliation | Not applicable. |

**What we control:** the normalised shape, so that IF a mechanism appears it maps in without redesign

**What the provider controls:** everything else

**Credentials required:** unknown

**EXTERNAL BLOCKER:** EXTERNAL CONFIRMATION REQUIRED: whether LinkedIn offers any inbound messaging integration for a page like ours at all. Nothing has been confirmed. Do not promise it.

**Somebody outside has to:** Somebody has to establish what, if anything, LinkedIn permits.

**How we test:** Simulate from DEV CONTROL through the same normalised path.

**How we go live:** Not possible today. Manual entry only.

**How we turn it off:** Not applicable.

**Operationally:** Access today: Tetiana only. A LinkedIn contact often carries no email and no phone, so the handover gap to Admissions is real and the screen says so.


## TikTok

| | |
|---|---|
| Readiness | **CAPABILITY UNCONFIRMED** |
| Mechanism | UNKNOWN. No inbound message API is known to be available to us. |
| Direction | manual |
| Security | unknown |
| Endpoint | not applicable |
| External id | entered by the person copying it in |
| Timestamp | entered by the person copying it in |
| Deduplicated on | channel + generated id |
| Rate limits | Not applicable while manual. |
| Reliability today | Not applicable until the capability is known. |
| Reconciliation | Not applicable. |

**What we control:** the normalised shape only

**What the provider controls:** everything else

**Credentials required:** unknown

**EXTERNAL BLOCKER:** EXTERNAL CONFIRMATION REQUIRED: whether TikTok offers any inbound messaging integration. Nothing has been confirmed. Do not invent one.

**Somebody outside has to:** Somebody has to establish what, if anything, TikTok permits.

**How we test:** Simulate from DEV CONTROL through the same normalised path.

**How we go live:** Not possible today. Manual entry only.

**How we turn it off:** Not applicable.

**Operationally:** Access today: Tetiana only. Same handover gap as LinkedIn.

