# LinkedIn lead forms into Intake

Owner: Tetiana gives access; **we build the app, the token and the connection** (30.09).

## 1. What we want to receive

Every LinkedIn **Lead Gen Form** filled in on a Novikontas advert or on the company page: name, email,
phone and the answers. Not direct messages: LinkedIn gives no way to receive those for a page.

## 2. What Tetiana does (about 10 minutes)

**A. Company page** (linkedin.com/company/... > Admin tools > Manage admins):
add **Ritvars Vilcins** as **Super admin**. (Super admin is needed to confirm our app belongs to the
page; "Content admin" or posting access is not enough.)

**B. Campaign Manager** (linkedin.com/campaignmanager > the Novikontas ad account > Account settings >
Manage access): add **Ritvars Vilcins** with the role **Account manager**. (Lead forms on adverts
live in the ad account, not on the page.)

**C. Three answers:**
1. Are Lead Gen Forms used today? On adverts, on the page, or both?
2. Which forms are active now (their names)?
3. Roughly how many leads a week, and where do they go today (downloaded by hand, or nowhere)?

## 3. What we do after that

1. Create the LinkedIn developer app, linked to the company page; Tetiana's page confirms it if asked.
2. Apply for LinkedIn's **Lead Sync API** (a separate approval; LinkedIn decides, it can take days).
   Permissions: `r_marketing_leadgen_automation`, `r_ads`, `r_organization_admin`.
3. Sign in once with Ritvars's account to get the token (`LINKEDIN_ACCESS_TOKEN`, set in Vercel by
   Ritvars; it lasts 60 days, so a renewal date goes in the backlog).
4. Register `https://crm-novikontas.vercel.app/api/inbound/linkedin` for lead notifications on the
   active forms (secret: `LINKEDIN_CLIENT_SECRET`).
5. Test with LinkedIn's own test lead on one form; it must appear in New Leads with name and email.

## 4. Where it stands

- Built and tested on branch `lane/channels`: the notification is received and checked, and the name,
  email and phone are fetched from Lead Sync afterwards, with a daily retry (8cba9e1). **Not deployed.**
- **No real LinkedIn lead has ever reached Intake.**
- Waits on: Tetiana (A, B, C), then LinkedIn's Lead Sync approval.

## 5. What you will see once it is on

A LinkedIn lead appears in **New Leads** labelled LinkedIn, with the name, email and phone.
