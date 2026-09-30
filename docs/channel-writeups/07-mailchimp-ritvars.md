# Mailchimp into the Academy CRM

For: Ritvars (you hold the Mailchimp access). 30.09.2026. Not on the MVP map: parked until you say.

## 1. What we want to receive

Subscribe, unsubscribe, profile update and cleaned events from the Novikontas audience
(`c6ab4facba`), so we see in the CRM who subscribed or left the newsletter.

## 2. What you set up

Audience > Settings > Webhooks > Create new webhook: the address below; events Subscribes,
Unsubscribes, Profile updates, Cleaned address; sources "by a subscriber" and "by an account admin".
Leave "by the API" off.

## 3. What we provide

- Address: `https://crm-novikontas.vercel.app/api/inbound/mailchimp?s=<the secret>`
- Mailchimp signs nothing, so the secret sits in the address. **The full address is therefore a
  secret itself**: type it in yourself, never paste it into email or chat. Setting name:
  `MAILCHIMP_WEBHOOK_SECRET`.
- Mailchimp checks the address with a GET when you save; the CRM answers it.

## 4. The fields we read

Form-encoded: `type`, `fired_at`, `data[id]`, `data[email]`, `data[merges][FNAME]`,
`data[merges][LNAME]`.

## 5. What we already found

- Answered 24.09: the plan includes webhooks; the audience has none today.
- Built and tested with test events only. **No real Mailchimp event has ever reached the CRM.**
- Known gap: a new subscriber currently lands in New Leads, although a subscriber is not a lead.

## 6. What you will see once it is on

Each event appears in **New Leads** labelled Mailchimp, with the email, the name and whether they
subscribed or unsubscribed, matched to the person if we hold them (see the gap above).
