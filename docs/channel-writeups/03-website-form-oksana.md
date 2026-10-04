# The website enquiry form (Tilda) into Intake

Owner: Oksana gave access; **Ritvars sets it up himself** (he has Tilda access, 01.10.2026).

## 1. What we want to receive

Every enquiry somebody sends through a study enquiry form on the website, the moment they press
Send, with the advert tags (utm) of the page they came from.

## 2. What Ritvars does, after the deploy

In Vercel (Production), two settings, values typed by Ritvars only:
1. `WEBSITE_FORM_SECRET` = a long random value he makes (for example from Bitwarden's generator).
2. `CHANNEL_MODE_WEBSITE` = `test`. Redeploy.

In Tilda, for each college enquiry form:
1. Site settings > Forms > **Webhook**. Address:
   `https://crm-novikontas.vercel.app/api/inbound/website`
2. API key: field name `crm_secret`, value = the same secret. If Tilda offers "send in header", the
   header name is `x-crm-secret` instead. Either works.
3. Tick **Send cookies** (that is how the utm tags travel).
4. Save. Tilda sends a test; Intake answers `ok`, so Tilda accepts the address.
5. In each form block: Content > Receivers > tick the Webhook. Republish the page.

Then one real test: fill the form on the live site with your own name. It must appear in
**New Leads** labelled Website. When it does, set `CHANNEL_MODE_WEBSITE` = `live`.

## 3. The fields we read

Tilda's own id `tranid` (a retry is stored once), and these field names in any case:
`name`, `email`, `phone`, `comments` / `message` / `textarea`, `programme`; the utm tags from the
cookies or from fields called `utm_source`, `utm_medium`, `utm_campaign`; `consent_admissions`,
`consent_marketing` when the form has them. The secret field is removed before anything is stored.

## 4. Where it stands

- Built and tested on branch `lane/channels` (5759b7c): Tilda's format, `ok` reply, test request,
  secret as field or header. **Not deployed. No real submission has reached Intake.**
- The "Application form" button on the Study programmes page is a Google Form, not Tilda: see 08.

## 5. What you will see once it is on

Nothing changes for the visitor. In Intake the enquiry appears in **New Leads** labelled Website,
with the name, email, phone, message and where they came from.

## DECIDED 04.10.2026 - temporary, until the relaunch

Ritvars: the Website connection is only for the forms still live on the English college pages
(enquiry form on college/en and college/en/contacts; contact form on college/en/contacts, whose
second field is Company). The next website version has NO forms; when it goes live,
apply.novikontas.org does all the work and this channel is dropped.
