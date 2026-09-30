/**
 * Academy CRM - the website's "Application form" (Google Form) into New Leads.
 * C6, written 30.09.2026. Paste this whole file into the form's script editor
 * (the form > three dots > Script editor), save, then run install() once and approve
 * the permission box Google shows.
 *
 * THE SECRET IS NOT IN THIS FILE. Project Settings > Script Properties > add
 *   CRM_SECRET = <the value Ritvars enters with you in person>
 * Optional: CRM_URL, only if the CRM address changes.
 *
 * What it sends, once per submitted response: responseId, timestamp, formId, the
 * respondent's email when the form collects it, and every answer keyed by the
 * question title. The CRM stores a response once, so sending it twice is harmless.
 */

var DEFAULT_URL = 'https://crm-novikontas.vercel.app/api/inbound/google_form';

function payloadOf_(form, response) {
  var answers = {};
  response.getItemResponses().forEach(function (ir) {
    var value = ir.getResponse();
    answers[ir.getItem().getTitle()] = Array.isArray(value) ? value.map(String) : [String(value)];
  });
  var email = '';
  try { email = response.getRespondentEmail() || ''; } catch (err) { email = ''; }
  return {
    responseId: response.getId(),
    timestamp: response.getTimestamp().toISOString(),
    formId: form.getId(),
    respondentEmail: email || null,
    answers: answers
  };
}

function send_(payload) {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('CRM_SECRET');
  if (!secret) throw new Error('CRM_SECRET is not set in Script Properties');
  var url = props.getProperty('CRM_URL') || DEFAULT_URL;
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-crm-secret': secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code >= 300) console.error('The CRM answered ' + code + ' for response ' + payload.responseId);
  return code;
}

/** Runs on every submit (installed by install()). */
function onFormSubmit(e) {
  var form = e && e.source ? e.source : FormApp.getActiveForm();
  return send_(payloadOf_(form, e.response));
}

/** Run once by hand: makes onFormSubmit run on every submit. */
function install() {
  var form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
}

/** Run by hand if the CRM was down: sends every response again. Repeats are ignored by the CRM. */
function resendAll() {
  var form = FormApp.getActiveForm();
  var sent = 0;
  form.getResponses().forEach(function (r) { if (send_(payloadOf_(form, r)) < 300) sent++; });
  return sent;
}
