# Novikontas phone calls into our admissions CRM

For: TeleGroup, technical contact for novikontas.tg.lv. From: Ritvars Vilcins, Novikontas. 30.09.2026.

## 1. What we want to receive

Every incoming call to the Novikontas college line: who called, when, which menu button they pressed
(1 Admissions, 2 Student Coordinator, 3 Other) and whether somebody answered. No recordings.

## 2. What you set up

Nothing more is needed to keep what runs today. We already read your call list API. We have
four questions, below in section 5.

## 3. What we provide

- We call you; you do not call us. `GET https://novikontas.tg.lv/api/crm/pbx/calls/list/` with the
  token you issued, from our server only. The token is kept in our server settings
  (`PBX_API_TOKEN`) and never appears in a browser, a log or a document.
- We read in 15-minute pieces from the time of the last run, so no call is missed between runs.

## 4. The fields we read

`uniqueid`, `destination` (we keep only `incoming`), `queue` (`1001*Q-ADMISSION`,
`1001*Q-COORDINATORS`, `1001*Q-OTHER`), `caller_num`, `state` (`ANSWER` = answered, anything else
= missed), `operator_name`, `created_at` (read as Riga time).

## 5. What we already found, and our questions

Running since 29.09.2026, once a day, and switched to live use on 30.09. The first run read 152
calls, 9 of them for the college queues. So the API works for us as documented.

Our questions:

1. **Push:** can your platform notify an address of ours when a call ends (a webhook), with retries
   if we are down? If not, we stay with reading the list, which works.
2. **Limits:** how often may we call the list endpoint? We would like every 5 minutes.
3. **The number dialled:** does the call record carry which Novikontas number was called? We would
   like to store it. If there is a field for it, what is it called?
4. **History:** how far back does the list go, so we know how long a pause we can recover from?

## 6. What changes once it is on

For you, nothing. On our side each call to the college queues appears on the caller's record, and a
call from an unknown number, answered or missed, lands in our New Leads queue with the number to ring
back, where staff decide whether there is interest.

Filter before New Leads (01.10.2026, built, not deployed, 68c28ae): a number staff already archived as
Spam, Supplier or vendor, or Internal is kept under Not relevant instead; a second call from a number
that is already waiting in New Leads joins that item. Every call is still stored.
