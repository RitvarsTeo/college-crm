# Channel write-ups - one per owner

30.09.2026. Checked against the live CRM (https://crm-novikontas.vercel.app). **Every channel is in
the MVP** (Ritvars, 30.09). Each file can be forwarded as it is.

| File | Channel | Send to | Where it stands |
|---|---|---|---|
| [01-meta-oksana.md](01-meta-oksana.md) | Facebook, Messenger, Instagram, WhatsApp | Oksana (owns Meta Business Suite) | Built on our side, not set up at Meta |
| [02-gmail-marina.md](02-gmail-marina.md) | Email (edu@novikontas.org) | Marina | Built on our side, no access granted |
| [03-website-form-oksana.md](03-website-form-oksana.md) | Website forms (Tilda) | Oksana | Built on our side; two Tilda questions |
| [04-open-day-aigars.md](04-open-day-aigars.md) | Open Day bookings | nobody yet | **Parked by Ritvars 30.09**: connected with the Open Day project on Vercel |
| [05-phone-telegroup.md](05-phone-telegroup.md) | Phone | TeleGroup | **Live since 30.09** (runs daily) |
| [06-sis-team.md](06-sis-team.md) | SIS applicants | SIS team | Test mode, daily, since 29.09 |
| [07-mailchimp-ritvars.md](07-mailchimp-ritvars.md) | Mailchimp | nobody: done | **Test mode since 30.09**, webhook registered |
| [08-google-form-owner.md](08-google-form-owner.md) | Website "Application form" (Google Form) | Oksana or the form's creator | Built on our side, owner unknown |
| [09-agent-partner.md](09-agent-partner.md) | Agent or partner | the first partner (not chosen) | Built on our side |
| [10-linkedin-tetiana.md](10-linkedin-tetiana.md) | LinkedIn | Tetiana | Partly built, no app |
| [11-tiktok-tetiana.md](11-tiktok-tetiana.md) | TikTok | Tetiana | Partly built, product unconfirmed |

**In person** has no outside owner: staff type the person in at the desk, and it already works.

## Rules every file follows

- No secret, token or key is written anywhere. Only the NAME of the setting appears. Ritvars hands
  over every value in person, never by email, chat or a shared document.
- "Test mode" is never called "connected". In test mode real data may arrive, and the CRM still marks
  it `simulated` on purpose until the channel is switched to live.
- The colleague files are in English. Ritvars chooses whether to send them in Latvian.

## Decided 30.09.2026 (Ritvars)

- **Every channel is MVP.** None is later or parked except Open Day, below.
- **Meta Business Suite is owned by Oksana**, so the Meta write-up goes to her (replaces "Tetiana
  administers Meta Business Suite", 25.09).
- **Open Day:** not connected now. The Piemeri Profesiju booking closes after today; our end stays
  prepared and is connected when the Open Day project is deployed on Vercel.
- **Facebook Page:** ONE address, `/api/inbound/facebook`; Page messages count as Messenger, Page lead
  forms as Facebook (popup B). Code change handed to Session B (HANDOVER.md C1).
- **Phone switched to live** and **Mailchimp set up in test mode**, both on his yes (popup).
