# edu@novikontas.org into the Academy CRM

For: Marina, Google Workspace administrator. From: Ritvars. 30.09.2026.

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
- Built on our side and live since 30.09: the CRM reads the mailbox and puts new mail into New Leads.
  The channel is **off** until access is granted.
- Tested: only with test messages. **No real email has ever been read.**
- Still open on our side: the job that checks the mailbox is not on the schedule yet; it is added
  when you grant access (with Ritvars' developers).
- Blocking: the A or B choice, then your approval.

## 6. What you will see once it is on

A new email to edu@ appears in **New Leads** labelled Email, with the sender's name and address and
the subject. Somebody we already know is matched by email address. Nothing changes in the mailbox
itself: the email stays there, unread if it was unread.
