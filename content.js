
let subtitleButton = null;
let modalOpen = false;

// ─── Utilities ────────────────────────────────────────────────────────────────

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) return resolve(document.querySelector(selector));
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); reject(new Error('Timeout: ' + selector)); }, timeout);
  });
}

function getVideoId() {
  return new URLSearchParams(window.location.search).get('v');
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${m}:${String(s).padStart(2,'0')}`;
}

// ─── API Calls (routed via background worker — no CORS) ──────────────────────

function fetchLanguages(videoId) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'FETCH_LANGUAGES', videoId }, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp || !resp.success) return reject(new Error(resp?.error || 'Unknown error'));
      resolve(resp.data);
    });
  });
}

function fetchTranscript(videoId, lang = null) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'FETCH_TRANSCRIPT', videoId, lang }, (resp) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!resp || !resp.success) return reject(new Error(resp?.error || 'Unknown error'));
      resolve(resp.data);
    });
  });
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function removeModal() {
  const existing = document.getElementById('ysg-modal');
  if (existing) existing.remove();
  modalOpen = false;
}

function createLoadingModal() {
  removeModal();
  const modal = document.createElement('div');
  modal.id = 'ysg-modal';
  modal.innerHTML = `
    <div class="ysg-backdrop"></div>
    <div class="ysg-panel">
      <div class="ysg-header">
        <span class="ysg-logo">⬛ Grab Subtitle</span>
        <button class="ysg-close" id="ysg-close">✕</button>
      </div>
      <div class="ysg-loading">
        <div class="ysg-spinner"></div>
        <p>Fetching transcript…</p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modalOpen = true;
  document.getElementById('ysg-close').addEventListener('click', removeModal);
  modal.querySelector('.ysg-backdrop').addEventListener('click', removeModal);
}

function createErrorModal(message) {
  removeModal();
  const modal = document.createElement('div');
  modal.id = 'ysg-modal';
  modal.innerHTML = `
    <div class="ysg-backdrop"></div>
    <div class="ysg-panel">
      <div class="ysg-header">
        <span class="ysg-logo">⬛ SubGrab</span>
        <button class="ysg-close" id="ysg-close">✕</button>
      </div>
      <div class="ysg-error">
        <div class="ysg-error-icon">⚠</div>
        <p>${message}</p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modalOpen = true;
  document.getElementById('ysg-close').addEventListener('click', removeModal);
  modal.querySelector('.ysg-backdrop').addEventListener('click', removeModal);
}

function createTranscriptModal(transcriptData, languages, videoId, currentLang) {
  removeModal();

  const lines = transcriptData.transcript || transcriptData.subtitles || [];
  const langOptions = (languages || []).map(l => {
    const code = typeof l === 'string' ? l : (l.language_code || l.code || l);
    const label = typeof l === 'object' ? (l.language || l.name || code) : code;
    const selected = code === currentLang ? 'selected' : '';
    return `<option value="${code}" ${selected}>${label}</option>`;
  }).join('');

  const subtitleHTML = lines.map(sub => {
    const start = sub.start !== undefined ? sub.start : (sub.offset ? sub.offset / 1000 : 0);
    const text = sub.text || sub.content || '';
    return `<div class="ysg-line">
      <span class="ysg-ts">${formatTime(start)}</span>
      <span class="ysg-txt">${text}</span>
    </div>`;
  }).join('');

  const modal = document.createElement('div');
  modal.id = 'ysg-modal';
  modal.innerHTML = `
    <div class="ysg-backdrop"></div>
    <div class="ysg-panel">
      <div class="ysg-header">
        <span class="ysg-logo">⬛ Grab Subtitle</span>
        <button class="ysg-close" id="ysg-close">✕</button>
      </div>
      <div class="ysg-toolbar">
        <div class="ysg-lang-wrap">
          <label>Language</label>
          <select id="ysg-lang-select">${langOptions}</select>
        </div>
        <div class="ysg-actions">
          <button id="ysg-copy" class="ysg-btn">Copy Text</button>
          <button id="ysg-download-txt" class="ysg-btn">Download TXT</button>
          <button id="ysg-download-srt" class="ysg-btn ysg-btn-accent">Download SRT</button>
        </div>
      </div>
      <div class="ysg-body">
        <div class="ysg-count">${lines.length} lines</div>
        <div class="ysg-lines">${subtitleHTML}</div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modalOpen = true;

  document.getElementById('ysg-close').addEventListener('click', removeModal);
  modal.querySelector('.ysg-backdrop').addEventListener('click', removeModal);

  // Language switch
  document.getElementById('ysg-lang-select').addEventListener('change', async (e) => {
    const newLang = e.target.value;
    createLoadingModal();
    try {
      const newData = await fetchTranscript(videoId, newLang);
      createTranscriptModal(newData, languages, videoId, newLang);
    } catch (err) {
      createErrorModal('Failed to load language: ' + err.message);
    }
  });

  // Copy
  document.getElementById('ysg-copy').addEventListener('click', () => {
    const text = lines.map(s => s.text || s.content || '').join('\n');
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('ysg-copy');
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy Text'; }, 2000); }
    });
  });

  // Download TXT
  document.getElementById('ysg-download-txt').addEventListener('click', () => {
    const text = lines.map(s => {
      const start = s.start !== undefined ? s.start : (s.offset ? s.offset / 1000 : 0);
      return `[${formatTime(start)}] ${s.text || s.content || ''}`;
    }).join('\n\n');
    downloadFile(text, `subtitles-${videoId}.txt`, 'text/plain');
  });

  // Download SRT
  document.getElementById('ysg-download-srt').addEventListener('click', () => {
    const srt = lines.map((s, i) => {
      const start = s.start !== undefined ? s.start : (s.offset ? s.offset / 1000 : 0);
      const dur = s.duration || 2;
      const end = start + dur;
      return `${i + 1}\n${toSRTTime(start)} --> ${toSRTTime(end)}\n${s.text || s.content || ''}\n`;
    }).join('\n');
    downloadFile(srt, `subtitles-${videoId}.srt`, 'text/plain');
  });
}

function toSRTTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Main Handler ──────────────────────────────────────────────────────────────

async function handleButtonClick() {
  if (modalOpen) return;
  const videoId = getVideoId();
  if (!videoId) { alert('No video ID found.'); return; }

  subtitleButton.textContent = 'Loading…';
  subtitleButton.disabled = true;
  createLoadingModal();

  try {
    const [transcriptData, rawLangs] = await Promise.all([
      fetchTranscript(videoId),
      fetchLanguages(videoId).catch(() => null)
    ]);

    // Flatten manual + auto_generated into one array
    // (background.js already unwraps to { manual, auto_generated })
    const languages = [
      ...(rawLangs?.manual || []),
      ...(rawLangs?.auto_generated || [])
    ];

    const currentLang = transcriptData.language_code || transcriptData.language || 'en';
    createTranscriptModal(transcriptData, languages, videoId, currentLang);
  } catch (err) {
    createErrorModal('Could not load subtitles.<br><small>' + err.message + '</small>');
  } finally {
    subtitleButton.textContent = 'Subtitles';
    subtitleButton.disabled = false;
  }
}

// ─── Inject Button ────────────────────────────────────────────────────────────

async function addSubtitleButton() {
  try {
    await waitForElement('#owner');
    if (document.getElementById('ysg-btn')) return;

    const topRow = document.querySelector('#owner');
    const wrap = document.createElement('div');
    wrap.id = 'ysg-btn-wrap';

    subtitleButton = document.createElement('button');
    subtitleButton.id = 'ysg-btn';
    subtitleButton.textContent = 'Grab Subtitles';
    subtitleButton.addEventListener('click', handleButtonClick);

    wrap.appendChild(subtitleButton);
    topRow.appendChild(wrap);
  } catch (err) {
    console.error('[SubGrab] Button error:', err);
    setTimeout(addSubtitleButton, 2000);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addSubtitleButton);
} else {
  addSubtitleButton();
}

// Handle YouTube SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    removeModal();
    setTimeout(addSubtitleButton, 1200);
  }
}).observe(document.body, { subtree: true, childList: true });
