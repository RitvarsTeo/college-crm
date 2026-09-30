# Mailchimp into the Academy CRM

For: Ritvars. 30.09.2026. **Set up 30.09, in test mode.** Nothing for anybody to do.

## 1. What we receive

Subscribe, unsubscribe, profile update and cleaned events from the Novikontas audience
(`c6ab4facba`, 2,773 people on 30.09).

## 2. What was set up (30.09, on Ritvars' yes)

- Checked through the Mailchimp API: paid monthly plan, one audience, webhooks available, none there before.
- A new secret was generated and put straight into Vercel as `MAILCHIMP_WEBHOOK_SECRET`. It was never
  shown or written anywhere. `CHANNEL_MODE_MAILCHIMP=test`.
- Webhook `c9a1dc71dd` registered on the audience: events subscribe, unsubscribe, profile, cleaned;
  sources "by a subscriber" and "by an account admin". "By the API" is off, so the Client Hub's own
  changes do not come back in. "Email changed" is off because our side cannot read it yet.
- Production redeployed with the same build; the address answers Mailchimp's check (200) and refuses
  a wrong secret (401).

## 3. The address

`https://crm-novikontas.vercel.app/api/inbound/mailchimp?s=<secret>`. Mailchimp signs nothing, so the
full address is itself a secret: never paste it into email, chat or a document.

## 4. The fields we read

Form-encoded: `type`, `fired_at`, `data[id]`, `data[email]`, `data[merges][FNAME]`, `data[merges][LNAME]`.

## 5. Still open

- No real Mailchimp event has arrived yet; the first one proves it.
- A new subscriber lands in New Leads, although a subscriber is not a lead.
- Switch to live once the first real events look right.

## 6. What you see

Each event appears in **New Leads** labelled Mailchimp, with the email, the name and whether they
subscribed or unsubscribed, matched to the person if we hold them.
