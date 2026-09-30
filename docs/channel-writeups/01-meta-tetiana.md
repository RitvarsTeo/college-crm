# Facebook, Messenger, Instagram and WhatsApp into the Academy CRM

For: Tetiana, Meta Business Suite administrator. From: Ritvars. 30.09.2026.

All four run through **one Meta app**. You set it up once and get four channels.

## 1. What we want to receive

Every new message a person sends us on the Facebook Page, on Instagram and on WhatsApp
(+371 23111114), and every Facebook or Instagram lead form someone fills in. Nothing we send, and
nothing from people who only like or comment.

## 2. What you set up at Meta

1. In Meta for Developers, create one app of type **Business**, owned by the Novikontas business
   portfolio.
2. Add the products **Webhooks**, **Messenger**, **Instagram** and **WhatsApp**.
3. **WhatsApp:** create the WhatsApp Business Account and register **+371 23111114** on it. The
   number cannot stay on the ordinary WhatsApp or WhatsApp Business phone app at the same time.
4. Complete **business verification** for Novikontas.
5. Register the four webhooks below, each with the verify token Ritvars gives you. Meta checks the
   address the moment you save it; if the save fails, tell Ritvars, do not retry with other values.
6. Subscribe the Page and the Instagram account to the app, and tick the fields in the table.
7. Request **Advanced Access** in App Review for the permissions Meta asks for, usually
   `pages_messaging`, `pages_manage_metadata`, `leads_retrieval`, `instagram_manage_messages` and
   `whatsapp_business_messaging`. Meta renames these from time to time; the names in the App
   Dashboard win. Review takes weeks and is often refused once. Send Ritvars the refusal text if it
   comes.

| Meta object | Callback address | Fields to tick |
|---|---|---|
| Page | `https://crm-novikontas.vercel.app/api/inbound/facebook` | `messages`, `leadgen` |
| Instagram | `https://crm-novikontas.vercel.app/api/inbound/instagram` | `messages` |
| WhatsApp Business Account | `https://crm-novikontas.vercel.app/api/inbound/whatsapp` | `messages` |

Only three addresses: Meta sends Page messages and Page lead forms to one address, and the CRM sorts
them, messages as Messenger and lead forms as Facebook.

## 3. What we provide

- The three addresses above. Meta sends a POST for each event; before that it sends one GET with
  `hub.challenge`, which the CRM answers.
- A **verify token**, handed to you by Ritvars in person. You type it into Meta. It is not emailed.
- Our side checks every event with the app's signature (`X-Hub-Signature-256`). For that Ritvars
  needs the **App Secret** from the app's Basic settings. Please read it out to him in person or
  enter it with him; never email it, paste it in chat or put it in a document.
- Setting names on our server, for reference only: `META_APP_SECRET`, `META_VERIFY_TOKEN`.

## 4. The fields we read

| Channel | From Meta's payload |
|---|---|
| Messenger, Instagram | `entry[].messaging[]`: `sender.id`, `recipient.id`, `timestamp`, `message.mid`, `message.text` |
| Facebook lead forms | `entry[].changes[]` with `field: leadgen`: `leadgen_id`, `form_id`, `ad_id`, `created_time` |
| WhatsApp | `entry[].changes[].value`: `messages[].id`, `from`, `timestamp`, `text.body`, `type`; `contacts[].wa_id`, `profile.name` |

## 5. What we already found

- Answered: you administer Meta Business Suite; Ieva, Laura, Tetiana and Marina have access; the
  Instagram account is Professional; the WhatsApp number is +371 23111114 (Marina, 24.09).
- Fixed on 30.09 and live: a delivery carrying several messages now keeps every one, not only the
  first.
- Tested: only with test events on our side. **No real Meta event has ever reached the CRM.**
- Still open on our side: a lead form arrives from Meta with ids only. The name, email and phone
  are fetched from Meta afterwards, and that fetch is not built yet (with Ritvars' developers).
- Blocking: the app, business verification and App Review. All yours at Meta.

## 6. What you will see once it is on

A new message or lead form appears in **New Leads** within seconds, labelled Facebook, Messenger,
Instagram or WhatsApp, with the text and whatever name Meta gives. A person we already hold is matched
by phone or email and not created twice. Genuine study interest goes to Ieva with a next step; you
reply to people in Meta Business Suite as today.
