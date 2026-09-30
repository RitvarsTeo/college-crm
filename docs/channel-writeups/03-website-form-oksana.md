# The website enquiry form into the Academy CRM

Owner: Oksana (website, Tilda). **Oksana only gives Ritvars Tilda access; Ritvars sets it up**
(30.09). Not built yet: accepting the secret inside the address and Tilda's own id (C8, asked of
Session B 30.09).

## 1. What we want to receive

Every enquiry somebody sends through the study enquiry form on the website, the moment they press
Send, together with the advert tags (utm) of the page they came from.

## 2. What you set up

The website is on **Tilda** (checked 30.09: the college pages' forms post to `forms.tildacdn.com`).
Tilda can hand each form submission on to a webhook address of ours, from Tilda's servers, so the
visitor's browser never sees the secret.

1. In Tilda, add our address as a **Webhook** form receiver and switch it on for the college enquiry
   forms.
2. Keep the `utm_...` tags from the landing page and let the form send them. Without them we cannot
   tell an Instagram advert from somebody who found us themselves.
3. Two questions before you start, because our side may need a small change:
   - Can Tilda's webhook send our secret as a request **header** called `x-crm-secret`? If it can only
     send it another way (a field, or in the address), tell Ritvars which.
   - Tilda's own id for a submission (we believe it is called `tranid`): please confirm the name.

## 3. What we provide

- Address: `POST https://crm-novikontas.vercel.app/api/inbound/website`
- Body: JSON (`Content-Type: application/json`) or a normal form post (`application/x-www-form-urlencoded`).
- Header: `x-crm-secret: <the secret>`. Ritvars gives you the secret in person. It is not emailed,
  not put in chat and not written in any document. On our side the setting is called
  `WEBSITE_FORM_SECRET`.

## 4. The fields

| Field | Needed | Meaning |
|---|---|---|
| `submission_id` | **yes** | A unique id per submission. A repeat of the same id is stored once, so a retry is safe |
| `submitted_at` | yes | Time of submission, ISO 8601, e.g. `2026-09-30T10:15:00Z` |
| `name`, `email`, `phone` | as filled in | The person |
| `message` | as filled in | What they wrote |
| `programme`, `study_form` | as filled in | What they ask about |
| `utm_source`, `utm_medium`, `utm_campaign`, `gclid` | when present | Where they came from |
| `consent_admissions`, `consent_marketing` | yes | The two tick boxes: `true` or `false` |

A submission without `submission_id` is refused, because we could not tell a retry from a new one.

## 5. What we already found

- Our side is built and tested with test submissions only. **No real website submission has ever
  reached the CRM.**
- Our side expects `submission_id` and the header above; Tilda may name and send them differently.
  Once you answer the two questions, the developers match our side to Tilda.
- The "Application form" button on the Study programmes page is a Google Form, not Tilda: that one
  has its own write-up.

## 6. What you will see once it is on

Nothing changes for the visitor. In the CRM the enquiry appears in **New Leads** labelled Website
form, with the programme already filled in and the advert source recorded. Somebody we already hold
is matched by email or phone and not created twice.
