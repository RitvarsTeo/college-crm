# TikTok lead forms into Intake

Owner: Tetiana gives access; **we build the app and the connection** (30.09).

## 1. What we want to receive

Every **TikTok Instant Form** (Lead Generation) filled in on a Novikontas TikTok advert: name, email,
phone and the answers. Not direct messages or comments on the organic account: TikTok's lead
connection carries only ad lead forms.

## 2. What Tetiana does (about 10 minutes)

**A. Access.** In **TikTok Business Center** (business.tiktok.com > Users > Members > Invite member):
invite **Ritvars Vilcins** (his work email) and give him **Admin** on the Novikontas **ad account**.
If there is no Business Center, then in **TikTok Ads Manager** (ads.tiktok.com > Account settings >
User management): add him as **Admin**. Admin on the ad account is required: TikTok refuses to
connect forms for anyone below Admin. Access to the TikTok app or the posting account is not enough.

**B. Three answers:**
1. Does Novikontas run TikTok **Lead Generation** adverts with an Instant Form today, or did it ever?
2. Which forms are active now (their names in Ads Manager > Assets > Instant Form)?
3. Roughly how many leads a week, and where do they go today (downloaded by hand, or nowhere)?

If the answer to 1 is "no, people only write to us in messages": there is nothing for TikTok to
send us, and typing them into Intake by hand stays the answer until lead adverts start.

## 3. What we do after that

1. Create the TikTok for Business developer app (TikTok API for Business), ask for the **Leads**
   permission, and connect it to the ad account with Ritvars's Admin access.
2. Subscribe the active forms' leads to `https://crm-novikontas.vercel.app/api/inbound/tiktok`.
3. Send TikTok's test lead from Ads Manager; it must appear in New Leads with name and email.

## 4. Where it stands

- Our address receives and checks a TikTok event, and reads a name, email, phone or message plainly
  named in it (5de2a02, branch `lane/channels`, not deployed). **It was built for TikTok's developer
  webhook, not for ad lead forms**, so the lead payload still has to be matched once the first real
  test lead is in our hands. That is our work, after B.
- **No real TikTok event has ever reached Intake.**
- Waits on: Tetiana (A, B).

## 5. What you will see once it is on

A TikTok lead appears in **New Leads** labelled TikTok, with the name, email and phone.
