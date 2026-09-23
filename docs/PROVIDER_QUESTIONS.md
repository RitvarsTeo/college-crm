# The exact questions to ask, per provider

Written 23.09.2026. Nothing in this file is an answer. These are the questions that have to be
asked before any integration can be designed honestly. Each one is phrased so it can be copied into
an email or read down a phone.

A question marked **BLOCKER** stops the channel entirely until it is answered.

---

## TeleGroup (the phone) - BLOCKER for the whole phone channel

We know the menu: **1 = Admissions, 2 = Student Coordinator, 3 = Marketing.** We know nothing else.
The prototype logs calls by hand and says so.

Ask TeleGroup, in this order:

**A. Does an event exist at all?**

1. When a call to our number ends, can your platform send an automatic notification to a web
   address we give you (a webhook / HTTP callback)? Yes or no.
2. If not a webhook, is there an API we can poll for recent calls? How often may we poll?
3. If neither exists, can we export call records, and in what format and on what schedule?

**B. What is in it?** For each field: does it exist, what is it called, and what does it look like?

4. The caller's phone number. In what format (`+371...`, `371...`, `8...`)? Is it ever withheld or
   anonymised?
5. **The menu button the caller pressed (1, 2 or 3).** This is the one that routes the call to the
   right department in the CRM, so it matters more than the rest.
6. A unique call id that stays the same if you resend the event.
7. Start time, answer time, end time. Which time zone?
8. Duration. Of the whole call, or of the answered part?
9. Whether the call was answered, missed, abandoned in the queue, or went to voicemail.
10. Which internal extension or agent took it.
11. Is there a recording, and if so, is there a link, and how long is it kept?
12. Anything else the event carries that we have not asked about.

**C. How do we trust it and keep it running?**

13. How do we verify the notification really came from you (a shared secret, a signature, an IP
    allow list)?
14. If our endpoint is down, do you retry? How many times, over how long?
15. Is there a test or sandbox environment so we can build without touching real calls?
16. Are there rate limits?

**D. Money and contract.**

17. Is this included in what Novikontas already pays, or is it an extra? How much?
18. What notice do you need, and how long does it take to switch on?
19. Who at TeleGroup is the technical contact for this?

**E. Outbound, for later.**

20. Can we trigger an outbound call from our system (click to dial)? Not needed for V1.

---

## Gmail (edu@novikontas.org)

Internal questions, for Novikontas IT, not for Google.

1. Who administers the Google Workspace domain, and will they authorise domain-wide delegation for a
   service account? **BLOCKER.**
2. Which mailbox or mailboxes are in scope? Only `edu@`, or also personal mailboxes?
3. Is there an existing Google Cloud project to use, or does one have to be created, and who pays?
4. **Decided 23.09.2026: V1 stores no message bodies**, only the thread id and the extracted facts.
   Confirm that this satisfies whoever owns privacy here, and confirm the remaining question: do we
   keep a body until the qualification decision and delete it after, so an extraction error is
   checkable at the one moment it matters?
5. Who is allowed to read an applicant's extracted information inside the CRM?

Known from research, to confirm in practice: a Gmail watch expires after 7 days and stops silently
if renewal is missed, so whatever we build needs an alarm on the age of the last notification.

---

## Mailchimp

1. **Which plan is the audience on?** Webhooks require Standard or Premium. Free and Essentials do
   not have them. **BLOCKER if the answer is Free or Essentials.**
2. If the plan has to change, who approves the cost?
3. Which audience id is the admissions audience?
4. Who holds the API key today, and who may issue a new one?

Known from research: Mailchimp does not guarantee delivery order, so the CRM must never work out
somebody's subscription state from the order events arrived in. Ask Mailchimp for the current state
instead.

---

## Meta - Facebook and Instagram

Internal first, Meta second.

1. **Who owns the Facebook page and the Meta business portfolio?** Nothing can start without this.
   **BLOCKER.**
2. Is the Instagram account a professional (business or creator) account, and is it linked to the
   page?
3. Is there a published privacy policy URL and a data deletion endpoint? App Review requires both.
   **BLOCKER for messaging.**
4. Who will be the app administrator and go through business verification?
5. Are we running lead ads today? Lead ads do **not** need App Review, so they can go first.

To Meta, through App Review:

6. Advanced Access to page and Instagram messaging. Expect weeks, and expect it to be refused at
   least once.

Plan for the refusal. The browser extension was **demoted** on 23.09.2026 and is no longer a V1
component, because Marketing works on a phone. If Meta messaging is refused, the honest fallback for
these two channels is that they stay a manual conversation in the app, with Marketing recording the
contact in the CRM by hand. See [INBOUND_ARCHITECTURE.md](INBOUND_ARCHITECTURE.md) section 3.

---

## WhatsApp

1. **Is there a spare phone number?** It cannot be a number already in use on the ordinary WhatsApp
   or WhatsApp Business app. **BLOCKER.**
2. Who completes business verification?
3. Are we prepared for the 24 hour rule? Outside 24 hours of the applicant's last message, we may
   only send a pre-approved template, not a free reply. Who writes and submits those templates?
4. What is the expected volume? Messaging is priced per conversation.

---

## Website form

Nothing to ask a provider. It is our own endpoint. Two internal questions:

1. Who can change the website, and will they point the form at the CRM endpoint?
2. Will the marketing links keep their utm parameters? Without them the source is guesswork.

---

## Google Form

1. Who owns the form? Apps Script has to be authorised once by the form's owner. **BLOCKER.**
2. Is the form going to stay, or is the website form replacing it?

Known from research: Apps Script delivers every answer in the notification but has **no retry**, so
a submission is lost if our endpoint is down (the responses do stay in the form and can be backfilled).
The Forms API retries but only tells us "something changed", and its watch expires after a week.

---

## Open Day

1. Who runs the booking app today, and can it post to a URL we give it?
2. Does it already hold consent, and in what words?

---

## Agent / referral

1. Which partners are active, and does each agree to use a tokenised link?
2. What does each partner actually collect? Passport numbers appeared in the research and that is
   sensitive data we may not want.

---

## LinkedIn - nothing is known

LinkedIn was named as a channel Marketing already uses. It has had **no research at all**, so it is
not in the researched channel config and nothing about it is claimed anywhere.

Internal first:

1. **Is it the Novikontas company page, Tetiana's personal profile, or both?** The answer changes
   everything below, because a personal profile has almost no automation available. **BLOCKER.**
2. Who administers the company page?
3. What actually arrives there: direct messages, connection requests with a note, comments, or lead
   gen form submissions from ads?
4. Roughly how many a week? If it is three, manual capture is the honest answer.

Then, to be researched (not asked of a person, looked up):

5. Does LinkedIn offer any inbound webhook or API for messages to a company page?
6. Is there a stable conversation or thread identifier?
7. Which partner programme or API tier is required, and is it open to a college?
8. Does LinkedIn Lead Gen Forms have an API, and is that a better target than messaging?

Expect the answer to be that messaging is not available. Plan for LinkedIn to be the channel that
stays manual longest.

---

## Questions for Novikontas, not for a provider

These are ours and nobody outside can answer them.

1. **Who works the intake queue, and how often?** Marketing owns it. What happens when Tetiana is
   away, and what is the expected response time?
2. **How long do we keep an archived intake item?**
3. **Message bodies.** V1 stores none. Do we want to keep a body **until the qualification decision**
   and delete it after, so an extraction error is checkable at the one moment it matters?
4. Who is allowed to read an applicant's extracted information inside the CRM?
5. **What is the Warm-to-Hot threshold?** See INBOUND_ARCHITECTURE.md section 7 for the three
   candidate definitions.
6. **How many days** before an untouched raw contact is surfaced as ageing?
7. Is there a data protection officer or a privacy owner who should see this list before anything is
   connected?
