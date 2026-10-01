# edu@novikontas.org into Intake

Owner: Marina. **Option B chosen by Ritvars, 01.10.2026** (replaces A, 30.09): edu@ signs in once and
approves read-only access. No admin console step, no domain-wide delegation.

## 1. What we want to receive

Every new email that arrives in **edu@novikontas.org**, so a study enquiry by email lands in Intake
like a call or a form does. Only that one mailbox. Intake reads; it never sends, deletes or marks
anything.

## 2. What you do (about 2 minutes)

1. Ritvars sends you a link. It works for 48 hours.
2. Open it. Google asks you to sign in: choose or sign in as **edu@novikontas.org** (not your own account).
3. Google shows "Intake wants to read your email messages and settings" (read-only). Press **Allow**.
4. The page says **"edu@novikontas.org is connected to Intake, read-only."** You can close it.

If the page says you signed in as another account, open the link again and choose edu@.
Nothing is kept from any other account.

## 3. What we provide

- The link (Ritvars opens `https://crm-novikontas.vercel.app/api/admin/gmail/link` while signed in
  to Intake as an admin, and copies the link on that page).
- No secret is ever sent to you. Google keeps the approval; Intake keeps a read-only key to edu@,
  encrypted. To stop it at any time: edu@'s Google Account > Security > Third-party connections >
  Intake > Remove access.

## 4. The fields we read

From the Gmail API, per message: `id`, `threadId`, the `From`, `Subject` and `Date` headers, the
plain-text body, and the names and sizes of attachments (never their contents).

The body is kept only until somebody in Admissions decides what the email is, then deleted.

## 5. Where it stands

- Built and tested on branch `lane/channels`: the link, the sign-in, only edu@ kept, the daily read
  into New Leads since the last good run. **Not deployed yet**, so the link does not exist yet.
  Ritvars sends it after the deploy, never before.
- Tested only with test messages. **No real email has been read.**
- Then: Intake reads edu@ once a day (05:30 UTC) and on the Run button.
- Not built: training@novikontas.org as a second mailbox (course leads, Liva Mihailova's department).

## 6. What you will see once it is on

A new email to edu@ appears in **New Leads** labelled Email, with the sender's name and address and
the subject. Nothing changes in the mailbox itself: the email stays there, unread if it was unread.
