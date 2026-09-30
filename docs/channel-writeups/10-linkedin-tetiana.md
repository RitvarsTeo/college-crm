# LinkedIn lead forms into the Academy CRM

Owner: Tetiana. **Tetiana only gives Ritvars admin access to the company page; Ritvars creates the
app and the token himself** (30.09). This file is our setup checklist.

## 1. What we want to receive

Every LinkedIn Lead Gen Form filled in on a Novikontas advert or the company page. Not direct
messages: LinkedIn offers no way to receive those for a page like ours that we know of.

## 2. What you set up

1. Confirm it is the **Novikontas company page** (not a personal profile) and that you are its admin.
2. In the LinkedIn developer portal, create an app linked to the company page.
3. Request the **Lead Sync** product and its webhooks use case. LinkedIn approves it; until then the
   Webhooks tab does not appear.
4. Once approved, register the address below and subscribe the lead forms.

## 3. What we provide

- Address: `https://crm-novikontas.vercel.app/api/inbound/linkedin`. LinkedIn checks it with a
  challenge when you register it (and again every few hours); the CRM answers.
- The app's **Client Secret** is needed on our server. Enter it with Ritvars in person, never by
  email or chat. Setting name: `LINKEDIN_CLIENT_SECRET`.

## 4. The fields we read

From the notification: `leadGenFormResponse` and `occurredAt`. The answers themselves (name, email)
are fetched from the Lead Sync API afterwards.

## 5. What we already found

- Our side receives and checks the notification; tested with test events only. **No real LinkedIn
  event has ever reached the CRM.**
- Built, NOT deployed (Session B branch `feat/channel-gaps-2026-09-30`, 4f40f78): the name, email and phone are fetched from Lead Sync
  after the notification, with a daily retry. Needs the app's token: `LINKEDIN_ACCESS_TOKEN`.
- Questions for you: roughly how many leads a week, and are lead forms used at all today?

## 6. What you will see once it is on

A LinkedIn lead appears in **New Leads** labelled LinkedIn, with the name, email and phone.
