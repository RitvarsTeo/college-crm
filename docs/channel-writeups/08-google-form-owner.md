# The Google Form into the Academy CRM

For: whoever owns the admissions Google Form (not named yet). From: Ritvars. 30.09.2026.
Not on the MVP map: parked until the owner is named.

## 1. What we want to receive

Every new response to the form, the moment it is submitted.

## 2. What you set up

1. Tell Ritvars that you own the form, and whether it stays or the website form replaces it.
2. Open the form's script editor and paste a short script Ritvars' developers send you. It runs on
   each submit and posts the answers to our address.
3. Approve the one permission box Google shows. About 15 minutes at a computer.

## 3. What we provide

- Address: `POST https://crm-novikontas.vercel.app/api/inbound/google_form`
- Header: `x-crm-secret: <the secret>`. The secret goes into the script's Properties, not the script
  text, and Ritvars enters it with you in person. Setting name on our side: `GOOGLE_FORM_SECRET`.
- The script itself (not written yet).

## 4. The fields

`responseId`, `timestamp`, `formId`, and `answers` keyed by the question titles. Today we look for
the titles `Vārds uzvārds`, `E-pasta adrese`, `Tālrunis`, `Programma`, `Studiju forma` and
`Piekrītu saņemt informāciju par studijām`. **Please send the exact titles on the form;** those are
our guess.

## 5. What we already found

- Not answered since 23.09: who owns the form.
- Our side is built and tested with test responses only. **No real response has ever reached the CRM.**
- Google does not retry if our address is down; the answers stay in the form and can be re-read.

## 6. What you will see once it is on

Each response appears in **New Leads**, matched to the person if we already hold them. Nothing
changes on the form.
