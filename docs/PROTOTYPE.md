# Academy CRM - V1 virtual prototype

*Renamed 24.09.2026 from "College CRM". The header carries the official Novikontas Academy
logo file, dark navy on the light theme and white on the dark one.*

A clickable prototype of what the CRM could be, so it can be argued with before anything is built.
It is not production software: no authentication, no real integrations, no migrations, no deployment,
and every person in it is invented.

## The database starts empty

The prototype starts with **nobody in the table**, so a channel test is visibly the thing that
writes the first person into it. Three controls sit with the demonstration tools in the sidebar:

- **Run the full channel demo** - runs all eleven channels in sequence.
- **Clear the database** - back to empty. Press it as often as the demo needs.
- **Load into the database** - empty, the real people exported from the admissions sheet, or synthetic.

A badge in the DEV CONTROL group always says which of the three is on screen, so real applicants can
never be mistaken for invented ones. (It sat under the product name until 24.09.2026.)

**Real data** lives in `data/real_people.json`, which is git-ignored and never leaves this machine.
It is built by `import_sheet.py` from the ADMISSIONS DATABASE export. The default selection is this
year's live work: open leads first contacted in 2026 plus the 25 most recently admitted students,
116 of 470 exported. Change `realData.include` in `config/prototype.json` for a different slice.
No consent is recorded for these people, because the sheet holds none, and the prototype shows that
honestly rather than inventing it.

## Launch

```
cd "Desktop\WF\Local Repo\Projects\College CRM\crm-prototype"
npm start
```

Then open `http://localhost:8800`. No dependencies, no install, Node 24 built-ins only.

**Corrected 24.09.2026, twice.** The data used to live in memory and be rebuilt on every start. It
is now a file at `data/crm.db` (git-ignored) and it **survives a restart** - verified by seeding a
row, restarting the server and reading it back. The first attempt did NOT work: boot still called
`loadDataset(...)`, which clears every table, so the file was wiped on every start and only the
feedback table survived. That is fixed and an existing database is now left alone at boot.
`DATASET=empty|real|synthetic` still forces a load and therefore still clears. The change was made
because the old behaviour caused a real bug - a restart emptied the database while a
tester's open browser tab carried on showing rows that no longer existed, and every link in that
stale page then failed. "Clear everything" in DEV CONTROL is now the way back to empty, not a
restart. Set `CRM_DB=:memory:` for the old behaviour; the tests still run that way.

## Design

The palette comes from the reference Ritvars provided: the Client Hub preview artifact. Paper
`#F7F6F3`, surface `#FCFBF9`, ink `#111C21` with the .78 / .62 / .48 text tiers, hairlines at .16
and .10, petrol `#1F7688` for data and state, amber `#D98A1E` for anything waiting on a human, the
soft two-step lift, Spectral for display and Inter for the interface. Dark is the reference's own
dark theme rather than an inversion of light.

Structure, screens, components and behaviour were not changed by the palette pass. Contrast was
measured in both themes after the change: worst pair 4.74:1 in light and 6.96:1 in dark, against a
4.5:1 floor.

## Screens

The interface is **English only** since 23.09.2026. The Latvian package is archived in
`_archive/latvian-language-package/`, not deleted.

| Screen | What it answers |
|---|---|
| Today | What do I do this morning: new leads, overdue actions, actions due today, people with no next step, recent activity, pipeline |
| People | The full list with search, five filters, sortable columns, next action and its due date |
| Person | One record: contact details, source, programme, status, owner, documents, events, and the whole conversation in one timeline. **Edit record** corrects it - see below |
| Follow-up list | Who needs action, split into overdue, today, this week and all open, with complete and reschedule |
| Channels | Where people came from and what has arrived recently, open days included |
| Reports | Pipeline by stage, sources and their conversion, time to contract by group, programme mix |
| History | An admin sees the whole log, filterable by origin. Anybody else sees **My history**: their own actions only |

Interactions that actually work: search, filter, sort, open a person, **edit a person**, change
status, log a call, add a note, complete a task with an outcome and a follow-up, reschedule a task,
add a task, add a person with a live duplicate check, mark attendance at an open day, which creates a
follow-up task by itself.

## The history log, and who may read it

One table, two origins. Every entry says whether a machine did it (`automatic`) or a person did
(`manual`), and `logEvent()` throws rather than write an entry that does not say. An edit writes one
entry per field that changed, carrying the field, the old value, the new value, who and when.

**Editable:** name, email, phone, programme, study form, education, owner, notes.
**Locked:** source channel, source campaign, source detail, first-contact date. Those are historical
facts. A locked field is refused by name and with a reason, and a refused edit writes nothing at all.

**The admins are Aigars, Ritvars and Marina.** Nobody who owns people in the admissions roles is an
admin. An admin opens **History** and gets the whole log. Anybody else opens the same menu item and
gets **My history** - the entries recorded under their own name, and nothing else. A role is shared,
so until there is a login that means "done under this role", not "done by this person", and the
screen says so.

**None of this is enforced.** There is no login. The "Acting as" dropdown in the sidebar is a
setting, and every screen that depends on it says so. The rule is on screen so it can be judged
before authentication exists, not because it protects anything.

## What is based on evidence we already have

- **One person record from first contact to student.** This is the direct answer to what was measured
  in the real file: only 10 of 201 admitted students could still be traced to the lead they had been,
  because converting means retyping a person into a tab with no email, phone or notes column.
- **A due-today list.** 168 of 170 open leads in the real file carry no next action date, and the
  booking system's own screen shows 73 of 83 follow-ups overdue by a median of 26 working days.
- **Source stamped on the person and never overwritten.** Source survives for 32 of 201 students today.
- **The channel mix in the synthetic data** follows the real 2026 mix: phone and email largest,
  then website, open day, the rest small.
- **Time to contract by group** follows the real 2025 medians: maritime school about 14 days, secondary
  school about 31, training centre about 24, international far longer.
- **Walk-in as a manual quick add**, because a walk-in produces no inbound event. Confirmed by you.
- **Duplicate checking on add**, because the real file already contains repeated names, repeated
  emails and the same person spelled three ways.

## What is provisional and marked as such in the interface

- **The pipeline stages** New, Contacted, Follow-up, Application, Contract, Admitted, Not proceeding.
  A working guess for testing the screens. Marked provisional on the dashboard and on every person.
- **The document checklist.** Taken from what the current admissions file tracks. Whether the CRM
  should own these or only mirror another system is not decided.
- **Owners**: Admissions owns every person. Marketing owns campaigns and brings leads in, which
  the source and campaign fields record, but it never owns a record and is never responsible for
  documents. If a second owner is ever added, the rule to reinstate is: a record that reaches
  Application, Contract or Admitted hands over to Admissions automatically.
- **The open-day follow-up rule** (marking attendance creates a follow-up task in two days) is a
  proposal, not an agreed procedure.
- **Default next actions per stage** are guesses.

All of the above live in `config/prototype.json` and can be changed without touching code.

## What still needs Ieva

1. Are these the real stages, and what is missing between them?
2. What does she want to see first at 08:30? The dashboard is my guess at her morning.
3. Which of the twelve onboarding ticks belong in the CRM, and which only mirror NOVIS, N3 or VIIS?
4. Are school leavers, maritime school applicants and international applicants worked differently today?
5. Who owns a lead, and does ownership ever move?
6. What happens to an open-day visitor who does not apply straight away?
7. Which numbers does management actually ask for?

## Deliberately not built

No authentication, no real provider integrations, no email or message sending, no production
database, no migrations, no deployment. The channel connectors live in the separate `channel-spike`
artefact and are not wired into this prototype: the intake screen here shows synthetic events.
