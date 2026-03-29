/* ─── Siftly Service Worker ───────────────────────────────────────────── */

const DEFAULT_URL    = 'http://localhost:3000';
const TWITTER_REGEX  = /^https?:\/\/(www\.)?(twitter|x)\.com/;
const BADGE_COLOR    = '#6366f1';

// ── Tab navigation listener ───────────────────────────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !TWITTER_REGEX.test(tab.url)) return;

  const baseUrl = await getSiftlyUrl();

  // Check connection first
  const connected = await pingServer(baseUrl);
  if (!connected) {
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  // Set a presence indicator (●) to show Siftly is active on this tab
  chrome.action.setBadgeText({ tabId, text: '●' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
  chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' });
});

// Clear badge when leaving Twitter/X
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;
  if (!TWITTER_REGEX.test(tab.url)) {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
});

// ── Message handler ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    handlePing(sendResponse);
    return true; // async
  }

  if (message.type === 'OPEN_POPUP') {
    // MV3 does not support programmatically opening the popup, but we
    // can attempt to focus the extension action button window as a UX hint.
    // This is a no-op on most builds; the user needs to click the badge.
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'SEARCH_CACHE_GET') {
    handleCacheGet(message.key, sendResponse);
    return true;
  }

  if (message.type === 'SEARCH_CACHE_SET') {
    handleCacheSet(message.key, message.value);
    sendResponse({ ok: true });
    return true;
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────
async function getSiftlyUrl() {
  const stored = await chrome.storage.local.get(['siftlyUrl']);
  return (stored.siftlyUrl || DEFAULT_URL).replace(/\/$/, '');
}

async function pingServer(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/stats`, {
      signal: AbortSignal.timeout(4000)
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function handlePing(sendResponse) {
  const baseUrl   = await getSiftlyUrl();
  const connected = await pingServer(baseUrl);
  sendResponse({ connected, url: baseUrl });
}

// ── Session cache (cleared when the browser/service-worker restarts) ──────
async function handleCacheGet(key, sendResponse) {
  try {
    const result = await chrome.storage.session.get([key]);
    sendResponse({ value: result[key] || null });
  } catch (_) {
    sendResponse({ value: null });
  }
}

async function handleCacheSet(key, value) {
  try {
    await chrome.storage.session.set({ [key]: value });
  } catch (_) {}
}

// ── Install / update handler ──────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    // Set default settings
    chrome.storage.local.set({ siftlyUrl: DEFAULT_URL });
  }
});
