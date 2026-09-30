# The website enquiry form into the Academy CRM

For: Oksana, who maintains the website. From: Ritvars. 30.09.2026.

## 1. What we want to receive

Every enquiry somebody sends through the study enquiry form on the website, the moment they press
Send, together with the advert tags (utm) of the page they came from.

## 2. What you set up

1. When the form is submitted, the **website's server** sends one POST to our address, with the
   secret in a header. It must come from the server, not from the visitor's browser: anything the
   browser sends can be read by anyone who opens the page, secret included.
2. Keep sending the form's usual thank-you page. If our address does not answer, still show it and
   keep the submission on the website side, so nothing is lost.
3. Keep the `utm_...` tags from the landing page URL and send them with the form. Without them we
   cannot tell an Instagram advert from somebody who found us themselves.

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

- Nothing was blocking except this step. Our side is built and tested with test submissions only.
  **No real website submission has ever reached the CRM.**
- To agree with you: what the form's fields are called today, and whether the website can send
  from its server (step 1). If it cannot, tell Ritvars before building anything.

## 6. What you will see once it is on

Nothing changes for the visitor. In the CRM the enquiry appears in **New Leads** labelled Website
form, with the programme already filled in and the advert source recorded. Somebody we already hold
is matched by email or phone and not created twice.
