# Referrals from a partner agency into the Novikontas admissions CRM

For: the first partner agency (not chosen yet). From: Ritvars Vilcins, Novikontas. 30.09.2026.
Not on the MVP map: nobody to send it to until Novikontas chooses the first partner.

## 1. What we want to receive

Each student you refer to Novikontas, when you refer them, so the referral is credited to you.

## 2. What you set up

Either of two, whichever is simpler for you:

- **A. Nothing.** You send students to our website form with your own referral link, and the form
  records that they came from you. (Not built yet, and it needs the website form live first.)
- **B. Your system posts each referral** to our address with your partner token in a header.

## 3. What we provide

- For B: `POST https://crm-novikontas.vercel.app/api/inbound/agent`, header
  `x-partner-token: <your token>`. We issue one token per partner and hand it over in person or by
  phone, never by email. Setting name on our side: `AGENT_TOKENS`.
- A referral is credited to the partner whose token was used. A referral naming another partner is
  refused.

## 4. The fields (option B)

| Field | Needed | Meaning |
|---|---|---|
| `partner_ref` | **yes** | Your own id for the referral. A repeat is stored once |
| `submitted_at` | yes | When you referred them |
| `name`, `email`, `phone` | yes | The student |
| `programme` | if known | What they want to study |
| `notes` | optional | Anything we should know. Please no passport or ID numbers |

## 5. What we already found

- Built and tested with test referrals only. **No real referral has ever reached the CRM.**
- Fixed 28.09: the token check and the credit to the right partner.

## 6. What changes once it is on

Each referral appears in our admissions queue, credited to you. Our Admissions team contacts the
student; you are the source of the referral, not the owner of the student's application.
