# INTAKE - control state, 02.10.2026 (Session 1, master control)

The authoritative state for this run. Every other session reads this before it assumes anything.
Branch `control/2026-10-02-s1`, cut from **`561bce2`**. Production is **`292b4f9`** and was not touched.

Statement kinds (KB 08 P1): **[seen]** evidence read today, **[decided]** Ritvars's decision,
**[guess]** hypothesis, nothing else.

## Baseline

| | |
|---|---|
| Run baseline | `ui/2026-10-02-journey` @ **`561bce2`** (clean tree) [seen] |
| Production | **`292b4f9`**, proven byte-identical 02.10 [seen in Pin]. Not mutated by this session |
| Sessions already cut | `crm-main-ab` (`ui/2026-10-02-main-ab`), `crm-channels-s3` (`ui/2026-10-02-channels-s3`), `crm-applications-s4` (`ui/2026-10-02-applications-s4`) - all contain `561bce2`, 0 commits yet [seen 02.10] |
| Sessions 5 and 6 | **no worktree found** at the time of writing. Their briefs were not seen by this session, so their tasks are not invented here |
| Tests | 933/933 recorded at `074d141`; `561bce2` changes only `docs/BACKLOG.md`. **Not re-run by this session** |

## Product facts (fixed)

- **Name: INTAKE.** Never "CRM" in words a user reads. (Folder, package and repo names stay `college-crm`; they are identifiers.)
- **Lanes:** 1 INTAKE MAIN V1 · 2 INTAKE CHANNELS · 3 INTAKE APPLICATIONS. Applications lives **inside Reports**, no new menu item [decided 01.10].
- **Lifecycle** [decided 02.10]: `Channels -> INTAKE -> qualification / follow-up -> apply.novikontas.org -> payment -> SIS`
- **AI Review = Stage 2** and does not block V1. 5 of 11 decisions are written in; **6 are missing** from this repository.

## THE CORRECTION THIS SESSION FOUND: production has real provider rows

The Pin, the reconciliation doc, the verbatim page and memory all said **0 rows from a real provider**.
That was true on 01.10 00:45 UTC and **stopped being true the same morning.**

Evidence: the nightly production backup `_backups/2026-10-02T01-17-43Z` (status VERIFIED, 24 tables, 792 rows).
Counts only were read; no personal data was printed.

| Backup | `inbound` by source |
|---|---|
| 30.09 00:45Z | simulated 15 (phone 9, sis 6), provider **0** |
| 01.10 00:45Z | simulated 15, provider **0** |
| **02.10 01:17Z** | simulated 15, provider **44**: **phone 4, gmail 40** |

`source='provider'` is written only when the channel mode is `live` (`src/sync.js:148`, `:438`).

- **Phone:** `sync_state pbx_until` ran **01.10 05:27Z** (the daily 05:15 cron): fetched 104 call records from TeleGroup, kept 6 calls dated 30.09, 4 went to the Inbox. `pbx_calls` holds 15 rows, 6 from that run.
- **Gmail:** `gmail_oauth` = option B connected **01.10 13:27Z** for mailbox **edu@novikontas.org**; 40 provider rows; last poll 01.10 17:00Z. `CHANNEL_MODE_GMAIL` is set in Production (22h before 02.10 read).
- **All 44 provider rows are still `state=new`** - nobody has processed them in Intake yet [seen].

### The PBX contradiction - settled on evidence, with the gap stated

- Ritvars, 01.10: *"PBX ir live."* - **supported.** A real TeleGroup pull wrote real calls into production at 01.10 05:27Z.
- The repository's "0 provider rows / not live verified" - **stale since 01.10 05:27Z.**
- **What is still NOT proven:** that it keeps running. "Live" here means a **once-a-day pull** (cron `15 5 * * *`), not real-time and not the screen-pop. The 02.10 run happened after the backup. The **03.10 backup** shows whether 01.10's calls arrived. One authenticated read (or the checker gate) would settle it today.

## Channels - 12 active, plus 1 parked, 1 dropped, 2 downstream

Production env names read 02.10 with `vercel env ls production` (names only) [seen].
"Deployed configuration" = `config/channels.json` in `292b4f9`, which **still lists Google Form and Open Day as active** - the lifecycle fix is in `561bce2`, not deployed.
"Local" is always empty on any checkout and proves nothing.

| # | Channel | Owner | Access / credential | Local | Prod configured (env, 02.10) | Live verification | **State** | Blocker |
|---|---|---|---|---|---|---|---|---|
| 1 | Website enquiry form (Tilda) -> `/api/inbound/website` | **Ritvars** | `WEBSITE_FORM_SECRET` + Tilda webhook | none | **No** secret | 0 rows | **Needs owner action** | Ritvars: set the secret, paste the webhook in Tilda. He wrote 01.10 "Tilda tagad konektēju"; the env shows it did not land |
| 2 | Email (Gmail) | Marina | option B OAuth (refresh token encrypted in DB) | none | **Yes** - `CHANNEL_MODE_GMAIL`, Google client | **edu@: 40 provider rows** | **Live verified (edu@)** | training@novikontas.org: not connected [seen: only one mailbox in `gmail_oauth`]. DWD (option A) needs Super Admin, Marina lacks it |
| 3 | Facebook | Oksana | `META_APP_SECRET` | none | **No** | 0 | **Blocked by external provider** | Meta APP REVIEW, can be refused. Oksana said access "this week" (01.10) |
| 4 | Messenger | Oksana | `META_APP_SECRET` | none | **No** | 0 | **Blocked by external provider** | same |
| 5 | Instagram | Oksana | `META_APP_SECRET` | none | **No** | 0 | **Blocked by external provider** | same |
| 6 | WhatsApp | Oksana | `META_APP_SECRET` | none | **No** | 0 | **Blocked by external provider** | same. +371 23111114 settled, not a blocker |
| 7 | Mailchimp | Ritvars | `MAILCHIMP_WEBHOOK_SECRET` | none | **Yes** + mode | URL handshake 30.09 13:40Z; **0 provider rows** | **Configured** | Paste the address into the audience webhook (or it is pasted and nobody has subscribed - not distinguishable from here) |
| 8 | Phone (TeleGroup PBX) | Ritvars | `PBX_API_TOKEN` | none | **Yes** + mode | **4 provider rows, 01.10 05:27Z** | **Live verified (daily pull)** | Continuity unproven past 01.10 (see above) |
| 9 | LinkedIn | Tetiana | `LINKEDIN_CLIENT_SECRET` | none | **No** | 0 | **Blocked by external provider** | Developer app with an APPROVED webhooks use case |
| 10 | TikTok | Tetiana | `TIKTOK_CLIENT_SECRET` | none | **No** | 0 | **Blocked by external provider** | Developer app with webhook access |
| 11 | In person | nobody, by design | none | n/a | n/a | n/a | **Configured (by hand, finished)** | none |
| 12 | Agent or partner | **nobody named** | `AGENT_TOKENS`, shape undefined | none | **No** | 0 | **Needs owner action** | Novikontas has not named the first partner (`prototype.json openQuestions.agentPartnerOwner`) |
| - | Open Day | nobody - parked | - | - | - | - | **Parked** [decided 30.09] | holds nobody; Aigars holds no blocker |
| - | Google Form | - | - | - | - | - | **Dropped** [decided 01.10 + 02.10] | none |
| - | apply.novikontas.org | Applications lane | - | - | - | - | **Downstream, not a channel** | - |
| - | SIS | Ritvars | `SIS_API_TOKEN` | - | **Yes**, `CHANNEL_MODE_SIS` | last run 01.10 12:48Z: fetched 1, stored 0 | **Integration, not counted** | SIS holds only the 6 archived team tests, so real-applicant checks are blocked |

**Count: 2 live verified (Phone, Gmail edu@), 2 configured (Mailchimp, In person), 2 need owner action (Website, Agent), 6 blocked by an external provider (Meta x4, LinkedIn, TikTok).**

The Meta "question vs work" choice in the reconciliation doc is **still Ritvars's**. The six "Blocked by external provider" rows above use the plain meaning (an outsider can refuse); `channels.json blockerKind` was **not** changed.

## Visual system - authoritative tokens (KB 08 P5, written 02.10)

| Token | Value | Use |
|---|---|---|
| Novikontas / logo blue | `#29a8df` | data blue, focus |
| App navy | `#0a2463` | every navy the app draws |
| Logo navy | `#022367` | inside the official logo SVGs only |
| Data mustard | `#E0A526` | second data colour |
| Signal amber | `#F7C04F` | today / needs you. **Never a quantitative data colour** |
| Alert red / warning tokens | unchanged | own family |

**No third navy. Code check [seen]:** `#0a2463` is the app navy token and `#022367` appears only inside the logo SVGs. The dark sea surfaces (`#0f2f4f`, `#08182e`, `#133a60`) are the sea palette, not navy tokens. **One to check:** the sign-in uses `--gate-ink:#0f1b35` (`src/app.html:196`) - Session 2 decides with Ritvars whether that is a third navy.

**Gradient:** one system, recorded in P5 - `radial-gradient(120% 80% at 50% 0%, <glow> 0%, transparent 60%)` over the vertical deepening; glow dark `#17456e`, light `#fbfcfd`. Already in `src/app.html:855` and `:861`. Extend, never fork.

**Depth:** DEPTH BELONGS TO THE FRAME, NEVER THE DATA MARK. Recorded in P5. Primary evidence = the recorded Square research. `074d141` already flattened the donut face.

**Motion:** at most TWO coherent scenes per tab; a scene may hold related movements telling one story. Recorded in P5.

**A/B:** A and B are genuine alternatives, built, shown, Ritvars picks. **No C yet.**

### Known breaches carried forward (not fixed here - they belong to MAIN)

1. **Home donut uses the signal amber as data:** `src/app.html:842` (dark) and `:1044` (light) `--v-open:#F7C04F` -> **`#E0A526`**. Colour only, no redesign.
2. **Dark cards are glass, the 30.09 decision says solid.** `src/app.html:864-866` gives `.c-card`, `.c-health`, `.kstrip`, `.ksec` etc. a see-through `--glass` + `backdrop-filter` in dark. Kit part 2 README line 29: *"never glass"* (30.09). The older 28.09 row "glass panels" (`61d0fb0`, LIVE) is the earlier decision. **Newest decision = solid.** Same README line 76 still says "glass panels over the sea" - the kit contradicts itself. Flagged to Ritvars, not changed.
3. **The Channels screen's state words** (`chViewA`: Failed / Receiving / Ready / By hand / Not set up) are not the seven states above. "Ready" cannot tell Configured from Needs owner action.

## DONE

- Baseline confirmed `561bce2`, clean; three session worktrees confirmed cut from it.
- Production evidence read from the 02.10 backup: Phone and Gmail(edu@) are **live verified**; 44 provider rows.
- Production env names re-read 02.10: Website secret **not** set; Meta, LinkedIn, TikTok, Agent, checker key **not** set.
- KB 08 P5: tokens, the one gradient system, the frame-not-mark line, scenes-not-components.
- This document; Pin corrected (below).

## CURRENT

- Production `292b4f9`; run baseline `561bce2`; nothing from 02.10 deployed.
- 12 active channels, states as in the table.

## IN PROGRESS

- Session 2 MAIN [reported by S2 + seen in git, 02.10]: `ui/2026-10-02-main-ab`, 983/983, NOT deployed. **Breach 1 fixed** (`1bc018d`, `--v-open:#E0A526` in both modes, seen). Spine `5e20aad`. Home = B decided (`17d1a4d`), Journey takes A's band (`3235467`). Then `449f35a` Home shadows, `ac13fd7` Journey quick view / menu blue tint / black heading bars, `bea0556` tab opening + count-up, bump only on changed figures.
- Session 3 CHANNELS: see its branch.
- Session 4 APPLICATIONS [reported by S4, 02.10]: `ui/2026-10-02-applications-s4`, 945/945, NOT deployed. `581a032` Applications chapter, `496cbfa` funnel split, `b015c57` label "Academy decision" (Ritvars renamed it from "College decision"), `495d1c3` Q1 recorded.

## BLOCKED

- **BLOCKED - Website channel not configured** - Ritvars - set `WEBSITE_FORM_SECRET` in Production and paste the webhook into Tilda.
- **BLOCKED - Meta four** - Oksana, then Meta - page access and APP REVIEW.
- **BLOCKED - LinkedIn, TikTok** - Tetiana, then the provider - developer apps with webhook access.
- **BLOCKED - Agent** - Novikontas (unnamed) - name the first partner and who sets the link up.
- **PARKED - training@ mailbox** - next project scope (Ritvars 04.10). Was: Marina authorises option B.
- **BLOCKED - Phone continuity proof** - Ritvars - one signed-in look at `#/channels` Phone row, or GO to deploy the checker gate (`feat/checker-gate-2026-09-30`), or wait for the 03.10 backup.
- **BLOCKED - real-applicant SIS checks** - SIS holds only the 6 archived tests - a real applicant must register.
- **BLOCKED - 6 AI Review decisions** - the AI Review / ChatGPT session - paste them into the repo, or re-take them.
- **BLOCKED - Journey stage names** - Ieva - her names; the rest of her 30.09 10:23 message is unknown.
- **BLOCKED - Meta `question` vs `work` vs `approval`** - Ritvars - one of the three options in `CHANNEL_RECONCILIATION_2026-10-02.md`.
- **BLOCKED - glass vs solid dark cards** - Ritvars - confirm solid (30.09) wins.

## NEXT - what each session must do (their own lanes; not redesigned here)

**Session 2 - INTAKE MAIN V1 (`crm-main-ab`).** The handoff in `docs/BACKLOG.md` (02.10) is the brief: the spine hairline behind the menu icons, metrics Home in `#29a8df` + `#E0A526`, depth on the frame only, two scenes per tab, KPI figures as cards (decided 30.09, not an A/B), then **A and B**, no C. Plus: fix breach 1 (donut `--v-open`), colour only. Leave breach 2 alone until Ritvars answers. Restart the preview server after any `/api/config` edit (it reads config once).

**Session 3 - INTAKE CHANNELS (`crm-channels-s3`).** Take this table as truth: Phone and Gmail are **live verified** - the config's Phone blocker *"Nothing from TeleGroup"* and Gmail's *"twenty minutes of Marina's time"* are stale. Map the screen to the seven states (breach 3), with **Live verified** only where a `source='provider'` row exists. Gmail's state is per mailbox (edu@ live, training@ not). Do not touch `blockerKind` for Meta until Ritvars picks. No production mutation.

**Session 4 - INTAKE APPLICATIONS (`crm-applications-s4`).** Applications view inside Reports (placement locked 01.10); apply.novikontas.org is downstream, never a channel. The weekly-funnel basis (registration-week cohort) **still waits for explicit product confirmation** - build A and B of it if it is a meaningful choice, do not pick. Real-applicant checks stay blocked (SIS has only tests). No production mutation.

**Sessions 5 and 6.** Not started when this was written; their briefs were not seen here. They must read this file first.

**Every session:** no deploy, no env change, no production write. Release authority for a deploy stays with whoever Ritvars names, on his GO.

## QUEUE - added 02.10 by Ritvars (SAID, not built)

| # | Item | Owner session | Status |
|---|---|---|---|
| Q1 | **apply.novikontas.org may be called "Academy Application form"** wherever Intake names it (Reports > Applications, the lifecycle line). Still downstream, never a channel | Session 4 APPLICATIONS | SAID, recorded by S4 in its backlog (`495d1c3`) |
| Q2 | **Two-colour sentences, in subtle places.** Reference [seen 02.10]: apply.novikontas.org hero H1 *"Studē / Novikontas Akadēmijā"* - first word in brand blue, bold 700, the rest in white on the app navy, Inter. Use it sparingly (e.g. a section title or empty state), never on data, never more than one per screen | Session 2 MAIN | SAID, recorded by S2 (`bea0556`); goes to Ritvars as A/B before build |
| Q3 | **Website enquiry form: teach the adapter the real Tilda field names, BEFORE the webhook is ticked on any form.** [seen 04.10, live site] The only college enquiry form is EN-only (`college/en`, `college/en/contacts`) with fields `Name Surname`, `Email`, `Phone`, `Study Program`, `Source`, `Additional Comments`. `src/adapters.js` website (in `292b4f9`) matches exact names only (`pickFrom`, case-insensitive): it would keep Email + Phone and LOSE name, programme, message and source. Add aliases: name <- `name surname`; programme <- `study program`; message <- `additional comments`; source answer <- `source` (into `extracted`, NOT the utm source). Also the `college/en/contacts` contact form: `Name`, `Name_2` (surname?), `Phone`, `Email`, `Textarea` - join Name + Name_2. **Do NOT rename fields in Tilda:** two Make webhooks on the same forms may depend on them. Test with a Tilda-shaped fixture, then release on Ritvars's GO; only then he ticks the webhook on those two form blocks | Session 3 CHANNELS | **BUILT** `4bf9921` + correction `e7bac76` (S3: on the contact form Name_2 is COMPANY, stored as form_company, not joined to the name). **DECIDED by Ritvars 04.10: the Website channel is TEMPORARY** - only for the 3 forms still live on the EN college pages; the next website version has NO forms, and when it goes live Website is DROPPED like Google Form and apply.novikontas.org does the work (`b3da18a`). Next patch |
| Q4 | **Test copies: the "Acting as" picker shows two choices, User and Admin, with NO names** (Ritvars 04.10: "No need to show all users!"). [seen in code] `drawActorPicker()` lists every user and admin by name in `#actorBlock`; it is shown ONLY when nobody is signed in (`AUTH.on && AUTH.user` hides it and shows `#whoBlock`), so production users never see it. Keep that. Behind the two choices: User acts as a non-admin user, Admin as an admin, so `isAdmin()`, Channels and the `by` field still work; no person's name in the list | Session 2 MAIN | SAID 04.10 - small, may join this patch if built before the release branch is cut |
| Q5 | **Left menu A/B, LIGHT mode only** (Ritvars 04.10). Today on MAIN (`ac13fd7`): `linear-gradient(180deg,#ffffff 0%,#ffffff 40%,#e5f2fa 100%)`. **A - the gradient starts sooner:** the blue tint arrives by ~50% and holds to the foot (read as: white at the top, full tint by 50%; confirm with Ritvars on the screen). **B - solid brandbook Novikontas blue `#53a7db`** (the brandbook blue, his words; a SURFACE, so the "never text" rule is not touched). On B the menu words and icons go app navy `#0a2463`: white on `#53a7db` is about 2.6:1 and fails. Dark mode unchanged in both. Built as a real switch like `?home=` / `?chv=`, no C | Session 2 MAIN | **BUILT 04.10** `32232ce` (S2), 991/991, `?menu=a **+ IMMERSIVE: picked 3 "all of it" (04.10, from 3 mockups):** glow from the top deepening to the foot (locked recipe, light tones of the brand blue), the official white logo as a faint watermark low in the menu (symbol only), the menu lifting off the page (soft shadow + light edge), the active spine line white with a glow. Frame only, no pills. S2 building, next patch |
| Q6 | **Call pop-up: when the phone rings, the caller's person page opens (or a corner notification) for whoever answers, so they can check the person fast and start adding comments** (Ritvars 04.10: "calls build!"; first SAID 30.09, memory intake-call-screen-pop). [seen] Calls reach Intake once a day today (cron `15 5 * * *`). The unknown that sets the timing: does TeleGroup's call list show a call while it RINGS? Build the version that works either way: the open, signed-in app asks Intake every ~10 s for calls in the last 2 minutes (server reads TeleGroup, token never leaves the server; reuse `GET /api/admin/pbx/live` from `test/pbx-live-2026-09-30`), matches the number to a person (or a new lead), and opens it for the operator who answered. The comment thread on the person page already exists. Screen = A/B for Ritvars: A full person page opens, B small corner card with "Open". One test call to +371 23111114 (press 1) after deploy shows ringing vs after-hang-up | Session 3 CHANNELS (after Q3) | BUILT (S3). **Ready for the next patch: `ui/2026-10-02-channels-s3` up to `dbb4546`** (1066/1066; the report first said 5f5cf8f, corrected by S3, release 51290c4 merged; per-minute cron reverted `ca1e5cb`, vercel.json daily again - deploys on Hobby). The per-minute cron waits alone on branch `account-move/pbx-every-minute` (`0ed2acd`), merge only after the account move. Web Push needs VAPID keys from Ritvars |
| Q7 | **Strip the Channels screen** (Ritvars 04.10, angry: "This is for work ... less is more"). One line per active channel: name + one-word state + the click to Settings. No cards, notes, proof cells, dates, "Delivers to", counts, env sentence; parked/dropped hidden; no A/B switch. The record stays as data in channels.json | Session 3 CHANNELS, TOP PRIORITY before Q6 | **BUILT 04.10** `8c71655` (S3, 1040/1040): h1 + 12 lines, name + one word + dot, whole line opens Settings; release merged `dc67277`; Q6 card trimmed the same way `368a77f`. Not deployed. Next patch, after Ritvars looks |
| Q8 | **Data loss found by S3:** `toIntake()` drops the adapter's `extracted` for every channel. Fixed for Website only in `4bf9921`. Still lost: programme / intent from apply-sheet, Mailchimp, Open Day, phone queue intent, LinkedIn, TikTok, Agent | Session 3 CHANNELS, after Q7 | SAID 04.10 - next patch |

Note on Q2: the apply site colours that word `#53a7db` (brandbook blue). KB 08 P5 (30.09) keeps `#53a7db` as marker/hover, **never text**, and the app's blue is `#29a8df`. So Intake takes the PATTERN with `#29a8df`, not the apply site's colour - unless Ritvars says otherwise.

### Website channel state, 04.10 [seen]

- Vercel Production: `WEBSITE_FORM_SECRET` (secret) + `CHANNEL_MODE_WEBSITE=test` (config) set by Ritvars; redeployed (same code, new deployment `college-9ykd9fyb6`).
- `/api/inbound/website` now answers 401 "shared secret did not match" to a caller without the key (was 409 "off").
- Tilda novikontas.org > Forms: webhook `crm-novikontas.vercel.app/api/inbound/website`, HEADER `x-crm-secret`, Send cookies, **Active**. **Not yet ticked on any form block**, deliberately, until Q3 ships.
- **The LV college pages have NO enquiry form**; their only route is the apply.novikontas.org link. Site-wide `email`-only and `Textarea`-only forms are a newsletter box and a widget, not enquiries. `page31435098.html` holds an old `amission_form_test` form.
- State: **Configured** (was Needs owner action). Live verified only after a real submission lands.

## 04.10.2026 - RELEASE DECISION: cut ONE patch now, deploy on Ritvars's GO behind four gates

### What was gathered [seen 04.10]

| Session | Branch @ tip | Since 561bce2 | Notes |
|---|---|---|---|
| S2 MAIN | `ui/2026-10-02-main-ab` @ `bea0556` | 15 | Home = B **decided** (`17d1a4d`), Journey band, spine, mustard donut, tab opening + count-up |
| S3 CHANNELS | `ui/2026-10-02-channels-s3` @ `f388dcc` | 4 | A/B still open; config lifecycle (Google Form dropped, Open Day parked); 2 of 12 live verified |
| S4 APPLICATIONS | `ui/2026-10-02-applications-s4` @ `eca5ddc` | 5 | Applications chapter in Reports, "Academy decision", Q1 name |
| S5 CLOSURE | `audit/2026-10-02-feedback-closure-s5` @ `cf6b112` | 18 | Ieva/Aigars bugs fixed; **`0e1da1d` closed_tag migration - mandatory with MAIN** |
| S6 QA | `qa/2026-10-02-final-control-s6` @ `8cd82b2` | 1 | A/B review package (docs) |
| S1 CONTROL | `control/2026-10-02-s1` | docs | this file |

All worktrees clean. **Combined scratch merge of all six tips** (`scratchpad/merge-0410`, not a real branch):
- one code conflict, `src/app.html` menu/background: MAIN's light menu tint + Channels' dark body via `--sea` (the identical locked recipe) - both kept. BACKLOG conflicts: both sides kept.
- **1026 / 1026** tests (`node --test test/*.test.js`).
- Running build, synthetic data: every menu route renders, 0 page errors, no `undefined/NaN`. Channels B, Reports > Applications, Inbox, Feedback checked by text. Width/dark mode NOT re-checked (pane hidden); S6 did both on 02.10.

### Decision: patch now, do not keep building first

- **Users are waiting on fixes, not on features.** S5 fixed things Ieva hits daily (Edit did nothing, notes jumped away, admitted leads shown overdue, missed calls not in Today, the cold list for marketing). Holding them back has a daily cost.
- **The branches are already drifting.** Clean on 02.10, one code conflict on 04.10. Every day adds conflicts.
- **Production still shows a wrong channel config** (Google Form and Open Day active).
- What stays open (Channels A/B, funnel basis, glass/solid, Meta wording, cold/reject A/B) does not block: Channels is admin-only and ships with its A/B switch as the review surface; nothing else changes what Admissions does.

### The four gates before the deploy (in order)

1. **Fresh production backup.** The nightly has **not run since 02.10 01:17Z** (no 03.10, 04.10 entries in `Projects/Backups/nightly.log`), and the 04.10 offsite copy **failed**: rclone remote `novidrive` is missing from the config. The patch runs a schema change at boot (`closed_tag`), so a backup taken minutes before is required. Ritvars: run `Projects\Backups\run_nightly.cmd` once and confirm VERIFIED. Offsite: reconfigure `novidrive` (separate item).
2. **GO + a named release owner** (Ritvars). Nothing deploys without it.
3. **Release branch from the real tips**, cut fresh with the real identity (the scratch merge is evidence, not the release), full suite on a clean checkout, release-contents check of the whole range.
4. **Release-day record updates in the same branch:** `config/channels.json` `production.commit` says `292b4f9` in 10 places and the Channels screen prints "Running 292b4f9" - must name the new commit, or the screen lies the moment it ships. Website state -> Configured (secret + mode set 04.10). Then: byte check, 401 on private routes, signed-in look at Home, Journey, Channels, Reports.

### Not in this patch

- **Q3** (website field names) - not built yet; the Tilda webhook stays unticked, so nothing is lost by waiting. Next patch.
- Q2 two-colour titles - waits for its A/B.

### 04.10 20:48 - Gate 1 PASSED, and what the fresh backup shows [seen]

- Ritvars ran `run_nightly.cmd`: Intake backup **VERIFIED, 24 tables, 1083 rows** -> `_backups/2026-10-04T17-47-57Z`.
- **Phone continuity PROVEN:** the daily TeleGroup pull ran every day, last 04.10 05:27Z; 7 real calls from 02.10 arrived. Weekend: 1 fetched.
- **Gmail edu@ keeps flowing daily:** provider rows 30.09-04.10, last poll 04.10 05:35Z.
- **SIS: 1 provider row dated 03.10** - possibly the first real applicant. Not opened here (personal data); S4 checks it signed in.
- **110 real provider rows: 86 at `state=new`, 24 auto-filtered. Nobody has worked the Inbox since the channels went live.** Operational, for Admissions, not a release gate.

### 04.10 - Gate 2: GO given, release owner decided

- **Ritvars: "go after q4"**. He left the release owner to MASTER CONTROL.
- **Decided by MASTER CONTROL: this session (S1) cuts the release and deploys.** It holds the merge evidence and the gates. MAIN builds Q4 in its own lane.
- Sent 04.10, both delivered: MAIN -> Q4 first, report the commit, then Q5 (not in this patch). CHANNELS -> Q3 + the Website record (next patch).
- The release is cut at MAIN's reported Q4 commit, together with the tips of S3, S4, S5, S6 and S1 as gathered. Anything committed after that waits for the next patch.

## 04.10.2026 - RELEASED: `62f8178` is LIVE (MASTER CONTROL)

| | |
|---|---|
| Branch | `release/2026-10-04-intake` (worktree `crm-release-0410`), cut from `561bce2` |
| Contents | MAIN `4d13f96` (incl. Q4) · CLOSURE `cf6b112` (incl. `0e1da1d` migration) · CHANNELS `f388dcc` · APPLICATIONS `eca5ddc` · QA `8cd82b2` · CONTROL `8bb1406`; then `6151c28` record (production = code `c3ab3e4`, Website configured) and `62f8178` two Channels tests read the record instead of hard-coding 292b4f9 |
| Not in it | Q3 (`4bf9921`, S3), Q5, Q6 - next patch |
| Conflicts | one code conflict, `src/app.html` menu/background: MAIN's light tint + Channels' `--sea` (same locked recipe) |
| Contents check | 292b4f9 is an ancestor (nothing live dropped); no new SQL file, no vercel.json / package.json change; DB change = `people.closed_tag TEXT` added at boot (nullable); PBX sync now opens a "Call back" task for a known lead's missed call (Ritvars 02.10) |
| Tests | 1030/1030 in the release worktree; on the clean deploy checkout the first run had 2 spawn-tests time out under load (other sessions' servers on 8853/8854/8860), the next two runs 1030/1030 |
| Deploy | `dpl_uTzfeGw6PZNSgxUGoQUinLP41utH`, via `_crm-v1-lane-tools/deploy_verify.sh 62f8178` |
| Verified live | `/` byte-identical to the commit + sign-in script · 72/72 uploaded files identical, none outside git, no risky names · 8 private routes 401 · 23 source/config probes, 0 leaks · `/`, logo, robots, auth/me 200, Google start 302 |
| Migration verified | post-deploy backup `_backups/2026-10-04T18-07-33Z` VERIFIED: `people.closed_tag text` present; 192 people, 1083 rows, same as the pre-deploy backup |
| NOT yet seen | **signed in.** Ritvars: one look at Home, Journey, Channels, Reports |
| Not pushed | the release branch is local; GitHub push only when Ritvars asks |

### 04.10 - Release rules after the Channels screen (Ritvars, angry, 04.10)

- **An A/B Ritvars has not picked never reaches production.** It stays on a branch and is shown to him there. (The 04.10 release shipped the Channels A/B "as the review surface" - that was MASTER CONTROL's call and it was wrong.)
- **Before every release, every changed screen is read for one thing: cut every line that is not a state or an action.** Notes, evidence, provenance and to-dos live in docs.
- Next-patch tips so far: MAIN `1071321` (release merged, Q5 menu A/B waits on his pick) · CHANNELS: Q7 strip first, then Q6 push.

## 04.10 - THE A/B BATCH: one visual language, biggest impact first (Ritvars: "start")

Order: 1 frame (menu, page background, headers) -> 2 language (type sizes, colour roles, one card style) -> 3 shared parts (number cards, lists/tables, buttons, status word + dot, fields) -> 4 screens by use (Today, Home, Journey, person page, Inbox, Reports, Channels, Settings), each audited for notes first -> 5 details (empty states, hover/click, motion, small text). Each step: real mockups on the app with real-shaped data, 2-4 side by side in his browser, he picks, PICKED recorded here, MAIN builds, nothing to production unpicked.

| Step | Pick | Status |
|---|---|---|
| 1a Menu | navy text, white logo, v1.0 removed, logo aligned, immersive 3 | PICKED 04.10 (see Q5) |
| 1a built | real build `07be370` (S2, 1034/1034) checked 04.10 against his pick: navy words, white logo aligned (x 20.01 vs 20), v1.0 gone, glow + watermark + lift; navy on the foot 4.55:1 | BUILT, next patch |
| 1a follow-up | Ritvars told MAIN directly: dark gets immersive menu 3 too (sea glow, .07 watermark, lift, logo aligned, progress line #8fcbef 3px glow); the progress line now runs to the lit child; the menu gradient no longer stretches with page height (100vh, foot colour below). `39e71e5` (S2, 1036/1036) | BUILT, next patch |
| 1b Page header + background | **4 - the menu's blue glow flows into the page top**: page body gets `radial-gradient(70% 45% at 0% 0%, rgba(83,167,219,.22) 0%, rgba(83,167,219,0) 70%)` laid over the locked light sea; page titles navy `#0a2463`, 24px. Light mode | PICKED 04.10 -> S2 |
| 1a white tab | Ritvars to MAIN (screenshot): "lets white up the tab we are in" -> the page you are on (Today, Journey...) is a solid white tab with navy words; the parent keeps the soft pill. Light only. **Then Ritvars: the parent white too** -> BUILT `1eb53a5` (S2, 1041/1041): every lit tab in light is solid white with navy words. Release merged first (15a8965), then `bd45f42` (S2, 1041/1041) | BUILT, next patch |
| 2a Text sizes | **3 - strong hierarchy** (suggested by MASTER CONTROL, picked by Ritvars): page titles 30/750 navy, headline figures 30/750 navy (red stays red), people's names 17/700 navy, secondary details stay small (13, slate), small labels 11.5/600, status chips 13.5. Ink for names and figures = navy `#0a2463` instead of near-black `#011111`. Applies app-wide | PICKED 04.10; **BUILT `ec0ab80`** (S2, 1040/1040, measured at 1440 + 390, no overflow), one commit after the 2nd release, waits for the next patch. **Open for Ritvars:** Home's Needs-you figures (44px) and hero card (40px) were kept ABOVE the 30px step as the one focal point (P5); one-line change if he wants 30 |
| 2c Card style | **3 - one card + thin brand-blue top edge** (Ritvars; MASTER CONTROL had suggested 2): every card white, radius 14, border 1px rgba(10,36,99,.07), shadow 0 1px 2px rgba(10,36,99,.06) + 0 10px 24px rgba(10,36,99,.08), **3px `#53a7db` top edge** as the family mark; the Needs-you card keeps its amber top (signal); no boxes inside cards (Needs-you tiles become columns split by 1px hairlines). App-wide, belongs in kit part 2 (`kit-panel`) too | PICKED 04.10 -> S2 |

## 04.10.2026 21:0x - SECOND PATCH RELEASED: `0078bff` LIVE, pushed to GitHub

| | |
|---|---|
| Branch | `release/2026-10-04-intake-2` (from `2d4963a`), **pushed to origin** (github.com/RitvarsTeo/college-crm), tip `3da59ab` (docs) |
| Contents | MAIN `370b411` (menu final, immersive light+dark, line to child, gradient per viewport, header 4 glow + navy titles) · CLOSURE `ccc7985` (Admissions reads the full History - Ritvars to S5) · CHANNELS `b3da18a` (Q7 one line per channel, Q3 website field names + Company fix, Website temporary) · CONTROL `6faff11` |
| Taken OUT | the call pop-up (`625e108`, `87ff839`, `368a77f` reverted): its A/B is unpicked AND the app polled `/api/calls/events` every 3 s from every open window even unconfigured (constant Vercel + Neon load). The revert also took training@'s "parked" record; restored (`f96eb86`) |
| Not built yet | type 2a, cards 2c (MAIN, tomorrow) |
| Checks | contents: no DB / sql / vercel.json / package.json change · 1034/1034 in the worktree and on the clean deploy checkout · release build seen at 1440: Today, Channels (12 lines, Admin), Home dark · fresh backup `2026-10-04T19-01-36Z` VERIFIED 1083 rows |
| Deploy | `dpl_E56YxQrYhFY5GXkGssK9uUMpXxG4`: live page byte-identical, 72/72 files identical, 8 private routes 401, 0/23 leaks, health 200/302 |
| NOT yet seen | signed in |

## 04.10.2026 - THIRD PATCH LIVE: `51290c4` (type 3 + feedback email), pushed

Ritvars: "include the last corrections ... one commit, one deployment". Added to `release/2026-10-04-intake-2`: MAIN `ec0ab80` (type 3 strong hierarchy) and CLOSURE `bc76b17` (every new feedback item emailed to Ritvars from his own address; reuses the existing Google OAuth client, no new env; a failed email never fails the save). 1040/1040 in the worktree and on the clean deploy checkout. Backup `2026-10-04T19-09-41Z` VERIFIED. `dpl_wVRzijszSBfE5krkAqBJcmgxxJdU`: byte-identical page, 73/73 files, 8 private routes 401, 0 leaks. Pushed to origin.
**Ritvars, once:** open `/api/admin/notify/connect` signed in and press Allow, or no email goes out. If Google refuses the send permission, gmail.send must be added on the OAuth consent screen.
Not in it: cards 2c (not started), the call pop-up (S3 building to the finish line).

### 04.10 late - GO for patch 4 given in advance (Ritvars)

"As soon as the last work arrives, go to push to github and deploy to vercel production." Patch 4 = MAIN up to cards 2c (after `1eb53a5`) + CHANNELS `dbb4546`, NOT `account-move/pbx-every-minute`. MASTER CONTROL drives it to the end: merge, tests, look, fresh backup, deploy_verify, push, tell the sessions.

## 04.10 - FOURTH PATCH LIVE: `644bfa9` (cards 3, white tabs, phone channel), pushed

MAIN `801bef2` + CHANNELS `dbb4546` (pop-up to his pick, poll gate, pull writes call events, Web Push off until VAPID keys) + CONTROL `956013c`. Per-minute cron NOT in (all crons daily). 1070/1070 worktree + clean checkout. Release build seen: Home, Today, Journey light, Home + Today dark. Backup before `2026-10-04T19-25-55Z` VERIFIED. `dpl_CMx11wFuYa8R3xR6vptaYv7UWPTx`: byte-identical, 77/77 files, 8 private 401, 0 leaks. Backup after `2026-10-04T19-27-22Z`: 26 tables, `call_events` and `push_subscriptions` created, 192 people unchanged. Pushed.
Ritvars's "wait for MAIN's dark mode" arrived after the deploy had finished; dark-mode match = patch 5, same GO.

## 04.10 - FIFTH PATCH LIVE: `05ba51f` (dark cards match light), pushed

MAIN `ac4c207` (0021888 dark cards: solid #133a60, 3px #53a7db top, amber Needs-you; plus the <760px Conversion padding fix). Only change vs patch 4: 17 lines of CSS + a test. 1071/1071. Dark Home seen on the release build. Backup `2026-10-04T19-29-00Z` VERIFIED. `dpl_BoSkMnWhNyDrrX8utaRaGhmAFoLH`: byte-identical, 77/77, 8 private 401, 0 leaks. Pushed to origin.

### 04.10 late - the white pills were a misread (Ritvars, angry)

"white up the tab we are in" meant the TEXT, not a white tab background. Ritvars on production: "why are there white pills? fix that immediately" / "IT JUST NEEDS TO whiten up the TEXT". Fix -> S2: no white backgrounds; lit item + its parent get white bold text, icon and count; the soft highlight as before `bd45f42`. Deploy as soon as it lands. Lesson: when a short instruction can mean two things (text vs tab), show one picture before building.

## 04.10 - SIXTH PATCH LIVE: `47def9d` (white text on the lit tab, no pills), pushed
MAIN `c3cf6f3`. 1071/1071 clean checkout. Today seen on the release build. `dpl_BwMsKVGvLTD9XtTGxadVy4i1op9i`: byte-identical, 77/77, 0 leaks. Pushed. Inbox font fix (2-line clamp, 13px) is next, queued at MAIN.

## 04.10 - SEVENTH PATCH LIVE: `e9343d3` (Inbox message + Today step note: 13px slate, 2 lines), pushed
MAIN `cdef806`. Person-page history keeps the full text (one click away). Open, flagged by MAIN: the amber "NO LOGIN" pill is hard to read on the blue menu (test copies only).

### 05.10 - the app opened on Today, not Home (Ritvars)
Cause: route() default `location.hash || '#/today'`, unchanged since V1 (`afea424`); Home became the metrics landing later (Ieva 29.09) and the default was never moved. Not caught by 1074 tests or any release look, because every check opened a named route. Fix -> S2 (default #/home + a test that an empty address opens Home). Lesson for the release check: open the bare address, the way a person does.
