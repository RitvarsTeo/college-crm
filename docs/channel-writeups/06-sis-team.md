# The SIS applicant feed into the Academy CRM

For: the SIS team (sis.novikontas.org). From: Ritvars. 30.09.2026.

This is an integration, not a channel: the CRM asks the SIS, the SIS never sends to us.

## 1. What we want to receive

Every applicant who registers or changes status in the SIS, so Admissions sees in the CRM that a
lead has started an application, submitted it, been admitted or matriculated.

## 2. What you set up

Nothing more. Your applicant feed and the token you issued are all we need, and they work.
One optional question in section 5.

## 3. What we provide

- We call `GET https://sis.novikontas.org/api/v1/crm/applicants` with `since` and `cursor`, exactly
  as your document of 28.09 describes, from our server only.
- The token is sent in the `Authorization: Bearer` header, never in a URL, and is kept in our server
  settings (`SIS_API_TOKEN`). It never appears in a browser, a log or a document.

## 4. The fields we read

`reference` (our key for the person), `applicationId`, `givenName`, `familyName`, `email`, `phone`,
`programmeCode`, `programmeName`, `status`, `registeredAt`, `submittedAt`, `changedAt`.

## 5. What we already found, and our question

- Running since 29.09.2026 in **test mode**, once a day at 08:00 Riga time. The first run fetched 6
  applicants and stored 6. None of them was in the CRM before.
- Your feed answered as documented: the statuses, the dates and the paging.
- We will move to every 5 minutes, well inside your 60 calls a minute.

Our one question, optional: **could the SIS (or apply.novikontas.org) call an address of ours the
moment somebody starts an application?** Only `reference`, `applicationId` and `status: "started"`,
with a secret we hand over in person. Then the CRM would show it at once instead of on the next run.
If not, nothing breaks; we keep reading the feed.

## 6. What changes once it is on

For you, nothing. In the CRM, a person who applies shows "Application form started" and later
"Matriculated" on their record automatically, matched by email or phone. An applicant the CRM has
never seen goes to New Leads for Admissions to confirm.
