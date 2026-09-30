# TikTok into the Academy CRM

For: Tetiana. From: Ritvars. 30.09.2026. On the MVP map as LATER: do not start before Meta is done.

## 1. What we want to receive

Whatever TikTok can send us about people interested in studying: messages or lead forms. **We do not
yet know which TikTok product carries them for our account.** Section 5 is the question to answer
first.

## 2. What you set up

After the questions are answered:

1. In the TikTok developer portal, create an app for the Novikontas account.
2. Get the events we need approved by TikTok.
3. Set the callback address below.

## 3. What we provide

- Address: `https://crm-novikontas.vercel.app/api/inbound/tiktok`.
- The app's **Client Secret** is needed on our server, to check each event. Enter it with Ritvars in
  person, never by email or chat. Setting name: `TIKTOK_CLIENT_SECRET`.

## 4. The fields we read

Every TikTok webhook event: `client_key`, `event`, `create_time`, `user_openid`, `content`. The
`Tiktok-Signature` header is checked, and an event older than five minutes is refused.

## 5. What we already found, and the questions

- Our side can receive and check a TikTok event; tested with test events only. **No real TikTok event
  has ever reached the CRM.** Reading names or messages out of `content` is not built.
- Questions for you:
  1. Is it a TikTok Business account, and are you its admin?
  2. What actually arrives there: direct messages, comments, or lead forms from ads?
  3. Roughly how many a week? If it is a handful, typing them in by hand stays the answer.
- To ask TikTok: which product and approval give a business account's messages or lead forms as a
  webhook?

## 6. What you will see once it is on

A TikTok event appears in **New Leads** labelled TikTok. Until the content is read, it says only
which kind of event arrived.
