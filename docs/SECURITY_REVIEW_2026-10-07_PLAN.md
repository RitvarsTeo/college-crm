# Security review 07.10.2026 (Ritvars's team lead) - what we do with it

The findings themselves were pasted in chat by Ritvars on 07.10 (C1-C2, H1-H5, M1-M12, L1-L13,
data integrity, operations, code health). This file is the plan and the status, MASTER CONTROL owns it.
Verified by MASTER CONTROL in the live code (f45340e): C1 (openBeforeSignIn opens every real channel;
token_in_query / none_needed / service_account_with_domain_delegation return ok:true) and H1
(GET challengeCode answers any string).

## Patch S1 - live risks, now (branch fix/2026-10-07-security-s1 from f45340e)
STATUS 07.10: 15 commits cc86992..c6b8fc6 built by a background worker MASTER CONTROL started OUTSIDE the lane mechanism (P9 broken; Ritvars called it out; worker stopped). Handed to the QA / INTEGRATION / FINAL CONTROL lane session: independent review of all 15 + item 12 security_guards test + run-through, then report. Not deployed; C1 and H1 still live until it ships.
C1, H1, H2, H3, M1, M2, M3, M7 (Gmail never advances past a failed fetch), M11, C2 (fail closed on
Vercel without CRM_AUTH=1; listen 127.0.0.1 locally), H4 boot assertion (current_schema() must equal
CRM_PG_SCHEMA or refuse), L1, L2, L4, L7, L8. Each with a test that fails before the fix.

## Migration gate - Aigars's move to Supabase (goes into his checklist; nothing ships before these)
H4 role crm_app + role-level search_path + schema-qualified DDL + REVOKE on crm; H5 Supabase backups
+ PITR + scheduled pg_dump -n crm + restore drill; M5 own CRM_TOKEN_KEY + re-connect Gmail/feedback;
M6 Supabase CA + rejectUnauthorized; M8 pool 1-2 + statement_timeout; M9 migrations folder, delete
sql/002_feedback.sql; L5 clear
push_subscriptions; L10 PUBLIC_BASE_URL + re-point every webhook; L11 engines node 24.x.

## Later (backlog)
M4 one daily retention cron + written people-retention rule; M10 cron heartbeats + uptime;
L3 Mailchimp compare (Mailchimp CLOSED); L6 Vercel Firewall rate limits; L9 CSP after H2;
L12 personal accounts; foreign keys + CHECKs + timestamptz in the first Supabase migration;
dead files (_archive copy, _rename2.mjs, render.yaml, password-login code); docs ARCHITECTURE/HANDOFF.

## Decisions for Ritvars
- M12: DECIDED 07.10 by Ritvars: KEEP the TeleGroup tokens ("I don't want to ask for new ones. Let's just use the old ones"), after being told the risk (anyone with that chat history can read the call list with numbers straight from TeleGroup). ACCEPTED RISK, exception to P11 rule 8; revisit if the chat could have leaked. New tokens would come from TeleGroup (novikontas.tg.lv panel or their support). The test that bans the words "must be rotated" is still to be dropped (review M12).
