// popup.js

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function getVideoIdFromUrl(url) {
  try {
    return new URL(url).searchParams.get('v');
  } catch { return null; }
}

async function init() {
  const tab = await getCurrentTab();
  const isYouTube = tab && tab.url && tab.url.includes('youtube.com/watch');
  const videoId = isYouTube ? getVideoIdFromUrl(tab.url) : null;

  const mainContent = document.getElementById('main-content');
  const notYt = document.getElementById('not-yt');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const videoInfo = document.getElementById('video-info');
  const videoTitle = document.getElementById('video-title');
  const grabBtn = document.getElementById('grab-btn');

  if (!isYouTube || !videoId) {
    mainContent.style.display = 'none';
    notYt.style.display = 'block';
    return;
  }

  // Active state
  statusDot.classList.add('active');
  statusText.textContent = 'YouTube video detected';
  videoInfo.style.display = 'block';

  // Show video title if available
  const title = tab.title ? tab.title.replace(' - YouTube', '').trim() : videoId;
  videoTitle.textContent = title.length > 60 ? title.slice(0, 57) + '…' : title;

  grabBtn.disabled = false;

  grabBtn.addEventListener('click', async () => {
    grabBtn.disabled = true;
    grabBtn.textContent = 'Opening…';

    // Inject a click on the content script button, or dispatch event
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const btn = document.getElementById('ysg-btn');
          if (btn) btn.click();
        }
      });
      window.close();
    } catch (err) {
      grabBtn.textContent = 'Error — Reload page';
      grabBtn.disabled = false;
    }
  });
}

init();
