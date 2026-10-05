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

## 05.10 - EIGHTH PATCH LIVE: `5eba1a6` (the app opens on Home), pushed
MAIN `6d7ca1d`. Bare address checked on the release build: Home renders, only Home lit. 1078/1078.
Note: patch 8 deploy_verify said MISMATCH on the first fetch; a re-fetch a minute later was byte-identical (496774 = 496774). CDN switch-over timing, not a fault. The tool should retry the page fetch before declaring a mismatch.

### 05.10 - three items from Ritvars
- **© line:** delete from the menu card; keep "© Novikontas Academy" at the foot of EVERY page (replaces the old "(c) at the bottom of the menu" rule) -> S2.
- **Kit part 3 (Help and feedback):** bring Intake's current Help + one feedback box (Ask a question / Report a problem open the same box) into the kit -> QA S6.
- **Menu names/order, LOCKED 05.10:** Home > Inbox > Next steps > Journey > All people > Reports > Settings; "Today" renamed Next steps everywhere (his idea, MASTER CONTROL agreed). Sent to S2 with: help boxes Inbox / Next steps / Outcomes; tour step 1 = "everything in Intake is one click away on the left card"; a full user-facing "CRM" sweep (help.json, console, manifest, auth/google/server/xlsx "Academy CRM") plus a test that fails on "CRM".
- **Help questions (05.10):** delete "How do I sign in?" ("if they can read it, they are IN") and the time-zone question; "Can I delete a person?" states: nobody is deleted, Not proceeding with a reason, on record in Outcomes; raw messages and call records kept 13 months; "late" question says Inbox, not New Leads -> S2 with the CRM sweep.
- **Needs-you shelf (05.10):** the old plinth under the Needs-you card looks broken under cards 3, light and dark (his screenshots) -> remove, S2.

## 05.10 - MAIN `f560fc9` BUILT, not deployed (new CC account, marketing@)
Reconciled: MAIN `ui/2026-10-02-main-ab` held `6accf01` (© line = page foot) and `70f1f38` (menu Inbox > Next steps, "CRM" sweep), both BUILT, not live. New: `f560fc9` - Help: sign-in + time-zone questions deleted, delete answer adds the 13 months, "late" asks about the Inbox (id kept, rule unchanged); tour step 2 now lights Next steps (it lit Home); Needs-you shelf (`.kday-sheet::before/::after`) removed, light + dark seen; two History lines say Intake. 1090/1090. Still "CRM", not on any menu screen: simulator / inspector texts (SAID).
Production [seen 05.10 ~10:45 by GET of the bare address]: the served page = `5eba1a6` src/app.html byte for byte apart from the server-injected sign-in return script. So prod = patch 8; `6accf01`, `70f1f38`, `f560fc9` are NOT live. Next patch = those three, on his GO only.
Website channel: the 04.10 record says `WEBSITE_FORM_SECRET` IS set and the Tilda webhook is Active but not ticked on any form block (waits for Q3). The "missing secret" blocker in the handoff is out of date.

## 05.10 ~10:45 - ONE MASTER CONTROL again, one writer per branch (Ritvars)
Ritvars: this session (9bfb7d, account marketing@) is the one Intake MASTER CONTROL. Found after the account move: two sessions had written on `ui/2026-10-02-main-ab`, and a lane session wrote this file (`c4c3aac`, kept). Fixed, briefs sent 05.10:
| Session | Role | Writes only in |
|---|---|---|
| MAIN UI UX A/B INTAKE [97f022] | MAIN | `crm-main-ab` (tip `f560fc9`, 1090/1090 re-run by control on a clean export) |
| QA / INTEGRATION / FINAL CONTROL [c87e4d] | QA, read-only; reports to control, briefs nobody | nothing (wrote `f560fc9` + `c4c3aac` before this) |
| CHANNELS A/B INTAKE [3827a1] | CHANNELS, Q8 in progress | `crm-programme` (`fix/2026-10-05-programme`, uncommitted), `crm-channels-s3` |
| INTAKE FEEDBACK CLOSURE AUDIT [372b40] | CLOSURE | `crm-closure-s5` (tip `71c3a83`) |
| APPLICATIONS / REPORTS/ SIS [119d4c] | APPLICATIONS, finished per Ritvars; report asked | `crm-applications-s4` (tip `cd42945`) |
Next patch so far (not live, prod = `5eba1a6`): MAIN `6accf01` + `70f1f38` + `f560fc9`. Queue from QA's kit part 3 read: Help sorted by most opened breaks the 01.10 "not a popularity system" rule (`src/assets/help-center.js` order(), owner MAIN, SAID); kit part 2 still has the © line in the menu card (owner kit, SAID).
Reports in, 05.10 ~11:00: MAIN [97f022] confirms tip `f560fc9`, clean. APPLICATIONS `cd42945` (funnel subtitle "registered that week, current status now", DECIDED 05.10), 946/946 re-run by control on a clean export; 2 provider SIS rows in the 04.10 backup, likely real, not verified. CLOSURE `71c3a83` (merged patch 8 + 4 tests), 1082/1082 per S5; feedback email waits on Ritvars signing in. QA: kit part 3 clean (55/55); A and D below. CHANNELS: Q8 in progress.
| Q9 | Help center questions in ONE fixed order (help.json), never by most opened (Ritvars 01.10 rule, kit part 3 README:89) | MAIN | SENT 05.10 |
| Q10 | Kit part 2 demo still has © in the menu card; Intake moved it to the page foot (`6accf01`) | kit part 2 | SAID |
| Q11 | `config/prototype.json` feedbackReaders names reach every signed-in browser via /api/config (not on screen) | - | PARKED, low risk |
CLOSURE `71c3a83` re-run by control on a clean export: 1082/1082.
Q8 BUILT `1ea73ae` (CHANNELS, `fix/2026-10-05-programme` from `5eba1a6`): the form answers (programme, study form, heard from, company) reach the DB on every channel, and the website programme now reaches the Inbox as a suggested interest. Clean export 1093/1093; trial merge with MAIN `f560fc9` conflicts only in docs/BACKLOG.md (keep both). Parked: LinkedIn/TikTok/Meta store interest as PROVIDER via leadanswers.js (different rule from Q3's suggestion); intent carry-through.
| Q12 | Person page shows raw "form_programme" etc.; plain labels in FIELD_LABEL (found by CHANNELS in Q8) | MAIN, after Q9 | SENT 05.10 |
Next patch so far: MAIN `f560fc9` (+Q9, Q12) · APPLICATIONS `cd42945` · CLOSURE `71c3a83` · CHANNELS `1ea73ae`. On Ritvars's GO only.
05.10: Q9 BUILT `7227950` (MAIN: Help = the kit's own help-center.js copied unchanged, help.json order, no counts fetch; opens still recorded) and Q12 BUILT `aafec09` (labels: programme picked, study form, heard about us from, company). Clean export 1093/1093. **Trial merge with Q8 `1ea73ae` FAILS 1/1107**: test/field_labels.test.js reads `WEBSITE_ANSWERS`, Q8 renames it `FORM_ANSWERS`. Fix sent to MAIN first. SAID for Ritvars: kit README says only feedback readers may read /api/help/counts; Intake lets anyone signed in.
| Q13 | Target on Home: 140 new students 2026, 70% (98) in Officer = **NAV + ENG** (Ritvars answered 05.10), config values, A/B (D-C6 DECIDED yes) | MAIN | SENT 05.10, A/B for Ritvars |
| Q14 | Cold list for Marketing: two layouts of what exists today, no export/send (D-C8; owners Aigars + Tetiana) | MAIN | SENT 05.10, A/B for Ritvars |
D-C5 DECIDED 05.10: a lead can go back to an earlier stage, kept as built (CLOSURE `010d453`).
| Q15 | Stage moves are documented: BACK needs a note before it saves, FORWARD asks but can be skipped (Ritvars 05.10); a note or call on that person in the last few minutes COUNTS (Ritvars, popup 05.10); server enforces; reasons = config list. A/B of the form: A inline line under the card, B small pop-up (CLOSURE `ecd38f8`) | MAIN, after Q14 | SENT 05.10, A/B for Ritvars |
05.10: MAIN `7f13077` fixes the Q12 test (either map name). Control trial merge `7f13077` + Q8 `1ea73ae`: **1108/1108**. Feedback sign-in: Ritvars had no page open; control opened https://crm-novikontas.vercel.app/ in his Chrome.
05.10: Q13 BUILT `757832d` (1098/1098 control re-run) -> **PICKED A** (bars on the Admitted card). Feedback email (row 10d) DONE: Ritvars sent the TEST himself and saw the email in his inbox.
| Q16 | Phone menu scrolls sideways. A/B: A burger drawer, B bottom tab bar (Home, Inbox, Next steps, People, More); control recommends B | MAIN | SENT 05.10, A/B for Ritvars |
| Q17 | Browser-tab favicon = the same WHITE tile as the app icon, light and dark (Ritvars: "I want the white on also on the broswers tab"); supersedes the 30.09 dark favicon | MAIN | SENT 05.10 |
| Q18 | Outcomes back in the menu, AFTER Journey (chronology): People = Journey, Outcomes, All people (Ritvars picked 05.10) | MAIN | SENT 05.10 |
MAIN order: Q14 -> Q17 -> Q18 -> Q13 A default -> Q16 A/B -> Q15 A/B. Flag for Ritvars: mustard is the target AND the donut's Open on Home.
05.10: Q14 BUILT `59f429e` (?cold=a Outcomes > Cold by programme; ?cold=b All people "Not proceeding · Cold" with Why / Came from / Last contact; MAIN recommends B), 1101/1101 control re-run; pick asked AFTER Q13. Flag for Ritvars: marketing consent is stored (consents) but /api/people does not return it, so no list can show who agreed to marketing; nothing built.
Q13 REOPENED by Ritvars directly to MAIN: "the admissions by month looks way better, so lets have the KPI below it, oooooor change this design ... which is highly horizontal, and put it in the empty space below the needs you?" MAIN shows him A, C (card under Admissions by month), D (compact card under Needs you), KPI-first. "PICKED A" above is superseded until he answers.
05.10: **Q16 PICKED B, the phone bottom tab bar** (Ritvars: "OK, lets do bottom card!", popup: = phone tab bar). Built straight, no A/B.
| Q19 | HOME = only the vitals for the day, simple; REPORTS = the depth; every Home figure clicks to its place (Next steps, Inbox, Journey, All people, Outcomes, or its Reports section). Ritvars 05.10: "HOME should cover the overall app, but not overwhelm". A vitals only / B vitals + Admissions by month. Reports under Home in the menu shown in the pictures (he is unsure). Nothing lost: every figure leaving Home must exist in Reports. Supersedes the Q13 placement question | MAIN | SENT 05.10, A/B for Ritvars |
MAIN order: Q17 -> Q18 -> Q16 build -> Q19 A/B -> Q15 A/B. Q14 pick still to ask.
05.10 (Ritvars away 30 min: "creat all the AB's i need to assess"): CHANNELS and QA sessions have closed. Q15 moved from MAIN to APPLICATIONS [06791a], new worktree `crm-q15`, branch `ui/2026-10-05-stage-note-ab` from `59f429e`. MAIN order: Q17 -> Q18 -> Q19 A/B -> Q16 build. Q14 shots seen by control: A Outcomes > Cold by programme, B All people Cold with Programme / Why / Came from / Last contact; both match the brief.
05.10: MAIN `d719c8d` (Q13 C/D/KPI-first switches), `1b0660c` Q17 BUILT (favicon white tile both themes, no media block), `8c5ff0a` Q18 BUILT (menu Journey, Outcomes, All people). Control clean export of `8c5ff0a`: 1103/1103, menu order and favicon checked in the files. Lesson: the built-in pane cannot show pictures to Ritvars; A/B pages go to his Chrome as one HTML with the PNGs embedded (control builds them).
05.10: Q19 BUILT `a62056f` (?home2=a|b; Reports under Home only with the switch; two new Reports sections only with the switch), control clean export 1107/1107. Q15 BUILT `0287af6` (APPLICATIONS, `ui/2026-10-05-stage-note-ab`, ?movenote=a|b, server rule off by default via stageMoveNote.enforce=false), control clean export 1107/1107. Trial merge `a62056f` + `0287af6`: only BACKLOG.md conflicts; suite 1112/1113 then 1113/1113 on re-run (the known channels_admin startup timeout under load). All A/Bs shown to Ritvars on one page: For review/2026-10-05 ALL A-B to pick.html.
05.10 PICKS (Ritvars, popups to control, after the A/B page):
- Home (Q13/Q19 -> **Q20**): today's Home + target bars A on Admitted; remove everything below Admissions by month (Admitted by programme, Where admitted came from); "Where admitted came from" stays in Reports; fix the empty space under Needs you (2 fixes shown as pictures). Q19 vitals-only NOT picked. Reports keeps its menu place.
- Cold list (Q14): **A**, Cold and Reject live in Outcomes; still filterable on People.
- **Q21 People = everyone** (Ritvars asked "whats the point of the all people tab?"; picked): menu People (everyone, search, Add lead) > Journey, Outcomes; no All people item.
- Stage-move note (Q15): **B pop-up**, rule live (enforce on), APPLICATIONS finalizes.
- Q16 phone tab bar BUILT `5fff65d` (MAIN).
05.10: **GO given in advance** (Ritvars: "ok, show me when ready" / "Then we commit and deploy."): after he picks the gap fix and sees the finals, control cuts the ninth patch, deploys with deploy_verify, pushes. Contents: MAIN tip, APPLICATIONS `cd42945` + Q15 final, CLOSURE tip, CHANNELS `1ea73ae`.
05.10: Q15 FINAL B `539c6ed` (APPLICATIONS, enforce=true, 1107/1107). Channel record `66c457b` (CHANNELS: phone continuity proven through 04.10, Gmail 98, SIS 1; counts only). Control trial merge of all tips (MAIN 7fecb67, Q15 539c6ed, Q8 1ea73ae, APPS cd42945, CLOSURE 6eba278) onto release/2026-10-04-intake-2: docs-only conflicts, 1135/1136; the 1 fail = CLOSURE test/cold_reject_server.test.js:56 reopens without a note (refused under Q15). Fix sent to CLOSURE.
05.10: MAIN Q21 `7fecb67` (People = everyone), Q14 A `129585f`, Q20 `52bfcee`+`41ac9cf` (Home final, gap switch); control clean export `41ac9cf`: 1108/1108. Ritvars **PICKED gap 1** (journey in two columns) and gave MAIN Journey fixes directly (asked MAIN for his words). GO for patch 9 stands; release is cut after MAIN's last report.

## 05.10.2026 - NINTH PATCH LIVE: `aa6259b` (code `29e1792`), pushed
| | |
|---|---|
| Branch | `release/2026-10-05-intake-9` (worktree `crm-release-0510`), cut from prod `5eba1a6`, **pushed to origin** |
| Contents | MAIN `55e4a8f` (Q9 Help fixed order, Q12 labels, Q17 white tab icon, Q18/Q21 menu People = everyone > Journey, Outcomes, Q16 phone tab bar, Q14 Cold/Reject in Outcomes by programme, Q20 Home: target bars, nothing below the month row, gap fix 1 + Journey card link in the free cell, phone Needs-you row; Reports "Where admitted people came from") · Q15 B `539c6ed` (APPLICATIONS: stage-move note pop-up, back needs a note, server enforces, a note/call in the last 10 min counts) · CHANNELS `66c457b` (Q8 form answers on every channel + channel record through 04.10) · APPLICATIONS `cd42945` · CLOSURE `6eba278` · release fix `29e1792` (closure test sends a note on its back move) · record `aa6259b` |
| Contents check | `5eba1a6` is an ancestor; no sql / vercel.json / package.json / api / lib / db.js change; no schema change; all A/B switches removed, nothing unpicked |
| Tests | 1134/1134 in the release worktree and on the clean deploy checkout |
| Seen | release build, synthetic: Home (target, no programme section), People, Journey, Outcomes, Next steps, Inbox, Reports, Settings, Help: titles right, 0 errors, no "CRM"; phone 375: tab bar Home / Inbox / Next steps 23 / People / More, no sideways scroll |
| Backup before | `_backups/2026-10-05T09-44-18Z` VERIFIED, 26 tables, 1175 rows |
| Deploy | `dpl_Ak6K2vW3qFFFMQHAH5kBsikwo7G1`: live page byte-identical, 78/78 files identical, none outside git, 8 private routes 401, 0/23 leaks, health 200/302 |
| NOT yet seen | signed in on production |
**New base for every lane: `release/2026-10-05-intake-9` @ `aa6259b`. Merge it before your next commit.**

## 05.10 - TENTH PATCH LIVE: `caf4de9` - functions in Frankfurt (speed), pushed
Ritvars: "signed in, all works, BUT ITS veery slow" / "it was slow for a while. i dont think is explicitly patch 9". [seen] patch 8 and patch 9 make the same 11 API calls per Home and render in ~0.1 s locally, so not the page. [seen] every function ran in `iad1` (Washington, X-Vercel-Id arn1::iad1) while Neon is `eu-central-1` (Frankfurt, host read without the secret): each query crossed the Atlantic twice. Ritvars GO: "Yes, move + deploy". Change: `vercel.json` `"regions": ["fra1"]`, nothing else. 1134/1134. `dpl_4PYxPSArLexgHHRJkecRwYCZhNMp`: byte-identical page, 78/78 files, 8 private 401, 0 leaks; all 5 functions [fra1]; a no-database request 0.23-0.27 s -> 0.12-0.14 s from Riga. Database queries now stay inside Frankfurt. Undo = remove the line. Not yet felt by Ritvars signed in.
**New base for every lane: `release/2026-10-05-intake-9` @ `caf4de9`.**
| Q22 | First crons in fra1 run 06.10 ~05:15-05:35Z: check sync_state ran_at/detail for pbx_until, gmail, sis in the first backup after 06.10 05:35Z vs 04.10 (pbx 05:27Z fetched 1; gmail 05:35Z fetched 14; sis 05:31Z fetched 1) | CHANNELS | SAID, 06.10 |
| Q23 | Home on production (Ritvars to MAIN, 05.10, word for word): "why doesnt it occupy the whole page? ALso, not all metrics are clickable with traced links to according tab, where it came from. The pie can be much bigger, to take up its space. The metrics in the cards admitted, leads, conversion, median time, can be bigger. Why does the time change from 38 days to 52 days? Ive seen both today. Also, in admissions we still have 16 admitted, but only for september we have this text. WHY? Delete that above the graph 16 admitted. It is hover over info." 38 = synthetic preview, 52 = real data | MAIN | SENT 05.10, shots before commit |
| Q24 | Channels says "Blocked" when nothing blocks (Ritvars: "whysome channels show blocked, when they are not???"). [seen] LinkedIn (outside decision pending) and Agent (no owner named, chState fallback). Fix: "Waiting on <party>", "Not decided"; "Blocked" only when an outside party refused | CHANNELS | SENT 05.10 |
05.10 Q24 widened (Ritvars to MAIN, word for word): "Website form is live, agent is live (it comes into edu email). Linkedin is live. We jsut waiting on the leads extra option!! not the channel connection itself! Mailchimp is live, i am now connecting the webhook." [decided] Website, Agent (via edu@), LinkedIn, Mailchimp = Live on his word; LinkedIn Lead Sync = a pending extra, not a blocker. Sent to CHANNELS.
| Q25 | Finish the Mailchimp connection (Ritvars via MAIN: "Give the task to channels session to finish the mailchimp connection!"): URL check, audience webhook, first real event as a provider row; the Mailchimp-side change only with his yes or his own click | CHANNELS, before Q24 | SENT 05.10 |
05.10: Q23 shots (MAIN, uncommitted, suite 1134/1134): figures bigger, donut bigger, every Home figure a click (list in MAIN's report), no peak label. Q24 BUILT `12b4c4c` (CHANNELS, fix/2026-10-05-channel-words from caf4de9): ownerSays live on Ritvars's word, "Waiting on <party>", "Not decided", Blocked only if refused; control clean export 1137/1137, list shot by control: 6 Live, 5 Waiting on Oksana, In person By hand. Both to Ritvars on one page.
Mailchimp (Q25): our side ready (secret + mode in Production); Ritvars adds the audience webhook himself; proof = a mailchimp provider row (filtered, not a lead), control takes the backup. CHANNELS sent one unauthenticated GET that upserted channel_handshake(mailchimp): harmless, but anyone can fake the proof.
| Q26 | Mailchimp handshake recorded only when ?s= matches the secret; the URL check still answers | CHANNELS | SENT 05.10 |
| Q27 | Channels screen: SIS shown apart (apply -> SIS -> Intake, statuses, last pull) + per channel what is filtered and how often it is pulled, as figures not sentences (Ritvars 05.10, to CHANNELS: "...Some good info, interesting, not overwhelming, informing in a good way, not in paragraphgs, ok?"); widens Q7 for this screen; A/B | CHANNELS | SENT 05.10, A/B for Ritvars |
05.10: Ritvars "Yes, ship it" for patch 11 (Q23 Home + Q24 Channels words). | Q28 | Channels list centred on the page in one white card, cards 3 (Ritvars via MAIN: "Make the things that are this small, as this table, be in the center if the page on a white card. Match the overall design." -> "Channels list") | CHANNELS, first, in patch 11 | SENT 05.10 |

## 05.10 - ELEVENTH PATCH LIVE: `5c3236a` (code `25cb27e`), pushed
MAIN `9fe0827` (Q23: every Home figure a traced click, figures 42/54, donut bigger, no peak label) + CHANNELS `23713e5` (Q24 words on Ritvars's facts: 6 Live, 5 Waiting on Oksana, By hand, no Blocked; Q28 list centred in one cards-3 card) + record `5c3236a`. No sql / vercel / package / db change. Backup before `2026-10-05T10-11-50Z` VERIFIED 1175 rows. 1142/1142 on the clean deploy checkout. `dpl_6B4kc9WCMxRfq1auqSLvrzzbeCCE`: byte-identical, 78/78, 8 private 401, 0 leaks, functions still fra1. NOT in it: Q26 (`8ee1c5b`, waits for proof that Mailchimp's save GET carries ?s=). Mailchimp: no provider row yet at 10:11Z.
**New base: `release/2026-10-05-intake-9` @ `5c3236a`.**
05.10: Q26 decision (control): it cannot break the Mailchimp save (the URL check always answers 200; only the proof row may stay old), and a real Mailchimp event POST, refused without ?s=, proves the saved URL carries the secret. So Q26 `8ee1c5b` ships with the next patch (Q27), no backup test needed. CHANNELS Q24/Q28 marked LIVE `af83adc`; Q27 on ui/2026-10-05-channel-info.
| Q29 | Clicking Admissions opens the Inbox, not Next steps (Ritvars 05.10: "Inbox should be the first.") | MAIN | SENT 05.10 |
| Q30 | Inbox cohorts (Ritvars 05.10: "we really need to make cohorts for the inbox people!" -> "By dates first, then by channels. Then by kind of senders."). A/B: A date sections + channel / kind chips; B date sections with channel groups inside | MAIN | SENT 05.10, A/B for Ritvars |
| Q31 | Inbox filter on arrival: colleagues (@novikontas.org, Google Chat notices), noreply senders, Google Forms responses -> filtered, kept, never deleted (Ritvars: "collaguese should not be there!", "Yes, filter them"); sender kind possible / current student / other on the server; waiting production rows only via an admin preview-then-apply action on his yes | CHANNELS, before Q27 | SENT 05.10 |
| Q32 | SUPERSEDES the morning's "Next steps" rename and Q29. Ritvars 05.10: "Wait, next steps dont make sense for me anymore, as journey should nudge for next steps, right? So what if when we click admissions, first is todays work (inbox go back to being today), then inbox goes as next step." Picked (popup): keep the page, named TODAY, first; Admissions opens Today; Inbox second. Help 01 Today / 02 Inbox / 03 Outcomes; phone tabs Home, Today, Inbox, People, More | MAIN | SENT 05.10 |
Q27 BUILT `82aaa78` (CHANNELS, ?chinfo=a|b, 1149/1149 per CHANNELS) - A/B for Ritvars. Q26 `8ee1c5b` 1139/1139 on a clean checkout per CHANNELS.
05.10: Q27 PICKED A (Ritvars: "Every should become a uncovering tab :)"): every channel line and the SIS block open and close; closed = name + one word. CHANNELS finalizes after Q31.
05.10: Q32 BUILT `44da412` (MAIN, Today first, 1142/1142; Q29 never committed, dropped). Q31 BUILT `ed75173` (CHANNELS, fix/2026-10-05-inbox-noise: the automatic-sender regex was anchored, so chat-noreply@google.com, forms-receipts-noreply@google.com, novikontas-noreply@m-s-solutions.net got through; text patterns for Google Chat + Forms; senderKind at read time, no schema change; GET/POST /api/admin/inbox/refilter preview-then-apply; dry run on the 04.10 backup: 75 waiting non-phone rows -> 42 would move (33 automatic, 9 own address), 33 stay; 1149/1149).
| Q33 | Outcomes > Not proceeding: people list FIRST, reason table below with only non-zero reasons, the two sentences gone; NEW "same person" mark when phone/email matches someone in another stage (Ritvars picked) - his words: "...we dont have the people also! SO we have only a number. And cant find them even to check if they match someone in the app being ina different stage maybe falsely." | MAIN, before Q30 | SENT 05.10 |
| Q34 | Admin button for Q31's preview-then-move; retire the old gmail refilter (410) | CHANNELS, after Q27 | SENT 05.10 |
| Q35 | Reports = Home one level deeper: one chapter per Home figure, same figure + label first, then only its breakdowns with short basis labels, nothing twice, nothing lost; A stacked chapters + index / B tabs. Ritvars 05.10: "...make it obvious that full report page is going deeper on the metrics that are on home ... Hard to comprehend what is what, comes from where and why is that there, or what is there." | REPORTS (APPLICATIONS session) | SENT 05.10, A/B for Ritvars |
| Q36 | RULE (Ritvars 05.10): "...the main of the app is to find people ... everything has to be connected with each other, path to path to path." Today strip figures open their cohorts; sweep: every figure on every screen opens exactly the people it counts, count on arrival = figure, test walks them. Also sent to the Reports lane for Q35 | MAIN (after Q33) + REPORTS | SENT 05.10 |
05.10 Q35 add (Ritvars, screenshot of Full report with the Today strip 90 open / 19 overdue / 57 no next step): "and then well in full report you have the same metrics here, but less? Kind of weird. Also doesnt point to people, but do we need this redundancy??" + "Nothing should be duplicated. Its confusing." -> the strip leaves Reports (Today owns it); nothing appears twice anywhere; the only echo is the Home figure as a chapter header. Sent to the Reports lane.
05.10: Q33 BUILT `08d2455` (MAIN, 1145/1145: people first, non-zero reasons only, "Same person" mark on phone/email). Q36 changed by Ritvars: Home's Needs you already holds Overdue / Due today / Inbox / No next step ("you see in needs you, we already have"); picked KEEP on Home, Today DROPS its strip; Home's figures open Today's sections / Inbox / People "no next step". CHANNELS: Q27 FINAL `c744579` (every line uncovers, SIS its own line); Q31 button `37cfc34` + old refilter 410 `95efef8` on fix/2026-10-05-inbox-noise, which merges Q27 (must ship together), 1157/1157 per CHANNELS. Production refilter run waits for his yes (04.10 backup: 42 of 75 would move).
| Q37 | Home drops "The journey now" (Ritvars 05.10: "The journey now. Do we need it on home?" -> picked drop: duplicates the Journey band; the donut Open slice leads there); Needs you full width | MAIN, with Q36 | SENT 05.10 |
