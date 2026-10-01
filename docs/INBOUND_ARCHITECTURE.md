# How information gets into the CRM

Written 23.09.2026. Revised the same day after the workflow was clarified with Aigars.
**Nothing here is built. Nothing is connected.** This is the design to approve or change before any
integration work starts.

> ## SUPERSEDED IN PART - read this first
>
> **The RAW / WARM / HOT ladder below was dropped on 23.09.2026** at the first visual review. Nobody
> could tell what the three words meant on screen. What shipped is **two states**:
>
> - **Not clear yet** - nobody can tell whether they want to study. Marketing (Tetiana).
> - **Lead** - they said what they want to study. Admissions (Ieva). **A question about documents or
>   price is a lead**, because that is exactly what Admissions answers.
>
> Read "warm or hot" below as **lead**, and "raw contact" as **not clear yet**. The reasoning, the
> three models, the provenance rule, the storage decision and the provider facts all still stand.
> [DECISIONS.md](DECISIONS.md) is the current record.
>
> **What changed in the earlier revision.** The first version had one gate: a queue, then Admissions.
> It gained a second, because Marketing already works the social channels. It also **narrows what we
> store**: the first version said "everything arrives and is stored, always". That is no longer true
> for message bodies. Section 9 explains what that costs us.

---

## 0. Where the architecture stands, 27.09.2026 - reviewed against an outside recommendation

The line above, "Nothing here is built", was true on 23.09.2026 and is not true now. Part of this
design is built and tested locally. **No channel is connected, and nothing is live.** This section
records what exists, read from the code, and how it compares with an architecture review Ritvars
brought in on 27.09.2026.

### The review's central rule, and we already follow it

> Different providers may use different transports, but Academy CRM has **one** standard internal way
> of receiving, identifying, deduplicating, recording and routing what arrives. Channel 15 is a new
> adapter, not a redesign.

It also warned against building an "integration platform" before integrating anything: start with
an endpoint per provider, a provider adapter and one shared processing path, and add a queue or a
separate gateway only when volume or reliability actually demands it. **That is the shape already
built.** There is no separate gateway service and none is planned for V1.

### What is built, as it runs today

```
provider
   |
   |  POST /api/inbound/<channel>          (GET on the same address = the provider's handshake)
   v
src/server.js      mode check (off | test | live)  ->  raw body read, 3 MB cap
   |
src/inbound.js     verifyRequest: the channel's own secret or signature, constant-time compare
   |               parseInboundBody: JSON, form-encoded (Mailchimp) or a Pub/Sub envelope (Gmail)
   v
src/adapters.js    one adapter per channel -> ONE normalized event shape
   |               (externalEventId, sender, body, extracted fields, attribution, consent)
   v
src/intake.js      receive(): drop a repeat external id -> extract with provenance -> junk filter
   |               -> one row in `inbound`, state new or filtered
   v
INBOX ("To look at")   a PERSON qualifies it: identity is matched and SHOWN, a human links or creates
   |
   v
PERSON  ->  history (events)  ->  owner and next step (routing)
```

The four Meta channels are **one** integration with four CRM sources (`facebook`, `instagram`,
`messenger`, `whatsapp`) - one signature scheme, one adapter family, one app. The review recommends
exactly that. The register is `config/channels.json`; its generated view is
[CHANNEL_READINESS.md](CHANNEL_READINESS.md), which now carries the reliability columns the review
asked for.

### Where we deliberately differ from the review, and why

| The review | Ours | Why ours stands |
|---|---|---|
| Identity resolution decides EXISTING or NEW automatically | The machine **matches and shows**; a person links or creates at qualification | Rule 1 of this document: a machine may sort, only a person may decide. An Instagram sender id is not an email; a wrong automatic merge is worse than two records a human joins |
| Store the event | Message bodies are **deleted at the qualification decision** | §9, decided. The key and the extracted facts stay; the conversation stays with the provider |

### The seven production questions, answered honestly

The review's point: getting an event once is not enough. For the platform as a whole:

| Question | Today | Status |
|---|---|---|
| Did we get it? | A stored `inbound` row, yes. A **refused or failed** delivery leaves only an entry in an in-memory list of 500 in `src/server.js`, lost on restart and, on Vercel, different per instance | **GAP** |
| Did we get it twice? | `receive()` looks for the same channel + external id before inserting. **Not enforced by the database** - the unique index the register claimed does not exist. Sound on SQLite, unsafe on Postgres under concurrent retries | **GAP, part of the Postgres move** |
| Did we process it? | Yes: `state` new / filtered / qualified / archived, with who and when | BUILT |
| What if processing failed? | The route answers 500; nothing durable records the failure | **GAP** |
| What if the provider retries? | A retry is dropped as a repeat (subject to the row above) and answers 200 "already had it" | BUILT |
| What if the CRM was down? | Depends on the provider retrying. No reconciliation is built for any webhook channel | **GAP, per channel in the register** |
| Can we reconstruct what happened? | For stored rows, yes, from `inbound` and history. For refusals and failures, no | **GAP** |

### What this review turned up that was not known before

Found by checking the code on 27.09.2026, not by reading documents:

1. **The dedupe is not database-enforced** (above). The register said it was. Corrected.
2. **Gmail stops at the fetch.** `lib/gmail.js` reads messages and `api/cron/gmail-poll.js` returns
   them in its reply. Nothing passes them to `receive()`, so no email would reach the Inbox even with
   Marina's grant. The poll also looks back a fixed 15 minutes and takes at most 25 messages.
3. **Phone calls stop at their own table.** `lib/pbx.js` writes to `pbx_incoming_calls` through the
   Supabase REST API. Nothing in `src/` reads that table, so no call reaches the Inbox.
4. **The PBX has no trigger on Vercel Hobby**, which rejects any cron more frequent than daily. The
   5-minute cron was removed from `vercel.json` the same day; the route stays.
5. **Gmail's permission model is an open decision.** Domain-wide delegation lets the service account
   read any mailbox in the Workspace with the read-only scope; the code picks one. OAuth on one
   dedicated mailbox would limit it to that one. The scope is already read-only, as the review asks.

### Two smaller suggestions from the review, recorded as options, not decisions

- **Google Form:** bind the Apps Script to the form's own submit trigger rather than the response
  sheet, unless somebody actually works in the sheet.
- **Agent:** the simplest version needs no partner system - a unique referral link to our own website
  form, the token carried with the submission, `source = agent` plus which agent.

The backlog rows are in [BACKLOG.md](BACKLOG.md), 27.09.2026.

---

## 1. The problem, in two sentences

If everything that arrives becomes a lead, Admissions drowns. Thirty people send "Hi" on a Tuesday
and Ieva gets thirty notifications, so she stops reading them.

If we let a machine throw things away, we lose the one applicant who mattered, and nobody ever knows.

So the design rests on two rules, not one:

> **1. A machine may SORT. Only a person may DISCARD.**
> **2. A contact is not a lead. Someone has to talk to them first.**

---

## 2. The ladder

```
  RAW CONTACT        WARM LEAD           HOT LEAD          APPLICATION      ADMITTED     SIS
  "Hi"               genuine interest    clear study       formal            converted    CRM
                     established         intent            admissions                     journey
                                                           process                        ends
      |                    |                  |                 |                |
   MARKETING           MARKETING          ADMISSIONS        ADMISSIONS      ADMISSIONS
   (Tetiana)           (Tetiana)          (Ieva)
      |                    |                  |
   no notification     notification       REAL NOTIFICATION
   to Admissions       to the             to Admissions
                       qualification
                       owner
```

**Tetiana already lives in the social channels on her phone.** So broad inbound lands with Marketing,
who has the conversation anyway, and only qualified opportunities reach Admissions. This is not a new
job for her. It is the job she already does, made visible.

**Channel access is PER PERSON, and it is not ownership** (final matrix, 23.09.2026).

| Channel | Who can open it | Worked through |
|---|---|---|
| Facebook | Tetiana, Ieva, Laura, Marina | **Meta Business Suite** (shared) |
| Instagram | Tetiana, Ieva, Laura, Marina | **Meta Business Suite** (shared) |
| WhatsApp | Ieva, Laura, Marina - **not Tetiana** | **UNVERIFIED** whether it is in Meta Business Suite |
| LinkedIn | **Tetiana only** | her own access |
| TikTok | **Tetiana only** | her own access |

It has to be per person: no role-shaped model can say *everybody except Tetiana has WhatsApp*. A role
reaches a channel when at least one of its people can, and that is **derived**, never written twice.

**Nobody "owns" Facebook or Instagram.** Both arrive through one shared inbox, so there is no
"Tetiana owns Facebook" assumption anywhere in the routing. **The channel records stay separate for
reporting** - where a person came from is still a real, different fact.

For **LinkedIn and TikTok** Tetiana is the only access, so a lead from those two raises a handover
gap unless the record holds an email or a phone, and the gap names her by name.

**The phone menu:** button 1 = Admissions (Ieva), button 2 = Student Coordinator (Laura),
button 3 = Other (**Tetiana and Arina**, Internship Coordinator). Those three buttons are the three
PBX queues the call logger keeps, so the menu and the logger are one fact in one place.

**CHANNEL ACCESS IS NOT CRM OWNERSHIP.** Ownership follows the work: a confirmed interest is
Admissions work whatever channel it arrived on.

**The stage list is NOT decided.** Raw / Warm / Hot above are the *qualification* ladder that was
described. Whether they are stages, or a separate field alongside the pipeline stages, is part of the
stage definition still owed by the owner. The prototype therefore records them as a **separate,
clearly provisional field** and has not touched the pipeline stages.

**The Warm-to-Hot threshold is NOT invented here.** Section 7 sets out the shape of the question so
it can be answered, and nothing more.

---

## 3. The three models, and which one we use

### Model A - the machine decides before the CRM

```
provider  ->  rules  ->  relevant  ->  CRM
                 \
                  ->  not relevant  ->  gone
```

**Rejected as the gate.** A rule that is slightly wrong loses an applicant silently, leaving nothing
to audit. You cannot review a decision that left no trace.

### Model B - everything lands in an intake queue, a person decides

```
provider  ->  CRM INTAKE  ->  Marketing looks
                               |-- genuine interest  -> Warm lead
                               |-- not relevant      -> archived WITH A REASON, still searchable
```

**This is the spine.**

### Model C - the operator pushes things in by hand (browser extension)

**Demoted.** Not a V1 component and the product is not designed around it. Tetiana works on a phone
across four apps; an extension is a desktop browser tool and does not fit how the work actually
happens. It stays on the shelf as a fallback if a provider approval is refused outright.

---

## 4. The recommended shape

```
   provider
      |
      v
  [ MACHINE ]  detect, extract, match, pre-fill, rank      never deletes, never invents
      |
      v
  CRM INTAKE  ---------------------------------------->  every raw contact is recorded
      |                                                   and stays searchable forever
      v
  [ MARKETING qualifies ]  Tetiana talks to them
      |
      |-- not relevant ----> archived with a reason, still findable
      |-- genuine interest -> WARM LEAD, owner Marketing
      |
      v
  [ enough qualification ]
      |
      v
  HOT LEAD ---------> routed to ADMISSIONS with a notification that means something
      |
      v
  APPLICATION -> ADMITTED -> handed to SIS
```

Two gates. The machine gate only ever labels and ranks. The human gates are where anything
irreversible happens.

---

## 5. What the machine may and may not do

> **Changed 01.10.2026 by Ritvars, for Stage 2 only.** This section said a machine may sort and only
> a person may discard. It now reads: **the AI may filter the working Inbox, but never destroys the
> record.** Filtering is hiding from the working queue, not deleting: the inbound event stays
> recoverable and auditable with its source, its provenance and the AI's reason, a message that is
> uncertain but genuine stays for a person, and a person still decides every lifecycle change
> (creating or promoting a lead). Decided in the AI Review feasibility session; the eleven decisions
> and the five standing rules are in `Projects/College CRM/BRIEF_INTAKE_AI_REVIEW_DIRECTION.md`.
>
> **None of this is built, and V1 does not wait for it.** Everything below is what the code does
> TODAY unless a line says otherwise.

### What V1 does today, and where it already falls short of the rule above

`receive()` runs a word-list junk check (`looksLikeJunk` in `src/extract.js`). When it fires, the row
is stored, then immediately set to `state = 'filtered'`, `processed_by = 'machine'`, and **its body is
set to NULL in the same breath** (`src/intake.js`, the `read.junk` branch). **No history row is
written**, so there is no audit trail of what the machine threw away or why, beyond `archive_reason`
and `archive_note` on the row itself.

That is the one place V1 already discards without a person and without a trace. **It is deliberately
left alone in V1** (Ritvars' call). Stage 2 needs it to keep the body until the item is restored or
retention ends, and to write one audit row per machine filter.

### May (safe, reversible, never destructive)

- **Detect potential intent.** Does this message mention a programme, a start date, a price question?
- **Extract structured information** from what was actually written.
- **Match an existing person** on email, phone, thread id or sender id.
- **Pre-fill fields** for a human to confirm.
- **Rank and sort** the intake queue so likely-real items are at the top.
- **Drop a byte-for-byte repeat** of a message already stored (same provider message id). This is the
  only thing the machine acts on alone, and it is arithmetic, not judgement.
- **Stage 2, not built:** filter noise out of the WORKING queue, prioritise, recommend routing and a
  next action, and flag duplicates and people we already have. Every one of those is reversible and
  leaves the record intact.

### Must NOT

- Destroy, or make unrecoverable, anything a human being sent us.
- Create a Hot lead.
- Notify Admissions.
- Decide a lifecycle change: creating or promoting a lead stays with a person.
- **Invent a fact that was not in the message.**

### The six rules every change to the inbound path must keep

1. `receive()` is the single entry point. No per-channel lead logic.
2. Store the inbound row first, before any judgement.
3. `inbound.body` lives until qualify or archive. Never deleted earlier.
4. Machine output keeps provenance `extracted` and is never counted until somebody confirms it.
5. Person matching stays in `src/identity.js`, never in the AI.
6. **Add no new place that nulls a body or filters without a trace.** The one that exists is named
   above; it is not a licence for another.

### How "must not invent" is made real

Every field the machine produces carries where it came from:

| Provenance | Meaning | May it be reported on? |
|---|---|---|
| `typed` | the person typed it into our own form | yes |
| `provider` | the provider supplied it (a WhatsApp phone number, a lead-ad field) | yes |
| `extracted` | **a machine read it out of a message and NOBODY has confirmed it** | **no** |
| `confirmed` | a named operator looked at the extraction and agreed | yes |
| `operator` | a named operator typed it themselves | yes |

An `extracted` value is shown on screen as a **suggestion**, visibly different from a fact, and it is
excluded from every count and every report until somebody confirms it. Without this, "the machine
must not invent facts" is a wish. With it, an unconfirmed guess cannot quietly become a statistic.

This is the same failure we have already been bitten by elsewhere: a distillation step wrote its own
working codes into a record as though they were facts, and every downstream count believed them.

---

## 6. The three examples, worked

### A. "Hi"

```
RECORDED                             NOT RECORDED
Ahmed Muhamed      (provider)        interest      - he did not say
Instagram          (provider)        programme     - he did not say
17 Sep 21:30       (provider)        start date    - he did not say
sender id 1784...  (provider)        education     - he did not say
qualification: RAW CONTACT
```

- Appears in Marketing's intake. **No notification to Admissions. None.**
- It is **not** a lead. The person record exists as a contact so it cannot disappear, and it is
  searchable by name, by channel and by date.
- If thirty of these arrive on a Tuesday: thirty rows for Marketing, **zero** notifications for Ieva.

### B. "Hi, I'm interested in studying Navigation. I finished secondary school and want to start next year. Can you tell me the price?"

```
EXTRACTED (all marked `extracted`, all awaiting confirmation)
  interest   : Navigation
  education  : secondary school, finished
  start      : next year
  question   : tuition
PROPOSED     : qualification HOT, route to Admissions
```

The machine **proposes**. It does not route. Tetiana (or whoever the qualification owner is) presses
confirm, and only then does Admissions get a notification. If she corrects "Navigation" to something
else, that correction is a normal history entry with old and new values, as every correction already is.

### C. "Hi, I'm interested in studying Navigation. Can you give me more information?"

```
EXTRACTED            MISSING, AND SAID SO ON THE SCREEN
  interest: Navigation      start date      - not mentioned
  intent  : information     education       - not mentioned
                            contact details - none given
```

**Creation is not blocked by what is missing.** The record shows what is known and names what has to
be clarified, so the next conversation has an agenda. "Missing" is a first-class thing the screen
shows, not an empty box the reader has to notice.

---

## 7. The Warm / Hot threshold - NOT decided here

This needs an owner decision. What follows is only the shape of the question, so it can be answered.

The signals available from a message are:

| Signal | Present in "Hi"? | In example B? |
|---|---|---|
| a named programme of interest | no | yes |
| a start date or intake | no | yes |
| education background | no | yes |
| a concrete question (price, documents, dates) | no | yes |
| contact details we can use later (email/phone) | no | no |
| they answered a question we asked | n/a | n/a |

**The question to answer:** how many of these, or which of these, make somebody Hot?

Three ways it could be defined, all defensible, none chosen:

- **(a) A count.** Any three signals = Hot. Simple, and wrong at the edges.
- **(b) A required signal.** A named programme plus any one other = Hot. Programme is the thing
  Admissions actually needs.
- **(c) Purely human.** The machine proposes, the qualification owner decides every time, and the CRM
  records their decision. No rule at all.

**(c) needs no decision to start and produces the evidence to choose (a) or (b) later.** That is worth
saying, but the choice is the owner's.

---

## 8. Notifications

The whole point. Notification fatigue is the failure mode this design exists to prevent.

| Level | Who sees it | Who is notified |
|---|---|---|
| **Raw contact** | Marketing's intake workspace. Searchable by everyone. | **Nobody.** It appears in a list. It does not interrupt anyone. |
| **Warm lead** | the qualification owner (Marketing today) | the qualification owner |
| **Hot lead** | Admissions | **Admissions, properly.** This one means something. |
| Archived | still searchable, with the reason and who archived it | nobody |

Two supporting rules, both aimed at the same crack:

- **A raw contact that nobody has touched for N days is surfaced to the qualification owner**, not as
  a notification but as an ageing list. Nothing rots quietly. N is an open decision.
- **Queue depth is a management number.** If Marketing's intake is 400 deep, that is visible before it
  becomes a lost applicant, not after.

---

## 9. What we store, and what that costs us

**Decided: the CRM does not store full Instagram / Facebook / WhatsApp / Gmail conversation bodies in
V1.**

Stored per inbound contact:

- person / contact identity
- source channel
- timestamp
- channel or thread identifier, where the provider gives one
- qualification level and its history
- extracted structured information, with provenance (§5)
- operator notes
- who processed it
- next action
- routing and owner
- audit information

**What this costs us, stated plainly:**

1. **An extraction error becomes uncheckable.** We keep our *reading* of the message but not the
   message. If the machine extracts "Navigation" and the applicant wrote "not Navigation", there is
   nothing left to check it against.
2. The operator who picks the record up later cannot see what was actually said. They go to Instagram
   or Gmail and read it there, which means the context lives in two places.
3. "Preserve full message context", which the first version of this document listed as a reason to
   prefer the queue, is no longer one of its advantages.

**This is a real trade-off and it is worth one more decision** (listed in §13): do we keep the message
body *until the qualification decision is made*, and delete it after? That would make the extraction
checkable at the only moment anybody needs to check it, and still store nothing long term.

**Not doing so is a legitimate choice.** It is not a mistake. It just has to be a choice rather than an
accident.

---

## 10. Threads, and how a later message finds the right person

```
PERSON  (Ahmed Muhamed)
  └── CONVERSATION  (Instagram, sender id 1784...)
        └── the messages stay in Instagram; the CRM keeps the key and the extracted facts
  └── CONVERSATION  (Email, thread 18f3c...)
  └── ACTIVITY  call logged by Ieva
  └── NEXT ACTION  "Send the programme description", due tomorrow
```

| Channel | The key that holds a conversation together |
|---|---|
| Gmail | `threadId` - stable, survives replies |
| Instagram | Instagram-scoped sender id |
| Facebook | page-scoped sender id (PSID) |
| WhatsApp | phone number in international format |
| **LinkedIn** | **UNKNOWN. No research has been done. See §11.** |
| **TikTok** | **UNKNOWN. Named 23.09.2026, nothing checked. Marketing only.** |
| Mailchimp | email address |
| Website form / Open Day / Agent | no conversation, a single submission |
| Phone | phone number |

**Storing the thread key on day one is the single most important technical decision in this document.**
It is also now the *only* link back to what was said, because we are not keeping the bodies. Without
it, every later message is an orphan and the original conversation is unfindable.

A warning already proved in the prototype: an Instagram or Facebook sender id is **not** an email or a
phone. Somebody who writes on Instagram and later fills in the website form is two records until a
human links them. The intake queue is where that link gets made.

---

## 11. LinkedIn - a new channel with zero research

LinkedIn appeared in this clarification. It is **not** in `config/providers.json`, it has had **no
research**, and nothing is known about it:

- whether LinkedIn provides any inbound webhook or API for page or personal messages: **UNKNOWN**
- whether there is a stable conversation key: **UNKNOWN**
- what approval or partnership tier is required: **UNKNOWN**
- whether it is a company page, Tetiana's personal profile, or both: **UNKNOWN, and an internal question**

It has deliberately **not** been added to the researched channel config, because putting it there
would make it look investigated when it is not. Questions are in
[PROVIDER_QUESTIONS.md](PROVIDER_QUESTIONS.md).

Working assumption until research says otherwise: LinkedIn messaging is the **least** likely of the
four social channels to have a usable inbound API, and is the most likely to need manual capture.

---

## 12. What to build, in order, after approval

1. **The intake table and the intake screen.** Nothing connected. Items pushed in by hand, to walk
   Tetiana and Ieva through the real workflow.
2. **Qualification: raw / warm / hot**, with provenance on every extracted field, and the routing and
   notification rules of §8.
3. **Conversations**, storing the thread key. No bodies.
4. **One easy real channel: the website form.** Our own endpoint, no provider approval, full data.
5. **Gmail**, where the real volume is and the thread key is excellent.
6. **The Meta channels**, in whatever order App Review allows.
7. **LinkedIn**, once anybody knows whether it is possible.

---

## 13. Open questions this design cannot answer by itself

Also in `docs/DECISIONS.md`.

1. **The Warm / Hot threshold.** §7 sets out the question. It is the owner's answer.
2. **The stage list**, and how raw / warm / hot relate to it. Everything about ownership waits here.
3. **Do we keep a message body until the qualification decision, then delete it?** §9. Without it an
   extraction error is uncheckable.
4. **Who is the qualification owner when Tetiana is away?** A ladder with one person on the middle
   rung is a ladder with a single point of failure.
5. **How many days before an untouched raw contact is surfaced?** §8.
6. **Is a next action assigned to a role or to a person?** Still open from the previous round.
7. **Retention**: how long do we keep archived intake items and extracted data?
8. **Merging** two records that turn out to be one human. Needed, not designed.
9. **TeleGroup**: does a post-call event exist and what does it carry?
10. **Mailchimp plan**: Standard or Premium, or there are no webhooks.
11. **Who owns the Facebook page and the Meta business portfolio?**
12. **Is there a spare phone number** for WhatsApp?
13. **LinkedIn**: is any inbound integration possible at all?
