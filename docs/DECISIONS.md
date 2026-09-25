# Locked decisions

One line per decision, with where it lives in the code and the test that keeps it honest. A decision
that is only written down is not a decision the software keeps, so every locked item below has an
assertion behind it in `test/decisions.test.js` or `test/history.test.js`.

Locked means: do not ask again, do not quietly reinterpret. If it turns out to be wrong, it is
changed here first and the tests follow.

---

## 23.09.2026

### 1. Users, and the difference between a role and a person

| | |
|---|---|
| **Decided** | The CRM users are **Ieva** (Admissions), **Laura** (Student Coordinator), **Tetiana** (Head of Marketing) and **Maris Cirulis**. The admins are **Aigars**, **Ritvars** and **Marina**. No email addresses yet. |
| **The point** | **A role is not a person.** "Admissions" is a role and it owns records. Ieva is a person and she does things. A real login must identify Ieva personally, not her department. |
| **In the code** | `config/prototype.json` → `users`, `admins`, `owners`. The sidebar picker lists people. The owner dropdown lists roles and is labelled "a role, not a person". |
| **Not yet** | No authentication of any kind. Identity is a setting. Every screen that depends on it says so. |

### 2. History and audit

| | |
|---|---|
| **Decided** | Admins see everything. A normal user sees **their own actions and their own corrections** and not a colleague's. |
| **The line drawn** | A person's **activity** (calls, notes, messages, visits, status moves) stays visible to everyone who may open that record, because hiding it would make two people call the same applicant. An internal **correction** ("Programme NAV → ENG, by Laura") is audit, and a normal user sees only their own. |
| **In the code** | `visibleTimeline()` in `src/server.js`; `readHistory({ actor })` in `src/history.js`. The person page counts what it is hiding rather than pretending nothing happened. |
| **Confirm** | The phrase "colleagues' internal corrections/actions" is read as **corrections**, because the next sentence keeps normal activity visible. If activity was meant to be hidden too, say so and it changes. |

### 3. One person, the whole way

| | |
|---|---|
| **Decided** | Lead → Applicant → Admitted → handed to SIS is **one record**. Being admitted never creates a second person. |
| **Why** | Conversion has to stay measurable on the same row. The real admissions file could trace only 10 of 201 admitted students back to the lead they had been, because converting meant retyping them into another tab. |
| **Boundary** | At **Admitted** the person is handed over to the SIS. The CRM does recruitment and admissions. It does not become the student information system. |
| **In the code** | `config.lifecycle`. Test walks a person through every stage and asserts one row, unchanged source, unchanged first contact. |

### 4. Ownership follows the stage

| | |
|---|---|
| **Decided as a principle** | Ownership depends on the person's **current stage**. It is not permanently assigned to one person. Admissions stages → Admissions, coordinator stages → Student Coordinator, marketing stages → Marketing. |
| **NOT decided** | The stage list, and which role owns which stage. |
| **In the code** | `ownershipFollowsStage: false`, with a note saying to flip it once the map exists. Until then the owner is set by hand. Marketing was added to the owner roles because the principle says some stages are theirs. |

### 5. Next action

| | |
|---|---|
| **Decided** | Every active person has a next action. Overdue and missed follow-ups must be visible. This is one of the core purposes of V1. |
| **In the code** | Already built and enforced: the server refuses to close a step without naming the next one. Overdue appears on Today, on the sidebar badge, and as its own filter. |
| **Open** | The example reads "Owner: Ieva", a **person**. The record's owner is a **role**. Two different fields, and only the role exists. See open question below. |

### 6. Person page

| | |
|---|---|
| **Decided** | Not one long scrolling page. Split into logical sections. The timeline stays available but does not have to dominate. |
| **Status** | Deliberately **not** redesigned yet, because the visual hierarchy is for the next visual review. The page is already in sections; that review decides the rest. |

### 7. Notes

| | |
|---|---|
| **Decided** | Notes carry a type: Call note, On-site visit note, Admissions note, Stage note, Other note. They stay in the **same** history. No silos. |
| **In the code** | `config.noteTypes`, the note dialog, and a test asserting that no separate notes table exists. |

### 8. Lost and closed reasons

| | |
|---|---|
| **Decided** | No response · Chose another institution · Changed study plans · Not eligible · Financial reasons · Timing / postponed · Programme not suitable · Requirements not met · Duplicate · Other. **"Other" needs an explanation.** |
| **In the code** | The status endpoint refuses "Not proceeding" without a reason, and refuses "Other" without a note. Two new columns hold them. |
| **Status** | **Provisional** until Admissions validates the list. |

### 9. Duplicates

| | |
|---|---|
| **Decided** | Duplicate prevention is required. A match is never silently overridden: the save stops, the existing record is shown, and the operator either opens it or says in as many words that this is a different person. |
| **In the code** | One matcher, `findMatches()`, used by both the live warning and the blocking save, so the two can never disagree. A blocked save is a 409, not a quiet success. |
| **Missing** | Merging two records that turn out to be one human. Not designed, not built. |

### 10. Search

| | |
|---|---|
| **Decided** | Find a person by whatever detail is remembered: name, email, phone, programme, source, person id, and the other useful fields. |
| **In the code** | `config.searchFields`, plus the channel's **plain name**, so "instagram" finds an Instagram lead without anybody knowing the internal id. |

### 11. Today screen

| | |
|---|---|
| **Decided** | Grouped: New leads · Follow-ups · Replies · Other attention. The user chooses the order and it is remembered. **Re-ordering never hides anything.** An empty group still appears and says it is clear. Completion is shown as a cleared queue, not as a game. |
| **In the code** | `/api/today` returns every group with open/done/total. The view renders every group the server returned, in the saved order. |

### 12. Management metrics

| | |
|---|---|
| **Decided as the starting three** | New leads this month · Admissions this month · Conversion %. |
| **Stated honestly** | Admissions-this-month and conversion-this-month count **different populations**: somebody admitted today may have arrived in March. The conversion figure follows this month's arrivals, and the screen says so. |
| **To investigate, not to build** | applications · admitted · stage · programme · study form · education background · **nationality** · intake channel · admission duration. **Nationality is not in the prototype schema at all.** |

### 13. Channels in plain words

| | |
|---|---|
| **Decided** | The operator never needs to understand an API. The screen says "Source: Instagram". The machinery stays underneath. |
| **In the code** | A test scans the daily screens for the words webhook, oauth, Pub/Sub, endpoint and API key, and fails if any of them reach a screen Ieva uses. The technical detail lives only on the demo screens. |

### 14. Inbound architecture

Designed, **not built, nothing connected**. See [INBOUND_ARCHITECTURE.md](INBOUND_ARCHITECTURE.md).

Two rules, not one:
**a machine may SORT, only a person may DISCARD** - and **a contact is not a lead.**
Model B (an intake queue) is the spine. Model A only labels and ranks inside it. Model C is demoted.

### 15. Inbound -> Warm -> Hot, and Marketing qualifies first

| | |
|---|---|
| **Decided** | Broad inbound lands with **Marketing**. Tetiana already works in Instagram, WhatsApp, Facebook and LinkedIn, has the conversation anyway, and decides whether there is genuine study interest. Only qualified opportunities reach Admissions. |
| **The ladder** | **Raw contact** (Marketing, not a lead) -> **Warm lead** (Marketing) -> **Hot lead** (Admissions) -> Application -> Admitted -> SIS. |
| **The point** | "Hi" is a contact, not a lead. Thirty of them on a Tuesday must produce thirty rows for Marketing and **zero** notifications for Ieva. |
| **In the code** | `config.qualification`. Deliberately a **separate field**, not the pipeline stage list, because the stage list is still owed. A test fails if raw/warm/hot leak into `stages`. |
| **NOT decided** | The **Warm-to-Hot threshold**. `warmToHotThreshold` is `null` and a test fails if anybody fills it in. Three candidate definitions are in INBOUND_ARCHITECTURE.md section 7. |

### 16. Notifications

| | |
|---|---|
| **Decided** | **Raw: nobody is notified.** It appears in Marketing's list and is searchable forever. **Warm: the qualification owner.** **Hot: Admissions, properly.** |
| **Why** | Notification fatigue is the failure this design exists to prevent. If everything notifies Admissions, nothing does. |
| **In the code** | `config.notifications`. A test asserts `raw.notify` is empty and that Admissions appears only under `hot`. |
| **NOT decided** | How many days before an untouched raw contact is surfaced as an ageing list. `ageingDays` is `null`. |

### 17. The machine may propose, never assert

| | |
|---|---|
| **Decided** | The machine may detect intent, extract information, match a person, pre-fill fields and rank the queue. It must never invent a fact that was not in the message. |
| **How that is made real** | Every field carries its **provenance**: `typed`, `provider`, `extracted`, `confirmed`, `operator`. An **`extracted` value is a suggestion**, shown differently, and **excluded from every count and report** until a human confirms it. |
| **Why the mechanism matters** | Without it, "do not invent facts" is a wish. With it, an unconfirmed guess cannot quietly become a statistic. We have been bitten by exactly this before, when a distillation step wrote its own working codes into a record as though they were facts. |
| **Missing information** | Never blocks creation. What is known is shown, what is missing is named on the screen so the next conversation has an agenda. |

### 18. What we store from a conversation

| | |
|---|---|
| **Decided** | V1 does **not** store full Instagram / Facebook / WhatsApp / Gmail conversation bodies. It stores identity, source, timestamp, thread key, qualification, extracted fields with provenance, operator notes, who processed it, the next action, the owner and the audit trail. |
| **What it costs, stated** | **An extraction error becomes uncheckable.** We keep our reading of the message, not the message. The operator who picks it up later reads the actual words in Instagram or Gmail, so context lives in two places. "Preserves full message context" is no longer a reason to prefer the queue, and the architecture document withdraws that claim rather than leaving it standing. |
| **Open** | Do we keep a body **until the qualification decision** and delete it after? That would make the extraction checkable at the only moment anybody needs to check it. |

### 19. The browser extension is not a V1 component

| | |
|---|---|
| **Decided** | Marketing works on a phone across four apps. A desktop browser extension does not fit how the work happens. The product is **not** designed around it. |
| **Status** | On the shelf as a fallback only if a provider approval is refused outright. |
| **In the code** | `config.browserExtension.requiredForV1` is `false`. |

### 20. LinkedIn exists and nothing is known about it

| | |
|---|---|
| **Also TikTok** | Named 23.09.2026, Marketing only, **no research either**. Both are in `config.unresearchedChannels` and out of `providers.json`. |
| **Status** | Named as a channel Marketing uses. **No research has been done.** Inbound API, conversation key, approval tier, and even whether it is a company page or Tetiana's personal profile: all UNKNOWN. |
| **Deliberate** | It is recorded in `config.unresearchedChannels` and kept **out** of `config/providers.json`, because putting it there would make it look investigated. A test enforces that. |

---

### 21. Channel access, per person

| | |
|---|---|
| **Decided 23.09.2026** | Facebook and Instagram: Tetiana, Ieva, Laura, Marina, through the shared **Meta Business Suite**. WhatsApp: Ieva, Laura, Marina - **not Tetiana**. LinkedIn and TikTok: **Tetiana only**. |
| **Why per person** | No role-shaped model can express "everybody except Tetiana has WhatsApp". A role's access is **derived** from its people, never written down twice. |
| **Not ownership** | Access decides who can open a conversation. It never decides who owns the work. |
| **Unverified** | Whether WhatsApp sits inside Meta Business Suite in the Novikontas setup. Not claimed until checked. |
| **Phone menu** | 1 = Admissions (Ieva), 2 = Student Coordinator (Laura), 3 = Other (Tetiana + **Arina**, Internship Coordinator). The three buttons are the three PBX queues the logger keeps. |
| **In the code** | `config.channelAccess.byPerson`, `config.phoneMenu`, `canReach()` in `src/intake.js`. A handover gap now names who can bridge it. |

## Still open, and blocking

| # | What | Blocks |
|---|---|---|
| 1 | **The stage list**, and which role owns which stage | all of decision 4, and the Kanban/pipeline design |
| 2 | Is a next action assigned to a **role** or to a **person**? | the Today screen's "my work" view, and any per-person workload report |
| 3 | Who works the **intake queue**, and how often? | the whole inbound design. A queue nobody opens is worse than no queue. |
| 4 | **Retention**: how long do we keep archived intake items and message bodies? | connecting Gmail and the Meta channels |
| 5 | **Merging** two records that are one human | duplicate handling is only half done without it |
| 6 | **TeleGroup**: does a post-call event exist and what does it carry? | the entire phone channel |
| 7 | **Mailchimp plan**: Standard or Premium, or no webhooks | the Mailchimp channel |
| 8 | Who owns the **Facebook page and business portfolio**? | Facebook and Instagram messaging |
| 9 | Is there a **spare phone number** for WhatsApp? | the WhatsApp channel |
| 10 | Does the corrections rule apply to **activity** too, or only corrections? | decision 2's exact line |
| 11 | Should the closed-reason list be validated by Admissions before Ieva sees it? | decision 8 moving from provisional to final |
| 12 | **The Warm-to-Hot threshold.** Three candidate definitions are set out; none chosen. | routing anything to Admissions automatically |
| 13 | How raw / warm / hot relate to the **pipeline stage list** | the stage definition, and therefore ownership |
| 14 | Do we keep a **message body until the qualification decision**, then delete it? | whether an extraction error is ever checkable |
| 15 | **Who qualifies when Tetiana is away?** A ladder with one person on the middle rung has a single point of failure. | the whole Marketing gate |
| 16 | How many **days before an untouched raw contact** is surfaced? | the ageing list |
| 17 | **LinkedIn**: is any inbound integration possible at all? | the LinkedIn channel |

---

## 25.09.2026

### The canonical work model

**Set by Ritvars, 25.09.2026, as the base the CRM is built on.** Not yet implemented, deliberately.
Ieva validates it against her real work before any code moves.

```
                    APPLICANT
                        |
          +-------------+-------------+
          |                           |
     APPLICANT STATE            OUTSTANDING
                                REQUIREMENTS
          |                           |
          +-------------+-------------+
                        |
                 context / reason
                        |
                        v
               ADMISSIONS ACTION
                        |
             +----------+----------+
             |                     |
       HUMAN PLANNED        SYSTEM SURFACED
                            via ageing / silence
             |                     |
             +----------+----------+
                        v
                      TODAY
                        |
                        v
                  ACTION BY US
```

| | The rule |
|---|---|
| **1. State is not work** | What is happening with the applicant, and what we await from them, is **state**. What we must do is an **action**. This is the distinction everything else rests on. |
| **2. Today is an action queue** | Not "every applicant with something unfinished". Only "every applicant where we must act now". |
| **3. Several things may be outstanding at once** | Reality must not be forced into one `nextAction` field. Medical certificate, contract and payment can all be open together. That is one state, not three tasks. |
| **4. An action is its own object, and carries its reason** | `Follow up with applicant`, owner Admissions, due today - and inside it, **why**: certificate outstanding, contract awaiting signature, payment outstanding. "Next action: follow up payment" loses the rest of the situation. |
| **5. Silence is a trigger, not a task** | Last meaningful event -> working days of silence -> allowed silence exceeded -> the case becomes actionable. Silence alone is never a task. This removes the need to invent a chase date per applicant. |
| **6. Human planning stays** | Ageing must never stop Ieva saying "contact this one on Friday". System-surfaced and human-planned actions land in the **same** Today queue. |
| **7. Documents stay out** | Aigars: the CRM is not a document upload system; documents go through the admission portal. The CRM may one day know outstanding/received as a signal. It never becomes a second portal, and document administration is never put on Ieva. |
| **8. Contract and payment are states too** | An applicant who has just received the contract does not generate "chase contract". Only when follow-up is genuinely needed does Today get an action, with the state shown on the record. |
| **9. Today must not become notification soup** | One applicant with three outstanding items and a silence breach produces **one** action, `Follow up with applicant`, with context inside. Never three. This is what protects Ieva from task fatigue. |

**Status:** agreed as the working base. `waitingOn` and the chase-date work specified earlier the
same day are **not** implemented and are superseded by this. Nothing is built until Ieva has
confirmed it matches her work.

