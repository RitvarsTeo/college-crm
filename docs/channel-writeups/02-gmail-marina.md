# edu@novikontas.org into the Academy CRM

Owner: Marina (Google Workspace administrator). **Option A chosen; Marina's steps sent 30.09**
(MESSAGES_TO_CHANNEL_OWNERS.md).

## 1. What we want to receive

Every new email that arrives in **edu@novikontas.org**, so a study enquiry by email lands in the
CRM like a call or a form does. Only that one mailbox. The CRM reads; it never sends, deletes or
marks anything.

## 2. What you set up

Ritvars and you first choose one of two ways. Both give read-only access.

| | A. Domain-wide delegation | B. Sign-in on the one mailbox |
|---|---|---|
| What you do | Admin console > Security > Access and data control > API controls > **Domain-wide delegation** > Add new: the Client ID Ritvars gives you, scope `https://www.googleapis.com/auth/gmail.readonly` | Sign in once as edu@ and approve read-only access for the CRM |
| What it can reach | Technically any mailbox in the domain; the CRM chooses edu@ | Only edu@ |
| Time | About 20 minutes | About 10 minutes, but needs a code change first |

The CRM is built for **A** today. Tell Ritvars which one you are comfortable with.

Also: who creates the Google Cloud project that holds the CRM's service account, and under which
billing? It costs nothing at this volume.

## 3. What we provide

- For A: the service account's **Client ID** (a long number; not secret, fine to send).
- The key file of that service account is set on our server by Ritvars himself. It is never emailed
  or put in a shared drive. Setting name, for reference: `GMAIL_SERVICE_ACCOUNT_JSON`.

## 4. The fields we read

From the Gmail API, per message: `id`, `threadId`, the `From`, `Subject` and `Date` headers, the
plain-text body, and the names and sizes of attachments (never their contents).

The body is kept only until somebody in Admissions decides what the email is, then deleted.
What stays is the structured record (name, email, programme asked about).

## 5. What we already found

- Answered: you are the Workspace administrator (25.09).
- Done 30.09: service account `intake-mail-reader@novikontas-academy-crm.iam.gserviceaccount.com`,
  Client ID `116501730766051915222`, Gmail API on; its key is in Vercel as `GMAIL_SERVICE_ACCOUNT_JSON`
  (Secret). The channel stays **off** until access is granted.
- Built, NOT deployed (Session B branch `feat/channel-gaps-2026-09-30`): the job is on the daily schedule, puts mail into New Leads
  and reads everything since its last good run (8e5717d). The live version reads and keeps nothing.
  Option B (sign in once as edu@) is built too (57222df), not chosen.
- Not built yet: training@novikontas.org as a second mailbox (course leads, to Liva Mihailova's
  department); asked of Session B 30.09. Google needs nothing more for it.
- Tested: only with test messages. **No real email has ever been read.**
- Blocking: Marina's approval, then the deploy.

## 6. What you will see once it is on

A new email to edu@ appears in **New Leads** labelled Email, with the sender's name and address and
the subject. Somebody we already know is matched by email address. Nothing changes in the mailbox
itself: the email stays there, unread if it was unread.
