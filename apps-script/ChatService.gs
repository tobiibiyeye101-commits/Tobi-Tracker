/**
 * ChatService.gs
 * --------------
 * Delivery for the Daily Secretary Briefing (AiAssistant.gs) — a personal
 * Google Chat Space with an incoming webhook. No bot registration, no
 * approval process, no separate account: entirely free, same as everything
 * else here.
 *
 * Setup (2 minutes):
 *   1. In Google Chat, create a Space (any name — "STEWARD" works).
 *   2. Space settings → Apps & integrations → Webhooks → add one, copy
 *      its URL.
 *   3. In the Apps Script editor, temporarily add:
 *      function _setChatWebhook(){ setGoogleChatWebhookUrl('PASTE_URL_HERE'); }
 *      run it once, then delete it. (Same pattern as setGeminiApiKey() /
 *      setWebAppUrl().)
 * Until that's done, sendDailySecretaryBriefing() in AiAssistant.gs fails
 * with a clear error that it catches itself — the 7am email keeps sending
 * normally either way.
 */

var GOOGLE_CHAT_WEBHOOK_URL_PROPERTY = 'GOOGLE_CHAT_WEBHOOK_URL';

function setGoogleChatWebhookUrl(url) {
  PropertiesService.getScriptProperties().setProperty(GOOGLE_CHAT_WEBHOOK_URL_PROPERTY, url);
}

function getGoogleChatWebhookUrl_() {
  return PropertiesService.getScriptProperties().getProperty(GOOGLE_CHAT_WEBHOOK_URL_PROPERTY);
}

/**
 * Posts plain text to the configured Chat Space. Throws with a clear
 * message on any failure (no webhook set, bad URL, non-2xx response) —
 * this file never swallows its own errors; callers that must never break
 * because of it (the 7am trigger) wrap the call themselves.
 */
function sendGoogleChatMessage(text) {
  var url = getGoogleChatWebhookUrl_();
  if (!url) throw new Error('No Google Chat webhook set — see ChatService.gs / README for the one-time setup step.');

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: text }),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Google Chat webhook returned HTTP ' + code + ': ' + response.getContentText());
  }
}
