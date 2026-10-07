# Connecting the channels

A walk-through for switching each channel on for real, with the exact endpoint, the exact
secret name, and the exact person outside this repository who has to do something first.

Nothing here is connected today. The adapters, the security checks and the tests are written and
passing; what is missing is a public address to receive on, and credentials.

Companion documents: [CHANNEL_READINESS.md](CHANNEL_READINESS.md) is the generated per-channel
reference, and [PROVIDER_QUESTIONS.md](PROVIDER_QUESTIONS.md) holds the exact wording to send each
provider.

---

## The three things that must exist before ANY channel

None of these is a channel, and none of them can be skipped.

| # | What | Why |
|---|---|---|
| 1 | **A public HTTPS address** | Every channel except the phone works by the provider calling **us**. There is no address to call today, so there is nothing to configure at the provider end. |
| 2 | **A real database** | Today it is a file on one laptop. |
| 3 | **A login** | Right now "who you are" is a dropdown. Every permission rule, including who may read feedback, is a workflow rule and not a security boundary until this exists. |

Until all three are done, everything below is preparation.

---

## How a channel is switched on

The same four steps every time. If a channel ever needs more than this, something was designed wrong.

1. **Set the secret** as an environment variable on the server.
2. **Give the provider the URL** and set the same secret at their end.
3. **Verify:** send one real event and watch it arrive.
4. **Switch the mode** from `test` to `live`.

The mode is an environment variable per channel:

```
CHANNEL_MODE_INSTAGRAM=off     # refuses everything (the default)
CHANNEL_MODE_INSTAGRAM=test    # accepts events, marked as testing
CHANNEL_MODE_INSTAGRAM=live    # accepts events, and requires the secret to be present
```

A channel set to `live` **without** its secret reports `ERROR` rather than pretending to work.

**Never put a secret in the repository, in a screenshot, or in a chat message.** Only the name of
the variable belongs in writing.

---

## Before you start: test it locally

Open the **Console** at `/console`. Pick a channel, pick a scenario, press send. The event travels
the real path: the provider's own payload shape, the adapter, the spam filter, identity matching,
the Inbox. Nothing is written straight into a table.

Do this for a channel **before** you configure it for real. If it does not behave locally it will
not behave live.

---

## The channels, easiest first

This order is deliberate. The first three need nobody outside Novikontas.

### 1. Website form

| | |
|---|---|
| Endpoint | `POST /api/inbound/website` |
| Secret | `WEBSITE_FORM_SECRET` (we generate it) |
| Security | The form sends the secret in an `x-crm-secret` header |
| Blocked on | Nothing. Our side is finished. |

- [ ] Generate a secret and set `WEBSITE_FORM_SECRET` on the server
- [ ] Whoever maintains the website points the form at the endpoint and sets the same secret
- [ ] Keep the `utm_source`, `utm_medium` and `utm_campaign` parameters on every advert link, or the
      report cannot say where anybody came from
- [ ] Send one real submission and check it appears in the Inbox
- [ ] Check a second submission from the same person offers the existing record instead of making a twin
- [ ] `CHANNEL_MODE_WEBSITE=live`

A public form needs something in front of it to stop bots. That is a decision nobody has made yet.

### 2. Open Day

| | |
|---|---|
| Endpoint | `POST /api/inbound/open_day` |
| Secret | `OPEN_DAY_SECRET` (we generate it) |
| Blocked on | Nothing. Our side is finished. |

- [ ] Generate and set `OPEN_DAY_SECRET`
- [ ] Point the existing booking tool at the endpoint
- [ ] Book once as a brand new person, and once as somebody already in the CRM
- [ ] Confirm the second one attaches to the existing person and does **not** create a second record
- [ ] `CHANNEL_MODE_OPEN_DAY=live`

**Operationally:** an Open Day booking starts with Tetiana. The moment it becomes a confirmed study
interest it is Admissions work and the owner is Ieva.

**Known gap:** attendance is not yet linked back to the person. The model is prepared and no
attendance data is invented.

### 3. Agent or partner

| | |
|---|---|
| Endpoint | `POST /api/inbound/agent` |
| Secret | `AGENT_TOKENS`, one token per partner, issued by us |
| Blocked on | Nothing technical. Each partner has to agree a format. |

- [ ] Agree the fields with one partner to begin with
- [ ] Issue that partner a token and set it in `AGENT_TOKENS`
- [ ] Test a valid referral, a repeat of the same referral, and an unknown token
- [ ] `CHANNEL_MODE_AGENT=live`

The agent is a **source**, never the owner. A study lead from an agent belongs to Ieva.

### 4. In person

Nothing to connect. **+ Add person** in the CRM, source **In person**. It runs the same duplicate
check as every automated channel, deliberately: manual entry is not a way around the rule.

---

## Channels blocked on somebody outside

### 5. Google Form

| | |
|---|---|
| Endpoint | `POST /api/inbound/google_form` |
| Secret | `GOOGLE_FORM_SECRET` |
| **Blocked on** | **The form owner** must paste a script, add an installable trigger, and authorise it once. |

- [ ] Find out who owns the form
- [ ] Decide between two architectures and record the choice:
      **Apps Script** (what this build assumes: a script on the response sheet posts to us) or the
      **Forms API** (needs a Google Cloud project and Pub/Sub, considerably heavier)
- [ ] Generate `GOOGLE_FORM_SECRET` and paste it into the script
- [ ] The form owner runs the script once and approves the permission prompt
- [ ] Submit one real test response
- [ ] `CHANNEL_MODE_GOOGLE_FORM=live`

The form's field names are in Latvian because the form is. That is provider data and is mapped on
the way in; it never reaches a screen.

### 6. Gmail

| | |
|---|---|
| Mechanism | **We poll them.** No webhook. |
| Poll path | `/api/cron/gmail-poll` |
| Secret | `GMAIL_SERVICE_ACCOUNT_JSON` |
| **Blocked on** | **A Google Workspace administrator.** A normal user cannot grant this. |

- [ ] Create a Google Cloud project
- [ ] Create a service account
- [ ] **A Workspace admin grants domain-wide delegation** for `edu@novikontas.org`
- [ ] Store the key server side and set `GMAIL_SERVICE_ACCOUNT_JSON`
- [ ] Poll once by hand and check what arrives
- [ ] Enable the schedule
- [ ] `CHANNEL_MODE_GMAIL=live`

Access to the mailbox itself: Ieva, Laura, Marina.

**On the message body:** it is held until somebody qualifies the item (makes a lead), then deleted. Set aside keeps it (07.10.2026, the owner: "Keep the text") until the 13-month retention empties it.
What survives is the structured record. The CRM is not a mail archive.

### 7. Facebook, Instagram, Messenger, WhatsApp

**One Meta connection. Four separate channels in the CRM.** The connection is an integration detail;
Facebook, Instagram, Messenger and WhatsApp stay separate for reporting, filtering, source and
history. There is deliberately no combined "Meta" number, because it would hide where people came
from.

| | |
|---|---|
| Endpoints | `POST /api/inbound/facebook`, `/instagram`, `/messenger`, `/whatsapp` |
| Secrets | `META_APP_SECRET` and `META_VERIFY_TOKEN`, **shared by all four** |
| Security | Real HMAC signature over the raw request body |
| **Blocked on** | **Meta App Review.** It takes weeks and it can be refused. |

Shared steps:

- [ ] **Confirm who owns the Facebook Page and the Business Portfolio.** Nothing can start until this
      is answered, and it is a question about people, not about software.
- [ ] Create a Meta developer app
- [ ] Set `META_APP_SECRET` and `META_VERIFY_TOKEN`
- [ ] Give Meta the callback URL and the verify token, and pass the handshake
- [ ] Subscribe the Page
- [ ] **Submit for App Review** for messaging permissions
- [ ] After approval, send one real message on each of the four and confirm each records its own channel

Per channel:

- [ ] **Instagram:** the account must be a **professional** account, linked to the app
- [ ] **WhatsApp:** needs **a phone number that is not already on consumer WhatsApp**, plus business
      verification. Finding a spare number is often the slowest part.
- [ ] **Messenger:** shares the Facebook Page connection

**Meta Business Suite access at Novikontas:** Ieva, Laura, Tetiana, Marina.
**Arina has no social access** and is phone button 3 backup only.

**Not verified:** whether WhatsApp actually sits inside the same shared Business Suite inbox as the
other three. Do not claim it until somebody checks.

### 8. Mailchimp

| | |
|---|---|
| Endpoint | `POST /api/inbound/mailchimp` |
| Secret | `MAILCHIMP_WEBHOOK_SECRET`, carried in the URL |
| **Blocked on** | **Confirming the plan includes webhooks.** |

- [ ] Confirm the current Mailchimp plan supports audience webhooks
- [ ] Generate the secret and build the callback URL
- [ ] Paste it into the audience webhook settings
- [ ] Trigger one subscribe and check it lands
- [ ] `CHANNEL_MODE_MAILCHIMP=live`

**Mailchimp does not sign its requests.** The secret sits in the URL, which is weaker than a
signature, and the CRM says so in its own logs rather than implying the check is stronger than it is.

**On identity:** a Mailchimp event is **activity about somebody**, not automatically a new person. A
newsletter subscriber is not a lead. It matches on the member id or the email.

Mailchimp is Tetiana's channel. A confirmed study lead from it is Ieva's.

### 9. Phone (TeleGroup PBX)

| | |
|---|---|
| Mechanism | **We poll them.** The PBX never calls us. |
| Poll path | `/api/cron/pbx-calls` |
| Secret | `PBX_API_TOKEN`, **server side only** |
| **Blocked on** | **An API token from TeleGroup.** Nothing else. |

**SETTLED 24.09.2026 - do not ask again.** The post-call event carries a `queue`, and the queue IS
the button. It was in the original TeleGroup brief, it has been mapped in `config/prototype.json`
-> `phoneMenu` since 23.09.2026, and Marina confirmed the 1/2/3 routing. Routing is closed; the
only outstanding item on this channel is the access token. The token in use is **not** being
changed.

- [ ] Send TeleGroup the questions in [PROVIDER_QUESTIONS.md](PROVIDER_QUESTIONS.md)
- [ ] Confirm the button or queue is in the data
- [ ] Obtain an API token from TeleGroup
- [ ] Apply `sql/001_pbx_incoming_calls.sql` (currently **NOT APPLIED**)
- [ ] Set `PBX_API_TOKEN` server side
- [ ] Poll once by hand and inspect the rows
- [ ] Enable the schedule
- [ ] `CHANNEL_MODE_PHONE=live`

Routing, once the button is confirmed:

| Button | Queue | Goes to |
|---|---|---|
| 1 | `1001*Q-ADMISSION` | Admissions, Ieva |
| 2 | `1001*Q-COORDINATORS` | Student Coordinator, Laura |
| 3 | `1001*Q-OTHER` | Other, Tetiana and Arina |

Times are handled explicitly in Europe/Riga, with both daylight-saving changes tested. Nothing
assumes a fixed offset.

### 10. LinkedIn and TikTok

**Neither has a confirmed inbound mechanism, and the CRM does not pretend otherwise.** The status is
`capability_unconfirmed`, there is no webhook path, and a test fails if anybody writes one without
evidence.

- [ ] Establish what, if anything, LinkedIn permits for a page like ours
- [ ] Establish the same for TikTok
- [ ] Until then: **manual entry only**

**The operational reality, which matters more than the integration:**

Only Tetiana can open LinkedIn and TikTok. Ieva can assess the CRM record and owns the Admissions
case, but if she needs the original conversation she has to ask Tetiana. That is a real bottleneck,
not a software gap, and the CRM should not hide it.

These contacts often arrive with no email and no phone, so the handover to Admissions has a genuine
hole in it. The person page says so.

---

## What has to be true before you call a channel connected

Not "the webhook returned 200". The whole journey:

```
the provider
  -> our endpoint, signature checked
  -> the adapter
  -> the spam filter
  -> identity: an existing person, or a new one
  -> the Inbox
  -> a human decides
  -> if it is study interest: Admissions, owner Ieva
  -> a next action, with an owner and a due date
  -> Follow-ups
  -> Reports, with the source recorded separately
```

Per channel:

- [ ] A brand new person arrives correctly
- [ ] Somebody already in the CRM **attaches to their existing record** and does not make a twin
- [ ] A repeat of the same provider event is stored **once** (providers retry; that is normal)
- [ ] A sales pitch is filtered and stays out of the funnel
- [ ] A plain "Hi" is **not** treated as spam and waits for a person
- [ ] The source shows separately in Reports
- [ ] A confirmed study lead is owned by **Admissions, which is Ieva**, whatever the channel

---

## Order of work

1. Deploy, database, login
2. Website, Open Day, Agent (nobody outside needed)
3. Ask TeleGroup, ask about the Mailchimp plan, find the Facebook Page owner, find a spare WhatsApp
   number, book the Workspace admin. **These are the long poles and none of them is code.**
4. Google Form, Mailchimp
5. Gmail
6. Submit Meta App Review, then the four Meta channels
7. Phone, once TeleGroup answers
8. LinkedIn and TikTok stay manual unless something changes

---

## Rollback

Every channel turns off the same way: set its mode to `off`, and the endpoint refuses and says so.
Removing the webhook at the provider end is the second lock. Nothing else in the CRM changes when a
channel is switched off, and no data is lost.

The real database has a clean snapshot taken from the source file, and **Restore real data** in the
Console replays it and checksums the result. That is unaffected by any channel work.
