// Fetching a lead form's ANSWERS after the notification (C2 and C7, Session C HANDOVER, built
// 30.09.2026). Both Meta and LinkedIn notify with ids only; the name, email and phone are read
// afterwards with the page's or the app's token. Checked against the providers' own documents
// the same day:
//
//   META (developers.facebook.com, Lead Ads > Retrieving): GET graph.facebook.com/<version>/<LEAD_ID>
//     with a Page access token that has leads_retrieval. Answer: { created_time, id, ad_id, form_id,
//     field_data: [{ name, values: [..] }] }. Standard names: full_name, first_name, last_name,
//     email, phone_number.
//   LINKEDIN (learn.microsoft.com, Lead Sync): GET api.linkedin.com/rest/leadFormResponses/<id>
//     (headers Linkedin-Version YYYYMM, X-Restli-Protocol-Version 2.0.0). Answers are
//     formResponse.answers[] { questionId, answerDetails.textQuestionAnswer.answer }; which answer
//     is the email is on the FORM: GET /rest/leadForms/<formId>, content.questions[] { questionId,
//     predefinedField: FIRST_NAME | LAST_NAME | EMAIL | PHONE_NUMBER | ... }.
//
// THE TOKENS: process.env.META_PAGE_ACCESS_TOKEN and LINKEDIN_ACCESS_TOKEN, NAMES only in the
// source. Sent only in the Authorization header, never in a URL, never returned, logged or thrown.

export const META_GRAPH = 'https://graph.facebook.com/v25.0';
export const LINKEDIN_API = 'https://api.linkedin.com/rest';
export const TOKEN_ENV = { facebook: 'META_PAGE_ACCESS_TOKEN', linkedin: 'LINKEDIN_ACCESS_TOKEN' };

export class LeadFetchError extends Error {}

const clean = (text, token) => {
  let out = String(text ?? '');
  if (token) out = out.split(token).join('[redacted]');
  return out.replace(/(Bearer\s+)\S+/gi, '$1[redacted]');
};

// What the provider said when it refused, as lib/pbx.js does (security review 07.10.2026, M7): 200
// characters, the token removed.
async function said(res, token) {
  let text = '';
  try { text = await res.text(); } catch { return ''; }
  const slice = clean(text, token).replace(/\s+/g, ' ').trim().slice(0, 200);
  return slice ? ': ' + slice : '';
}

function tokenFor(channel, env) {
  const name = TOKEN_ENV[channel];
  const token = name && env[name];
  if (!token) throw new LeadFetchError(`${name} is not set`);
  return token;
}

async function getJson(url, headers, token, fetchImpl) {
  let res;
  try { res = await fetchImpl(url, { method: 'GET', headers }); }
  catch (err) { throw new LeadFetchError('the request failed: ' + clean(err && err.message, token)); }
  if (!res.ok) throw new LeadFetchError(`the provider answered ${res.status}` + await said(res, token));
  try { return await res.json(); } catch { throw new LeadFetchError('the provider answered with something that is not JSON'); }
}

// One shape out of both: who they are, plus every question and answer as the form asked it.
function shaped({ first, last, full, email, phone, answers }) {
  const name = full || [first, last].filter(Boolean).join(' ') || null;
  const programme = (answers.find((a) => /^(programme|program|programma|course)$/i.test(a.name)) || {}).value || null;
  return { name, email: email || null, phone: phone || null, programme,
    answers: answers.filter((a) => a.value) };
}

export async function fetchMetaLead(leadgenId, { env = process.env, fetchImpl = fetch } = {}) {
  const token = tokenFor('facebook', env);
  const base = env.META_GRAPH_BASE || META_GRAPH;       // a test points this at a local stand-in
  const url = `${base}/${encodeURIComponent(leadgenId)}?fields=created_time,field_data,ad_id,form_id,campaign_id`;
  const lead = await getJson(url, { accept: 'application/json', authorization: `Bearer ${token}` }, token, fetchImpl);
  const answers = (lead.field_data || []).map((f) => ({ name: String(f.name || ''),
    value: (f.values || []).filter((v) => v !== null && v !== '').join(', ') }));
  const get = (n) => (answers.find((a) => a.name === n) || {}).value || null;
  return shaped({ full: get('full_name'), first: get('first_name'), last: get('last_name'),
    email: get('email'), phone: get('phone_number'), answers });
}

// A MultiLocaleString ({ localized: { en_US: '...' } }) in the form's own locale, else the first one there is.
export function localizedText(mls, locale) {
  const map = (mls && mls.localized) || {};
  const key = locale && [locale.language, locale.country].filter(Boolean).join('_');
  return (key && map[key]) || Object.values(map)[0] || null;
}

// A multiple-choice answer arrives as option ids (07.10.2026, Lead Sync schema: answerDetails.multipleChoiceAnswer
// .options = int[]); the words are on the form's question. An id the form no longer has is named by its id, never guessed.
function choiceText(q, ids, locale) {
  const options = (q && q.questionDetails && q.questionDetails.multipleChoiceQuestionDetails
    && q.questionDetails.multipleChoiceQuestionDetails.options) || [];
  return (ids || []).map((id) => localizedText((options.find((o) => String(o.id) === String(id)) || {}).text, locale)
    || 'option ' + id).join(', ');
}

export async function fetchLinkedInLead(urn, { env = process.env, fetchImpl = fetch } = {}) {
  const token = tokenFor('linkedin', env);
  const base = env.LINKEDIN_API_BASE || LINKEDIN_API;
  const headers = { accept: 'application/json', authorization: `Bearer ${token}`,
    'linkedin-version': env.LINKEDIN_API_VERSION || '202609', 'x-restli-protocol-version': '2.0.0' };
  const id = String(urn).split(':').pop();
  const resp = await getJson(`${base}/leadFormResponses/${encodeURIComponent(id)}`, headers, token, fetchImpl);
  const formId = /leadGenForm:(\d+)/.exec(String(resp.versionedLeadGenFormUrn || ''))?.[1];
  if (!formId) throw new LeadFetchError('the response names no lead form');
  const form = await getJson(`${base}/leadForms/${encodeURIComponent(formId)}`, headers, token, fetchImpl);
  const questions = new Map(((form.content && form.content.questions) || []).map((q) => [String(q.questionId), q]));
  const answers = ((resp.formResponse && resp.formResponse.answers) || []).map((a) => {
    const q = questions.get(String(a.questionId)) || {};
    const d = a.answerDetails || {};
    const text = d.textQuestionAnswer ? d.textQuestionAnswer.answer
      : d.multipleChoiceAnswer ? choiceText(q, d.multipleChoiceAnswer.options, form.creationLocale) : null;
    return { name: String(q.name || q.predefinedField || a.questionId), field: q.predefinedField || null,
      value: text == null ? '' : String(text) };
  });
  const by = (f) => (answers.find((a) => a.field === f) || {}).value || null;
  return shaped({ first: by('FIRST_NAME'), last: by('LAST_NAME'), email: by('EMAIL'), phone: by('PHONE_NUMBER'), answers });
}

// SUBSCRIBING THE WEBHOOK (07.10.2026). For Lead Sync, LinkedIn: "webhook subscriptions must be created via the Lead
// Notification Subscriptions API and cannot be created via the UI". One subscription per OWNER covers every form it
// owns; Intake subscribes the ad account (leadType SPONSORED) only. Asked first, so pressing twice never makes a
// second one. LinkedIn validates the webhook (the challenge) during the POST.
export async function subscribeLinkedInLeads({ webhook, owners, env = process.env, fetchImpl = fetch }) {
  const token = tokenFor('linkedin', env);
  const base = env.LINKEDIN_API_BASE || LINKEDIN_API;
  const headers = { accept: 'application/json', authorization: `Bearer ${token}`, 'content-type': 'application/json',
    'linkedin-version': env.LINKEDIN_API_VERSION || '202609', 'x-restli-protocol-version': '2.0.0' };
  const out = [];
  for (const { owner, leadType } of owners) {
    const [kind, urn] = Object.entries(owner)[0];
    const list = await getJson(`${base}/leadNotifications?q=criteria&owner=(value:(${kind}:${encodeURIComponent(urn)}))`
      + `&leadType=(leadType:${leadType})`, headers, token, fetchImpl);
    const have = (list.elements || []).find((e) => e.webhook === webhook);
    if (have) { out.push({ kind, leadType, already: true, id: have.id ?? null }); continue; }
    let res;
    try { res = await fetchImpl(`${base}/leadNotifications`, { method: 'POST', headers, body: JSON.stringify({ webhook, owner, leadType }) }); }
    catch (err) { throw new LeadFetchError('the request failed: ' + clean(err && err.message, token)); }
    if (!res.ok) {
      let msg = '';
      try { msg = String((await res.json()).message || ''); } catch { msg = ''; }
      throw new LeadFetchError(`LinkedIn answered ${res.status}${msg ? ': ' + clean(msg, token).slice(0, 120) : ''}`);
    }
    out.push({ kind, leadType, created: true, id: (res.headers && res.headers.get && res.headers.get('x-restli-id')) || null });
  }
  return out;
}

export const FETCHERS = { facebook: fetchMetaLead, linkedin: fetchLinkedInLead };
export { clean as redactLead };
