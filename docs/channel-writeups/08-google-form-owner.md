# The website's "Application form" (a Google Form) into the Academy CRM

For: Oksana, or whoever created the form. From: Ritvars. 30.09.2026.

## Which form this is

Checked on the live website 30.09: the **"Application form"** button on the Study programmes page,
in both languages (`novikontas.org/college/lv/macibu_programmas` and
`novikontas.org/college/en/study_programs`), opens a Google Form. The form only opens after a Google
sign-in, so its questions could not be read from outside. Every other form on the college pages is a
Tilda form (see the website form write-up).

## 1. What we want to receive

Every new response to that form, the moment it is submitted.

## 2. What you set up

1. Tell Ritvars who created the form, and whether it stays now that applications also go through
   apply.novikontas.org.
2. Open the form's script editor and paste a short script Ritvars' developers send you. It runs on
   each submit and posts the answers to our address.
3. Approve the one permission box Google shows. About 15 minutes at a computer.

## 3. What we provide

- Address: `POST https://crm-novikontas.vercel.app/api/inbound/google_form`
- Header: `x-crm-secret: <the secret>`. The secret goes into the script's Properties, not the script
  text, and Ritvars enters it with you in person. Setting name on our side: `GOOGLE_FORM_SECRET`.
- The script itself: written and tested (`scripts/google-form/Code.gs`, 0800af3). We paste it in
  with you.

## 4. The fields

`responseId`, `timestamp`, `formId`, and `answers` keyed by the question titles. Today we look for
the titles `Vārds uzvārds`, `E-pasta adrese`, `Tālrunis`, `Programma`, `Studiju forma` and
`Piekrītu saņemt informāciju par studijām`. **Please send the exact titles on the form;** those are
our guess.

## 5. What we already found

- Our side is built and tested with test responses only. **No real response has ever reached the CRM.**
- Google does not retry if our address is down; the answers stay in the form and can be re-read.

## 6. What you will see once it is on

Each response appears in **New Leads**, matched to the person if we already hold them. Nothing
changes on the form.
