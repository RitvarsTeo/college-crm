# Open Day bookings into the Academy CRM

For: Aigars. From: Ritvars. 30.09.2026.

**Parked 30.09 by Ritvars: do not send yet.** Our end is prepared; it is connected later, when the
Open Day project is deployed on Vercel.

## 1. What we want to receive

Every Open Day booking, the moment it is made, and later whether the person actually came.

## 2. What you set up

First, one answer: **which tool takes the Open Day bookings today?** Everything below depends on it.
Then, if that tool can call a web address when a booking is made:

1. Point it at our address with the secret in a header, once per booking.
2. If the tool also records who actually came, send the same booking again with `attended`; it
   updates the Open Day list and the person (built, not deployed: f927437).

If the tool cannot call an address, say so; we then look at an export instead.

## 3. What we provide

- Address: `POST https://crm-novikontas.vercel.app/api/inbound/open_day`
- Header: `x-crm-secret: <the secret>`, handed over by Ritvars in person, never by email or in a
  document. Setting name on our side: `OPEN_DAY_SECRET`.
- JSON or a normal form post.

## 4. The fields

These are the names our side expects today. **They are our guess, not the tool's.** If the tool
names them differently, send Ritvars one example booking with made-up data and we adapt to it.

| Field | Needed | Meaning |
|---|---|---|
| `booking_ref` | **yes** | The tool's own booking id. A repeat is stored once |
| `booked_at` | yes | When the booking was made |
| `event_id`, `slot` | yes | Which Open Day and which time |
| `name`, `email`, `phone` | as filled in | The person |
| `programme` | if asked | What they are interested in |
| `attended` | if known | `true` or `false` |

## 5. What we already found

- Not answered since 23.09: which tool it is, whether it can post to an address, and what consent
  wording it shows.
- Our side is built and tested with test bookings only. **No real booking has ever reached the CRM.**
- Attendance: built, not deployed (Session B branch `feat/channel-gaps-2026-09-30`, f927437).

## 6. What you will see once it is on

A booking appears in **New Leads** labelled Open Day, matched to the person if we already have them,
never as a second record. Real study interest goes to Ieva with a next step.
