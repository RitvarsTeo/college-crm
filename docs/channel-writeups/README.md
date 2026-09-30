# Channel write-ups - one per owner

30.09.2026. Checked against the live CRM, production commit `e52e1b4`
(https://crm-novikontas.vercel.app). Each file below can be forwarded as it is.

| File | Channel | Send to | Where it stands today | MVP map |
|---|---|---|---|---|
| [01-meta-tetiana.md](01-meta-tetiana.md) | Facebook, Messenger, Instagram, WhatsApp | Tetiana (colleague) | Built on our side, not set up at Meta | MVP, waits on Tetiana |
| [02-gmail-marina.md](02-gmail-marina.md) | Email (edu@novikontas.org) | Marina (colleague) | Built on our side, no access granted | MVP, waits on Marina and one decision |
| [03-website-form-oksana.md](03-website-form-oksana.md) | Website form | Oksana (colleague) | Built on our side, form not pointed at it | MVP, waits on Oksana |
| [04-open-day-aigars.md](04-open-day-aigars.md) | Open Day bookings | Aigars (colleague) | Built against a guessed format, tool not named | MVP, waits on Aigars |
| [05-phone-telegroup.md](05-phone-telegroup.md) | Phone | TeleGroup (outside provider) | Test mode, daily, since 29.09 | MVP, go-live waits on Ritvars |
| [06-sis-team.md](06-sis-team.md) | SIS applicants (an integration, not a channel) | SIS team (outside) | Test mode, daily, since 29.09 | MVP, go-live waits on Ritvars |
| [07-mailchimp-ritvars.md](07-mailchimp-ritvars.md) | Mailchimp | Ritvars himself | Built on our side, address not pasted | not on the MVP map |
| [08-google-form-owner.md](08-google-form-owner.md) | Google Form | the form owner (not named) | Built on our side, owner unknown | not on the MVP map |
| [09-agent-partner.md](09-agent-partner.md) | Agent or partner | the first partner (not named) | Built on our side, no partner chosen | not on the MVP map |
| [10-linkedin-tetiana.md](10-linkedin-tetiana.md) | LinkedIn | Tetiana (colleague) | Partly built, no app | LATER |
| [11-tiktok-tetiana.md](11-tiktok-tetiana.md) | TikTok | Tetiana (colleague) | Partly built, product unconfirmed | LATER |

**In person** has no outside owner: staff type the person in at the desk, and it already works.

## Rules every file follows

- No secret, token or key is written anywhere. Only the NAME of the setting appears. Ritvars hands
  over every value in person, never by email, chat or a shared document.
- "Test mode" is never called "connected". In test mode real data may arrive, and the CRM still marks
  it `simulated` on purpose until the channel is switched to live.
- The colleague files are in English. Ritvars chooses whether to send them in Latvian.
- The last section of each file is **what the person will see in the CRM** once it is on.

## Decided while writing

- **30.09.2026, Ritvars (popup, option B):** the Facebook Page is registered at ONE address,
  `/api/inbound/facebook`. Inside it, Page messages count as **Messenger** and Page lead forms as
  **Facebook**. The code change is handed to Session B (see HANDOVER.md).
