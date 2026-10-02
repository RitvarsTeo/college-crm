# Channel reconciliation - 02.10.2026

The gate before any more Channel UI. Written because the Channels screen was showing a
channel universe that disagrees with decisions already recorded, and because
`config/channels.json` was being treated as authoritative when it is not.

**The rule this establishes: `channels.json` is a description of adapters we have written.
It is not the list of channels the product has. A later recorded decision outranks it, and
where they disagree the CONFIG is the thing that gets fixed, not the screen.**

Statement kinds (P1): [seen] evidence read today, [decided] Ritvars's decision, [guess] hypothesis.

## The lifecycle this sits in

[decided] Ritvars, 02.10.2026:

```
Channels -> INTAKE -> qualification / follow-up -> apply.novikontas.org -> payment -> SIS
```

A channel is a way a **person first reaches us**. Everything after qualification is downstream
and belongs to another lane.

## CURRENT ACTIVE CHANNELS

Twelve. Ten need a connection, one is by hand and is finished, one has no credential defined.

| # | Channel | Owner | Access / credential | Production configured | Live verified | Real blocker |
|---|---|---|---|---|---|---|
| 1 | Website enquiry form (Tilda) | **Ritvars** sets it up; Oksana gave access | `WEBSITE_FORM_SECRET` + Tilda webhook | **No** [seen 01.10] | No | None. The steps are known and nobody has done them |
| 2 | Email (Gmail) | Marina | option B: `GMAIL_OAUTH_*` | **No** [seen 01.10]. `GMAIL_SERVICE_ACCOUNT_JSON` IS set, which is option A | No | Marina's twenty minutes, and the four option-B faults in CHANNELS_LANE_2026-10-01 |
| 3 | Facebook | Oksana | `META_APP_SECRET` | **No** [seen 01.10] | No | **APP REVIEW.** Weeks, and it can be refused |
| 4 | Messenger | Oksana | `META_APP_SECRET` | **No** [seen 01.10] | No | APP REVIEW |
| 5 | Instagram | Oksana | `META_APP_SECRET` | **No** [seen 01.10] | No | APP REVIEW |
| 6 | WhatsApp | Oksana | `META_APP_SECRET` | **No** [seen 01.10] | No | APP REVIEW. The number +371 23111114 is settled [decided 24.09] and is NOT a blocker |
| 7 | Mailchimp | Ritvars | `MAILCHIMP_WEBHOOK_SECRET` | **Yes** [seen 01.10], mode set | Not verified | None. Paste the address into the audience webhook |
| 8 | Phone (TeleGroup PBX) | Ritvars | `PBX_API_TOKEN` | **Yes** [seen 01.10], `CHANNEL_MODE_PHONE` set | Not verified today | None known. The token is in Production |
| 9 | LinkedIn | Tetiana | `LINKEDIN_CLIENT_SECRET` | **No** [seen 01.10] | No | A developer app with an APPROVED webhooks use case |
| 10 | TikTok | Tetiana | `TIKTOK_CLIENT_SECRET` | **No** [seen 01.10] | No | A developer app with webhook access |
| 11 | In person | nobody, by design | none | n/a | n/a | **None. This channel is finished.** `manual_only` is the design, not a gap |
| 12 | Agent or partner | **nobody named** | `AGENT_TOKENS`, shape not defined | No | No | Nobody has named which partner we start with. That is the blocker, and it is a question, not work |

## DROPPED

**Google Form.** [decided] Ritvars, 01.10 and again 02.10: dropped.

It must not appear as waiting, not configured, pending, blocked, or needing an owner. The
adapter and the Apps Script remain in the repository and are harmless; what changes is that the
product no longer has this channel. `config/channels.json` still carried it as
`waiting_for_external_access` with an unnamed owner, which is the stale resource this document
fixes.

## PARKED

**Open Day.** [decided] Ritvars, 30.09, in `docs/channel-writeups/04-open-day-aigars.md`:
*"Parked 30.09 by Ritvars: do not send yet."* Our end is prepared; it connects when the Open Day
project is deployed on Vercel.

It must not appear as an active channel waiting for Aigars, and **Aigars must not be shown as
holding a blocker.** It stays in internal documentation as explicitly parked.

## DOWNSTREAM - NOT A CHANNEL

**apply.novikontas.org.** It sits AFTER qualification in the lifecycle above. It is not a way a
person first reaches us, so it is not an inbound channel and does not belong on a connection
board. The **Applications lane** owns the application and dashboard experience.

The website form is **not** apply. [seen] `docs/channel-writeups/03-website-form-oksana.md` is
titled *"The website enquiry form (Tilda) into Intake"*: a study **enquiry** form on the Tilda
website, posting to `/api/inbound/website`. [seen 30.09] the "Application form" button on the
Study programmes page opened a **Google Form**, and every other college form is Tilda. So the
enquiry form is a genuine inbound channel; the application form was the dropped Google Form.

**SIS** is an integration, not a channel: we pull from it on a schedule, nothing is delivered to
us, and there is no adapter. It already lives in `integrations`, apart from the channel register
[seen `src/inbound.js`]. It is downstream in the lifecycle. It may be shown where somebody looks
to see whether anything is arriving, but it is **not counted in the channel universe**.

## OWNERS - corrected

| Channel | Config said | Correct | Source |
|---|---|---|---|
| Website enquiry form | Oksana | **Ritvars** | `03-website-form-oksana.md`, 01.10: "Oksana gave access; **Ritvars sets it up himself** (he has Tilda access)" |
| Open Day | Aigars | **nobody - it is parked** | `04-open-day-aigars.md`, 30.09 |
| Google Form | nobody named | **n/a - dropped** | Ritvars, 01.10 and 02.10 |

Unchanged and correct: Oksana (the four Meta channels), Marina (Email), Ritvars (Mailchimp,
Phone, and SIS as an integration), Tetiana (LinkedIn, TikTok).

## PRODUCTION vs LOCAL - the four states that were being conflated

A local checkout has no secrets, so **every** channel reads "not configured" locally. That says
nothing about production and must never be printed as though it did.

| State | What it means | How it is known |
|---|---|---|
| **Local** | this machine's environment | `process.env` here. Always empty. Worth nothing |
| **Deployed** | the code for the adapter is in the running deployment | the commit that is live |
| **Production configured** | the secret and mode are set in Vercel Production | `vercel env ls` [seen 01.10] |
| **Live verified** | a real provider event has actually arrived | `inbound` rows with `source='provider'` |

[seen 01.10, `vercel env ls`] **Production configured:** `PBX_API_TOKEN`, `CHANNEL_MODE_PHONE`,
`MAILCHIMP_WEBHOOK_SECRET`, `CHANNEL_MODE_MAILCHIMP`, `SIS_API_TOKEN`, `CHANNEL_MODE_SIS`,
`GMAIL_SERVICE_ACCOUNT_JSON`, plus sign-in and cron secrets.
**Not set:** any `GMAIL_OAUTH_*`, `META_*`, `LINKEDIN_*`, `TIKTOK_*`, and Tilda's
`WEBSITE_FORM_SECRET`.

**Live verified: nothing, as far as this document can prove.** The Pin [30.09] records `inbound`
holding 15 rows, all `source=simulated`, **0 from a real provider**. That has not been re-read
against production today and this document does not claim it either way. **Phone and Mailchimp
are production CONFIGURED, which is not the same as live verified, and the screen must not say
"live" until a provider row exists.**

## THE COUNT

**12 active channels.** Not 14, and not 15.

- 14 was `channels.json` including the dropped Google Form and the parked Open Day.
- 15 added SIS, which is an integration and not a channel.

Of the 12: **1 finished** (In person, by hand), **2 production configured** (Phone, Mailchimp),
**8 awaiting a connection**, **1 awaiting a decision** (Agent: nobody has named the partner).

## WHAT GETS FIXED

The resource, not the screen. `config/channels.json` gains an explicit lifecycle per channel
(`active` / `parked` / `dropped`) carrying the decision and its date, so the UI reads the
decision instead of inferring intent from `readiness` - which only ever meant "is our side
technically ready", never "do we want this".

## FOUND BUILDING THE SCREEN - one more resource question, not taken

`config/channels.json` defines `blockerKind` itself:

> question = somebody outside has to answer and the answer may be no.
> work = the steps are known and nobody has done them yet.

Reading that honestly, **only Agent is waiting on an answer**. Phone carries an
`externalBlocker` whose own first words are *"Nothing from TeleGroup"* and is marked `work`,
and it was being drawn as blocked outside - which is how a channel whose token is already in
Production came to look like somebody else's problem. That is fixed: the screen now reads
`blockerKind` instead of treating any recorded blocker as a dependency.

**But the four Meta channels are marked `work` too, and APP REVIEW can be refused.** By the
config's own definition that is a `question`, not work. Changing it moves Facebook, Messenger,
Instagram and WhatsApp out of "steps known, not done" and into "waiting on an answer", and it
would require an owner in `prototype.json -> openQuestions`, which a test enforces.

**Not changed here.** It is a judgement about whether Meta's review is a dependency or a chore,
and it changes what four channels claim. For Ritvars:

1. **Mark the Meta four as `question`** and add the open question with an owner. Truthful about
   the risk; adds a question to a list that is meant to stay short.
2. **Leave them as `work`.** They sit with the ordinary steps; the screen understates that Meta
   can say no.
3. **A third kind, `approval`** - the steps are known AND an outsider can still refuse. More
   honest than either, and it is a change to the vocabulary, so it is a decision not a fix.
