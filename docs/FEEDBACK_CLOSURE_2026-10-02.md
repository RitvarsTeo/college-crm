# Ieva and Aigars feedback - closure matrix, 02.10.2026

Session 5, branch `audit/2026-10-02-feedback-closure-s5`, cut from `ui/2026-10-02-journey` at
`561bce2`. **944/944. NOTHING DEPLOYED.** Production is still `292b4f9`.

**Sources read:** `docs/IEVA_AIGARS_FEEDBACK_VERBATIM.md` (the record), `docs/BACKLOG.md` (rows
40-71, 106-124, the 28-29.09 Aigars passes, the 01.10 "actionable items finished" table, the 02.10
handoff), `docs/DECISIONS.md` (decision 8, D-C1 to D-C8), `../MVP_MAP.md` (IEVA-1), KB 08 P5/P8,
the code on this branch, and the sibling lane `ui/2026-10-02-main-ab` (`1bc018d`).

**How each line was checked:** clicked on the running app (`intake-closure-s5`, port 8875,
synthetic data, in memory), plus the test named. "DONE" means seen working, not read in code.

**Rule:** every line ends DONE or BLOCKED. A business rule was never invented to close one.

## The matrix

| # | Item | Source | Current state (seen) | Action | Test | Commit | Status |
|---|---|---|---|---|---|---|---|
| 1 | **Cold / Reject: the data survives a deploy** | Ieva 30.09 10:14; MVP map IEVA-1 | `closed_tag` was in CREATE TABLE only. Production's `people` table exists, so on deploy **every status change** (the route clears the tag on any stage) would fail on a missing column | Added to `ADDED_COLUMNS`: one `ALTER TABLE people ADD COLUMN closed_tag TEXT` at boot | `closed_tag.test.js`: old DB, column dropped, reopened | `0e1da1d` | **DONE** |
| 2 | **Cold / Reject: offered on every close path** | same | The close dialog offered it; **the People quick edit could set Not proceeding with no tag at all** | Same two choices from `config.closedTags` on the quick edit; tag sent | `closed_tag.test.js`; closed a person from People as Cold, read back `closed_tag=cold` | `1345cd7` | **DONE** |
| 3 | **Cold / Reject: readable, "priekš statistikas"** | same | Stored, **shown nowhere** | Outcomes > Not proceeding: "Cold 1 · Reject 0 · no tag 17"; each row and the person page say Cold or Reject beside the reason | `closed_tag.test.js`, `outcome_reasons.test.js`; read on screen | `1345cd7` | **DONE** (function) |
| 3b | Cold / Reject: the FORM of that screen | MVP map: "the field and the screen go to Ritvars as an A/B first" | The field was built on 02.10 (`b5f3a4c`) and the count line now, both without an A/B on record | none, not mine to pick | - | - | **BLOCKED** - an A/B is owed by the MVP map - **Ritvars** - look at Outcomes > Not proceeding and keep, change or ask for an A/B |
| 4 | Cold / Reject: going back clears the tag | Ieva: "a cold one sometimes becomes an active lead again" | Moved the Cold person back to New: `closed_tag` null, appears under No next step | none needed | `closed_tag.test.js` | `b5f3a4c` | **DONE** |
| 5 | Cold / Reject: marketing to the cold ones | Ieva: "var padomāt par ... mārketinga aktivitātēm ... tiem, kas ir cold" | Not built. She said "one can think about", not "build" | none: a filter or export would be unasked content | - | - | **BLOCKED** - not yet a requirement - **Ieva / Tetiana** - say what marketing needs from Intake (a filter, an export, a Mailchimp segment) |
| 6 | **Journey stage terminology** | Aigars 24.09 row 50 ("contacted once, waiting for reply"); D-C1 | Seven stages in `config.stages`, driven by config, the code asks for a stage by role (`stageRoles`). **Correction:** the 01.10 backlog says "the screen says they are provisional"; it does not. The tag was removed on purpose 29.09 (`6b25ce7`, no nagging), the caveat lives in DECISIONS.md and config | none: renaming is her business language | `intake.test.js`, `workflow.test.js` (stageRoles) | - | **BLOCKED** - only Ieva's words can name them; she approved the ORDER 29.09 ("sakārtots secīgi"), never the names - **Ieva** - the names she uses for each stage, or "keep these" |
| 7 | **Item-by-item Next Step model: shown** | Aigars row 51; D-C3; Ieva 29.09 | Journey > "What comes next" > **Step by step**: 5 steps, each its own count and filter | none | suite | `285d4ec` | **DONE** |
| 7b | Next Step model: the LIST itself | D-C3 "the next-step list, item by item; whether document chasing belongs here" | `config.nextActions`: 19 steps in 4 groups drive the picker. Nobody from Admissions has reviewed them | none | - | - | **BLOCKED** - a review, not code - **Ieva (Aigars asked for it)** - go through the 19 and mark keep / rename / drop, and say if document chasing belongs |
| 7c | Next Step: writing it keeps your place | Aigars rows 47/116 quick edit; Ieva's Next Steps | **Three defects found by clicking:** the Journey card's **Edit** did nothing; **saving a note** jumped to the person page under a `#/journey` address and the thread stayed stale until reload; **Plan a next step** from Today jumped the same way | Edit opens All people with the form; note and plan redraw the screen they were made on; the Journey thread is re-read | `journey_edit_button.test.js`, `note_stays_put.test.js` (cache line sabotaged: red) | `7c3f30a`, `a6a290f`, `80710a6` | **DONE** |
| 8 | **Outcome reasons: the model** | Decision 8; D-C4; Ieva | 10 reasons in config, the server refuses a close without one and "Other" without a note; Outcomes lists all ten with counts, unused at zero | none | `outcome_reasons.test.js` | `e8896dc` | **DONE** |
| 8b | Outcome reasons: the WORDING | Decision 8 "Provisional until Admissions validates the list"; D-C4 | Unvalidated | none | - | - | **BLOCKED** - **Ieva** - confirm or change the ten reasons |
| 9 | Finished means finished | IEVA-3/4/5, 30.09 | Closing finished the open step; the cold person had no step left | none | suite | `7d1bab5`, `ffd7e54` (replays of `ff3b444`, `7b327bd`) | **DONE** |
| 10 | **Feedback / history: per-person thread** | Aigars #3 (28.09) | Thread on the Journey card; a note written there appears at once (count 2 -> 3), newest first | stale-thread fix, row 7c | `note_stays_put.test.js` | `285d4ec`, `a6a290f` | **DONE** |
| 10b | History visibility for an ordinary user | DECISIONS 2 / backlog row 12 | The History screen says itself: "does an ordinary user see no history at all, or only their own actions? Nobody has decided" | none | `history.test.js` | - | **BLOCKED** - a decision - **Ritvars with Aigars** - none, or own actions only |
| 10c | In-app feedback (HELP pill, readers Aigars + Ritvars only) | Aigars rows 49, 66, 67 | Built 24.09, sabotage-proven tests | none | `feedback.test.js`, `feedback_question.test.js` | 24.09 | **DONE** |
| 10d | Being told outside the app that feedback arrived | row 67, open question 13 | In-app count only; the app sends no mail | none | - | - | **BLOCKED** - **Ritvars** - which channel (email, none) |
| 11 | **Phone chart readability** | Aigars 28.09 "Phone Home chart labels are tiny" | Measured at 375 px: 12.5 px labels, 5 month ticks 58 px apart, no overlap, newest month kept, all 10 columns carry an aria-label | none | suite | `285d4ec` | **DONE** |
| 12 | Add a lead | Ieva 29.09 11:26 | "Add lead" on the Inbox, "+ Add person" on People; she confirmed 30.09 09:59 | none | `ieva_feedback.test.js` | 29.09 | **DONE** |
| 13 | Contact + notes on each Next Steps row | Ieva 29.09 11:28 | Today rows carry phone, email and the note; she confirmed 30.09 | none | `ieva_feedback.test.js` | 29.09 | **DONE** |
| 14 | Metrics first, journey in order, overdue and today first | Ieva 29.09, praise | Home opens on figures; Today: Overdue, Due today, Coming up, No next step | none | suite | - | **DONE** |
| 15 | Unanswered calls in New Leads | Ieva 30.09 10:16 | Answered by Ritvars 01.10: the PBX filter plus Stage 2 AI Review | none in this lane | - | - | **BLOCKED** - Stage 2, not V1 - **Ritvars** - the six missing AI Review decisions |
| 16 | The rest of Ieva's 10:23 message | Ieva 30.09 "ir viens leads, kurš jau ir admitted..." | Cut off in the screenshot | none, must not be guessed | - | - | **BLOCKED** - **Ritvars** - paste the whole message |
| 17 | "Not clear yet" | Aigars row 108; D-C2 | Concept C has no such pile; an unclear item gets a next step like anyone | none | - | - | **BLOCKED** - **Ieva, Aigars** - confirm D-C2 |
| 18 | Does a human filter before Intake | Aigars row 52 | Word filter drops sales pitches; the rest reaches the Inbox. Ritvars's direction: AI may filter the Inbox, never destroy | none | - | - | **BLOCKED** - Stage 2 - **Ritvars** |
| 19 | Lifecycle facts "Application form started" / "Matriculated" | Aigars #4 | Recorded live since 29.09; the SIS mapping is PROVISIONAL, only the 6 test applicants exist | none in this lane | `lifecycle.test.js` | `1780c71` | **BLOCKED** - one real SIS applicant - **Ritvars** (Applications lane) |
| 20 | Aigars #5 | 28.09 pass | Never written down | none | - | - | **BLOCKED** - **Ritvars** - restate it |
| 21 | Update when real channels connect; V1 overview; then the domain | Aigars 30.09 10:01 | Rests on whether PBX is live: he told the team yes on 01.10, the repo says 0 provider rows | none | - | - | **BLOCKED** - **Ritvars** - open `#/channels` signed in and read the Phone row |
| 22 | D-C5 drag backwards, D-C6 Home KPIs, D-C7 person facts, D-C8 Marketing's part | DECISIONS 28.09 | Open, each with its owner | none | - | - | **BLOCKED** - **Ieva** (C5-C7), **Ritvars** (C6), **Aigars + Tetiana** (C8) |
| 23 | `--v-open:#F7C04F` as a data colour | KB 08 P5 | Fixed to mustard `#E0A526` on lane `ui/2026-10-02-main-ab` (`1bc018d`, read). Not on this branch, deliberately not duplicated | none here | `metrics_colours.test.js` there | `1bc018d` | **BLOCKED** - merge order - **whoever joins the lanes** - take `1bc018d` |

## Release notes for whoever deploys this

- **Schema change on production:** `0e1da1d` adds one column, `people.closed_tag TEXT`, at boot,
  through the same `ADDED_COLUMNS` path `nationality` and `inbound.source` used. Read-only check
  after deploy: the column exists, every row is NULL.
- Without `0e1da1d`, `b5f3a4c` must not ship: every status change would fail.
- `doNote` and `doNewTask` now call `route()` off the person page. The classic UI uses the same
  `#/person/` address, so it keeps its behaviour.

## Found and not mine

- Synthetic seed steps ("Check the documents", "Prepare the contract"...) are not in
  `config.nextActions`, so "What comes next" shows all 34 under **No group**. On production the
  imported steps ("Get in touch (from the sheet)") will do the same until steps are planned from
  the list. Honest, not a bug, but the group row says little until then.
