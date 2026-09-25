# The work model

**Specification, not an implementation plan.** Set by Ritvars on 25.09.2026 and recorded so that
Ieva has to confirm only whether it matches her actual work, rather than design a CRM from nothing.

Nothing here is built. See section H.

Anything not yet decided is marked **OPEN DECISION** rather than invented.

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

---

## A. Applicant state

### What belongs to the state

Everything true **about the applicant**, none of which is work for us:

- who they are, and how to reach them
- what they want to study, and how sure we are of that
- which stage of the journey they are in
- which channel they arrived on, and which channel we can reach them on
- what consent they gave, and when
- the history of what has happened to them
- **what we are still waiting to receive from them**

### What an outstanding requirement is

A **named thing we await from the applicant**. Conceptually:

| | |
|---|---|
| **Name** | what it is, in Ieva's words |
| **State** | outstanding, received, or not applicable |
| **Since** | when it became outstanding |

Three properties matter more than the fields:

1. **A requirement has no owner.** It is not assigned to anybody, because it is not work.
2. **A requirement has no due date of its own.** Dates belong to actions.
3. **A requirement is never a task.** It can *justify* a task. It can never *be* one.

### How several exist at once

A requirement is a **member of a set**, not a value in a field. An applicant holds zero or more,
each independent, each with its own state and its own "since".

```
Gatis Purmalis
  medical certificate   OUTSTANDING   since 12.09
  contract              OUTSTANDING   since 18.09   (awaiting signature)
  payment               OUTSTANDING   since 18.09
```

This is one state with three members. It is **not** three tasks, and it is **not** three rows in
Today. The current build cannot represent it: a person holds one next action at a time.

**OPEN DECISION:** whether a requirement needs a state between outstanding and received, for
example *partially received* or *received but rejected*.

---

## B. Admissions action

### What qualifies as a real action

Something **a named person at Novikontas performs**, which can be finished. The test:

- it has a verb, and the verb is ours
- somebody could do it this afternoon
- afterwards, somebody can honestly say it is done

"Follow up with applicant" qualifies. "Medical certificate" does not: it is a noun and nobody
performs it. "Waiting for the contract" does not: waiting is not an act.

### How an action differs from a requirement

| Outstanding requirement | Admissions action |
|---|---|
| a state of the applicant | work for us |
| no owner | owner is Admissions |
| no date | has a date, and appears in Today on it |
| may be many at once | one system-surfaced action at a time |
| does not complete; it is *received* | completes, with an outcome |
| never enters Today by itself | is the only thing that enters Today |

A requirement **never turns into** an action. It **justifies** one.

### How an action completes

A person marks it done and records what happened. Completion carries an outcome, because
"done" alone does not distinguish *they answered* from *nobody picked up*.

### What happens after completion

1. The action leaves Today.
2. **Completion is a meaningful event, so the silence clock restarts.** Without this the same
   applicant reappears the next morning, which is precisely the task fatigue the model forbids.
3. Requirements are **unchanged**. Chasing a certificate does not make it arrive.

**OPEN DECISION:** whether completing an action may mark a requirement received in the same step,
or whether those are always two separate acts.

**OPEN DECISION:** whether an outcome of "no answer" should shorten the next allowed silence.

---

## C. Today

### Who enters Today

An applicant enters Today when **at least one Admissions action is actionable now**. Two sources,
one queue:

| Source | Becomes actionable when |
|---|---|
| **Human planned** | Ieva set a date and that date has arrived |
| **System surfaced** | allowed silence exceeded (section E) |

An applicant with outstanding requirements and no actionable action is **not** in Today. That is
the whole point of the model.

### What a row shows

Four things, in this order of prominence:

```
Gatis Purmalis
Follow up
izziņa · līgums · apmaksa
6 d.d. silence
```

| Part | Why it is there |
|---|---|
| **WHO** | the only reliably unique part of the row |
| **ACTION** | what to do |
| **WHY** | which outstanding requirements justify it |
| **AGE** | how long they have been quiet |

### How ten identical rows are avoided

Because most system-surfaced actions are called "Follow up", **the action label cannot be what
distinguishes rows.** The row is identified by the person and differentiated by the reason.

Therefore the **why** is part of the row itself, not only of the record behind it. A Today made of
ten rows reading "Follow up with applicant" would be unusable, and hiding the reason one click away
would produce exactly that.

### How task soup is avoided for one applicant

**At most one system-surfaced action per applicant at any time.** Three outstanding requirements
plus a silence breach produce **one** action carrying three reasons. If a system-surfaced action is
already open, silence does not create a second.

**OPEN DECISION:** whether more than one *human-planned* action may be open for the same applicant
at once. Ieva may legitimately want "call Friday" and "send the invoice Monday" as two.

---

## D. Meaningful event

A meaningful event is what **restarts the silence clock**. Conceptually, it is evidence that the
case is alive.

The important distinction, and the main risk in this whole model:

> **Silence from THEM is not the same as time since WE last acted.**

Two different clocks. Mixing them means a person we have chased four times with no reply looks
"recently active" because we keep touching the record.

| Candidate | Assessment |
|---|---|
| **Applicant reply** | **Yes.** The strongest evidence the case is alive. |
| **Requirement received** | **Yes.** They did something. |
| **Visit** | **Yes.** They turned up. |
| **Completed follow-up** | **Yes**, by decision (principle 8). Note this is *our* activity, not theirs, so it restarts the clock without proving the applicant is alive. That is accepted deliberately, so a chased person is not chased again the next day. |
| **Phone or contact attempt** | **OPEN DECISION.** An attempt that reached nobody is our effort, not their engagement. Counting it hides a person who is not responding. |
| **Status change** | **OPEN DECISION, and probably no.** Moving somebody from Application to Contract is an administrative act by us. It is not evidence they are alive, and counting it would let a record look fresh while the applicant has been silent for weeks. |

**OPEN DECISION:** whether one clock is enough, or whether the CRM should hold both "days since
they did anything" and "days since we did anything", and surface on the first.

---

## E. Silence and ageing

```
last meaningful event
        |
        v
working days since it
        |
        v
compared to the allowed silence for this stage
        |
        v
allowed silence exceeded
        |
        v
the case becomes actionable
        |
        v
ONE Today action, carrying its reasons
```

Silence is a **trigger**, never a task. It creates an action; it is not one.

Its purpose is to remove the need to invent a chase date for every applicant, while leaving human
planning fully intact.

**OPEN DECISIONS, all of them business:**

- how many working days of silence are allowed
- whether that number is one global value, or one per stage
- what a working day is here. Novikontas office hours are 08:00 to 17:00, Monday to Friday, which
  is known; whether public holidays are excluded is not
- whether an applicant can be marked as deliberately paused, so silence does not accrue
- whether silence should stop accruing once a person reaches a terminal stage

---

## F. Where outstanding requirements come from

**The most important unanswered question in this model.** It decides both how much work Ieva does
and how much the CRM can be trusted.

### 1. Automatically from the stage

Reaching a stage creates that stage's requirements.

| | |
|---|---|
| **For** | Ieva sets up nothing. Consistent between applicants. Nothing is forgotten. Reporting is trustworthy because every applicant at a stage is measured the same way. |
| **Against** | Reality does not fit every applicant. Somebody who has already brought a certificate gets one raised anyway. Waivers and exceptions need a way out, or Ieva starts fighting the system. |
| **Ieva's work** | Almost none to create them. She only ever marks them received, and dismisses the ones that do not apply. |

### 2. Manually by Admissions

Ieva adds what she is waiting for, when she is waiting for it.

| | |
|---|---|
| **For** | Always accurate, because a person decided it. Handles every exception naturally. |
| **Against** | Anything she does not add does not exist, so nothing is ever surfaced for it. Two colleagues will record the same situation differently, and reporting across applicants stops meaning anything. |
| **Ieva's work** | The most. Every requirement, for every applicant, by hand. This is the option most likely to be quietly abandoned once it is busy. |

### 3. Hybrid

The stage proposes its usual requirements; a person confirms, removes or adds.

| | |
|---|---|
| **For** | Consistent by default and correct in the exceptions. The common case costs nothing; the unusual case is possible. |
| **Against** | More to build than either pure option, and it needs a clear answer to what happens when a stage's expected set later changes. |
| **Ieva's work** | Small and only where reality differs from the usual. |

**This specification does not choose.** It is a business decision about how Admissions actually
works, and it belongs to Ieva and Aigars.

---

## G. The documents boundary

Aigars's rule, preserved exactly:

> **Šajā sistēmā document upload nav, to cilvēki liks iekš admission portāla.**

Therefore, and without exception:

- **no document upload in the CRM**
- **no second admission portal**, in whole or in part
- **no document administration placed on Ieva**
- the CRM may hold a document **status or signal** - outstanding, received - **only if it is later
  decided that this signal belongs here at all**

Until that decision exists, documents are not assumed to be a CRM concern. A requirement named
"documents" in this model is a *thing we await*, not a file we hold.

**OPEN DECISION:** whether the CRM should receive that status from the admission portal
automatically, be told it by a person, or not know it at all.

---

## H. Current state of the code

Nothing in this specification is implemented.

| | |
|---|---|
| `waitingOn` / chase-date model | **NOT IMPLEMENTED.** Specified earlier on 25.09.2026 and superseded by this document. |
| Checklist / silence model | **NOT IMPLEMENTED.** |
| Outstanding requirements as a set | **NOT IMPLEMENTED.** The build holds one next action per person. |
| Action carrying its reasons | **NOT IMPLEMENTED.** |
| Working-day silence counter | **NOT IMPLEMENTED.** Lateness is counted in calendar days. |
| Code | **UNCHANGED** |
| UI | **UNCHANGED** |
| Schema | **UNCHANGED.** No migration written or run. |
| Tests | **UNCHANGED.** 346 passing. |
| Commit / push | **NONE** |

What Today does today: "Waiting on us" already excludes tasks that are not yet due, so the half of
the rule that says *a not-yet-due item stays out of Today* is live. Everything else above is design.

---

## Every open decision, in one place

| # | Decision | Section |
|---|---|---|
| 1 | Does a requirement need a state between outstanding and received? | A |
| 2 | May completing an action mark a requirement received in the same step? | B |
| 3 | Should an outcome of "no answer" shorten the next allowed silence? | B |
| 4 | May more than one human-planned action be open per applicant? | C |
| 5 | Does an unanswered contact attempt restart the silence clock? | D |
| 6 | Does a status change restart it? Probably not. | D |
| 7 | One clock, or both "since they acted" and "since we acted"? | D |
| 8 | How many working days of silence are allowed? | E |
| 9 | Global, or per stage? | E |
| 10 | Do public holidays count as working days? | E |
| 11 | Can an applicant be deliberately paused? | E |
| 12 | Does silence stop at a terminal stage? | E |
| 13 | **Where do outstanding requirements come from?** | F |
| 14 | Does a document status belong in the CRM at all, and if so how does it arrive? | G |
| 15 | Is there a FOURTH answer to 13: no requirements at all, only stages and planned actions? | Appendix |
| 16 | Does Admissions need a stage-level "where is this stuck" view, or is Today enough? | Appendix |

Number 13 is the one that changes the shape of everything else.

---

## Appendix: what OpenEduCat does, and what is worth taking

Added 25.09.2026 after Ritvars pointed at an OpenEduCat walkthrough of handling admission inquiries
in their CRM module, and a second session recovered the captions and summarised it.

**What this is:** a summary of one vendor's 13-minute product walkthrough, plus their published
feature pages. Nothing was installed, run or verified. It is one product's opinion, not a standard.

### Their model, in one line

An inquiry arrives as a **Lead**. A lead worth working is converted to an **Opportunity**, which
then moves along a pipeline of stages until it is marked **Won** or **Lost**, and Lost demands a
written reason.

### What it CONFIRMS about what we already built

This matters more than the differences, because four decisions taken here were taken alone.

| Their behaviour | Ours | Verdict |
|---|---|---|
| Lead and Opportunity are two different things, and a lead is converted deliberately | Inbox item, then a person, after somebody qualifies it | **The same shape.** Our "nothing becomes a lead on its own" is the standard, not a quirk. |
| Three ways in - incoming email, typed by hand, website form - all landing in one list | 14 channels, one inbound contract, one queue | **The same idea, wider.** |
| A lost opportunity needs a written reason | Stopping work on somebody needs a reason, dragged or typed | **Already done, and already tested.** |
| Every stage change and edit is kept on the record | `history.js`, automatic and manual side by side | **Already done.** |
| A per-column bar: green when an activity is scheduled, red when it is overdue | The "Without Next Action" group Ritvars named on 25.09.2026 | **He arrived at the same signal independently.** |
| Convert straight to Student when the person is already confirmed, skipping the pipeline | `handoffToSis` | **The same escape hatch.** |

### What is worth taking

**One thing: a stage-level view of where work is stuck.** Their pipeline shows each stage as a
column with a health bar, so somebody can see that six people are sitting in Application with
nothing scheduled, without opening six records. Ours answers "what do I do today" well and does not
answer "where is this getting stuck" at all.

**OPEN DECISION 16:** does Admissions need a stage-level view, or is Today enough? This is a question
for Aigars, who has twice cut a screen for being clutter.

### What is deliberately NOT taken

- **Expected revenue and probability on every record.** It is a sales forecast. Admissions here does
  not forecast, and Aigars has already deleted a card for being clutter.
- **Salesperson, sales team, customer record.** Sales vocabulary, and the same objection raised
  against Atomic CRM in `PLATFORM_FEASIBILITY.md`. Admissions ownership here is always Ieva.
- **Priority, tags and card colours.** Three ways to say the same thing, all typed by hand, all of
  which go stale. The model already derives urgency from silence.

### The finding that actually matters

**OpenEduCat has no concept of an outstanding requirement.** It has stages, and it has scheduled
activities. There is nothing in it that represents *a named thing we are waiting to receive from the
applicant*, as a set, with its own age.

That cuts both ways and both halves are worth saying:

- Section A of this document is therefore **not a copy of the standard**. It is an addition to it.
- A mature education CRM getting by without it is **evidence that it might not be needed**, and the
  cheapest possible answer to open decision 13 would be: it comes from nowhere, because there are no
  requirements - only stages and the next thing somebody planned to do.

That is a real option and it was not on the list before. It does not change the recommendation,
because Ieva has not yet said whether she tracks documents this way. But decision 13 now has a
fourth answer, and it is the simplest one.
