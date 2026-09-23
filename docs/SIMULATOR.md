# Channel integration simulator

Eleven fictional provider accounts inside the prototype. Every test button really runs the local
integration: a provider-shaped payload is built, authenticated the way the real provider
authenticates, normalised, mapped, resolved to a person, written to the CRM, and where the channel
supports it, answered. Nothing leaves this machine.

Open `http://localhost:8800` and go to **Integrācijas**.

## The honesty rule, enforced rather than promised

| | |
|---|---|
| **SIMULATED** | A fictional provider account behaving according to researched real-world rules. Every channel is here. |
| **PROVIDER-TESTED** | We connected to a provider sandbox and really sent or received something. **Nothing is here.** |
| **LIVE** | A real account is connected. **Nothing is here.** |

Every account label carries the word SIMULATED. The status chip never reads LIVE. The test suite
asserts that no channel claims `providerTested` or `live`.

## What each test button actually does

Press one and the console shows, for that single event:

1. **The path through the system** - provider, transport, authentication, normalise, mapping,
   idempotency, identity, CRM write, attribution, next action, consent. Each step says what
   happened, and a step that refused is marked.
2. **The raw payload** the fictional provider produced, in the provider's own shape.
3. **The mapping**, provider field by provider field, to the CRM field it became.
4. **The identity decision** - what was looked for, what matched, and the rule.
5. **The CRM result** - the person, the timeline entry, the next action.
6. **The outbound leg**, where the channel supports one, with the provider's simulated response.

Everything also lands in **Notikumu žurnāls**, the event inspector, with RAW, NORMALIZED, IDENTITY,
MAPPING, DECISION, CRM RESULT, OUTBOUND, PROVIDER RESULT and AUDIT.

## The accounts

| Channel | Fictional account | Mechanism simulated |
|---|---|---|
| Website form | Novikontas College Website - SIMULATED | HTTPS POST to our own endpoint |
| Google Form | Novikontas Admissions Form - SIMULATED GOOGLE ACCOUNT | **both** Apps Script trigger and Forms API watch |
| Gmail | edu@novikontas.org - SIMULATED GOOGLE WORKSPACE | **both** push via Pub/Sub and polling |
| Mailchimp | Novikontas Admissions - SIMULATED MAILCHIMP AUDIENCE | audience webhook, five event types |
| Facebook | Novikontas Maritime - SIMULATED PAGE, inside a SIMULATED META BUSINESS and APP | lead ads and page messages |
| Instagram | @novikontas.admissions - SIMULATED PROFESSIONAL ACCOUNT | direct messages on the same webhook |
| WhatsApp | Novikontas Admissions WhatsApp - SIMULATED BUSINESS ACCOUNT | Cloud API inbound, 24 hour window, outbound |
| Agent | Indian Partner - SIMULATED AGENT ACCOUNT | tokenised link |
| Open day | Novikontas Open Day - SIMULATED EVENT SYSTEM | booking, attendance, follow-up |
| Klātiene | **CRM Manual Quick Add - no provider account** | manual entry, plus QR as a separate channel |
| Phone | Novikontas Reception - SIMULATED TELEPHONY | manual log, plus a labelled preview of call events |

## The architectures that are genuinely different, and are shown as such

**Google Form.** The Apps Script installable form-submit trigger delivers the answers *with* the
notification. The Forms API watch does not: the Pub/Sub notification carries the form id and the
event type, and the answers come from a second call. Both paths are runnable and the console shows
the extra fetch on one of them. A Forms API watch lasts a week and must be renewed.

**Gmail.** `users.watch` publishes to Pub/Sub, and the push says only that the mailbox changed; the
message itself comes from `history.list` then `messages.get`. Polling `history.list` needs no
Pub/Sub at all. Both are runnable. A watch expires after 7 days, Google recommends renewing daily,
and the expired-watch test shows the failure mode: nothing arrives and nothing errors.

**Mailchimp.** No signature exists. Mailchimp does not sign its webhooks, so the control is an
unguessable URL, and the GET it sends when saving the webhook must answer 200. Webhooks require a
Standard or Premium plan; which plan Novikontas has is UNKNOWN.

**Meta.** One app, one webhook, three channels. Verification is a GET with `hub.challenge`; every
delivery carries `X-Hub-Signature-256`, an HMAC-SHA256 of the raw body with the app secret. Lead ads
need no messaging permission; messages need Advanced Access through App Review.

**WhatsApp.** The number must not be active on the ordinary WhatsApp app. Inbound opens a 24 hour
customer service window; inside it a reply is free, outside it an approved template is required and
is charged per message by the recipient's country. The exact Latvian rate is UNKNOWN here on
purpose: it must be read from Meta's current rate card.

**Phone.** No provider is confirmed, so the telephony webhook is present, labelled
NOT AVAILABLE / NOT CONNECTED UNTIL PROVIDER CONFIRMED, and refuses to write anything.

## Security and failure cases you can press

Wrong Meta verify token, unsigned delivery, invalid signature, duplicate delivery, malformed
payload, wrong Mailchimp URL secret, wrong Google Form shared secret, expired Gmail watch, expired
Forms watch, unknown agent token, an agent trying to relabel its own source, conflicting identity,
missing required field, and a message with no email and no phone.

## Identity, in one paragraph

Email first, then phone, then a provider handle, and a name never creates a match. Conflicting
identifiers go to review and merge nothing. A message with no identifier at all goes to review
rather than becoming half a person. A duplicate provider delivery produces one timeline entry.
`22193374` and `37122193374` are the same person.

## Attribution

First touch wins. The source is stamped once and locked, and a later Mailchimp event, WhatsApp
message or follow-up never rewrites it. The campaign journeys covered: instagram/paid,
facebook/paid, open day, agent, website, referral and QR.

## Consent and privacy, without pretending to be legal advice

The prototype records consent per purpose (admissions, marketing, analytics, advertising) with its
state, basis, source and timestamp, and shows it on the person. The Privātums screen separates
three things that are usually confused:

- **Technical requirement** - the Meta signature, the Gmail watch renewal, the Mailchimp GET.
- **Provider policy** - Meta's App Review expectations, Google's consent mode signals for EEA
  traffic (`ad_user_data`, `ad_personalization`), Mailchimp's plan requirement.
- **Legal consideration** - minimisation, purpose limitation, transparency, basis, withdrawal,
  retention, deletion, access and correction, audit trail, processors, transfers, security.

GDPR is not an equation with consent. The basis depends on the purpose, and the prototype does not
choose it: answering someone who asked about studying is usually not a consent case, while
marketing email is. Where consent is the basis it must be freely given, specific, informed and
unambiguous, and as easy to withdraw as to give.

## Metrics

The Metrika screen separates what the CRM knows from what a platform knows, and states the return
path plainly: no platform learns that somebody enrolled unless we tell it. For Google that path is
the Data Manager API, because offline conversion imports and enhanced conversions for leads are
being migrated there and blocked in the Google Ads API from 15 June 2026. For Meta it is the
Conversions API. Nothing is sent anywhere by this prototype.

## Running it

```
npm start                              # http://localhost:8800
node --test test/simulator.test.js     # 40 tests
```

Press **Palaist visu kanālu demo** in the sidebar to run all eleven channels in sequence and see the
tally, ending with production systems touched: 0.
