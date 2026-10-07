# Q74 - what arrives at edu@, and the simplest rules (07.10.2026)

Source: production backup `_backups/2026-10-07T09-01-03Z` (VERIFIED). Counts only; no name,
address or message printed. Span 30.09 - 07.10.2026.

## What arrived

| | Emails |
|---|---|
| All edu@ emails (all from the real mailbox) | **201** |
| Already set aside automatically (kept, can be brought back) | **132** - 49 internal Novikontas, 83 automatic senders |
| Waiting in the Inbox | **69** |
| Made into a lead so far | **0** |

The 69 waiting:

| Kind | Emails |
|---|---|
| Looks like a real first message | 39 |
| A reply ("Re:"), sender already a person in Intake | 12 |
| A reply ("Re:"), sender not in Intake | 11 |
| From a person already in Intake (not a reply) | 1 |
| Newsletter (has an unsubscribe link) | 3 |
| Automatic sender the filter missed | 3 |

11 senders account for 28 of the 69: the same person writing again shows as another card.

## Proposal - three rules (KISS), not built

1. **From somebody already in Intake -> straight to their history, not the Inbox.** Any of their
   emails counts (Q77 matcher). 14 of the 69.
2. **The same sender again while their first message still waits -> joins that card.** One card
   per sender. 50 -> 39 cards.
3. **Newsletters and the missed automatic senders -> set aside automatically** (kept, can be
   brought back), as the 132 already are. 5 of the 69.

**Result: 69 cards -> 39**, each a different new sender. Build after Ritvars says yes.

What can break: rule 1 hides a message from the Inbox, so the person's owner must see it - it
goes on their history and counts as their newest contact. A wrong match (shared family email)
would file it on the wrong person; only ONE strong match counts, two is a question for a person.

## DECIDED and BUILT, 07.10.2026 - corrected numbers

Ritvars said yes against Aigars's latest list (07.10: "email kkadu automatizaciju, sobrid visi emaili
ienak inboxa"). Built as:

1. **Somebody already in Intake, still being worked with -> their history + "Answer the question"
   due today** (the existing step, like a known lead's missed call -> "Call back"). The email text is
   on their history: Aigars's "chain of communication ... profila". **Finished people (Admitted,
   Not proceeding) stay in the Inbox**, grouped as current students, so a student's question is
   never hidden.
2. **The same new sender again -> joins their waiting card** (one line per message, the wait clock
   does not restart).
3. **Newsletter -> set aside** by its unsubscribe link anywhere in the message (`emailFilter.newsletter`).

**Corrections to the estimate above, found by checking the real messages:** the "3 newsletters"
were mostly NOT newsletters - "izraksts / izrakstu" means a transcript or statement, a real
enquiry. And "atrakstiet" means "write back to me". The marker is therefore the English
"unsubscribe" and the REFLEXIVE Latvian forms only ("atrakstīties", "izrakstīties"). The "3 automatic
senders" were support@ / team@ / info@ addresses, which a real school or partner can use, so the
sender filter was NOT widened.

**Real effect on the 69 waiting (backup 07.10 09:01Z): 69 cards -> 47.** 7 to a person's history,
1 newsletter set aside, 14 joined into a waiting card; 7 from admitted people stay in the Inbox.
Applies to NEW arrivals; the 69 already waiting are not moved.
