// background.js — Service Worker (no CORS restrictions here)
const API_BASE = 'https://youtubetranscriptapiproject-production.up.railway.app/api/transcript';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_TRANSCRIPT') {
    handleFetchTranscript(message.videoId, message.lang)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'FETCH_LANGUAGES') {
    handleFetchLanguages(message.videoId)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleFetchTranscript(videoId, lang) {
  const url = lang
    ? `${API_BASE}/${videoId}/${lang}/`
    : `${API_BASE}/${videoId}/`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  // Unwrap { success, data: {...} } envelope
  return json.data ?? json;
}

async function handleFetchLanguages(videoId) {
  const url = `${API_BASE}/${videoId}/languages/`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  // Unwrap and return available_transcripts directly
  const d = json.data ?? json;
  return d.available_transcripts ?? d;
}
