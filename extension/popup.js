/* ─── Siftly Popup Script ─────────────────────────────────────────────── */

const DEFAULT_URL = 'http://localhost:3002';

let siftlyUrl = DEFAULT_URL;
let searchDebounceTimer = null;
let currentQuery = '';

// ── DOM refs ──────────────────────────────────────────────────────────────
const statusDot      = document.getElementById('status-dot');
const statusText     = document.getElementById('status-text');
const searchInput    = document.getElementById('search-input');
const searchClear    = document.getElementById('search-clear');
const resultsEl      = document.getElementById('results');
const emptyState     = document.getElementById('empty-state');
const loadingEl      = document.getElementById('loading');
const settingsBtn    = document.getElementById('settings-btn');
const settingsPanel  = document.getElementById('settings-panel');
const settingsBack   = document.getElementById('settings-back');
const settingsSave   = document.getElementById('settings-save');
const siftlyUrlInput = document.getElementById('siftly-url-input');

// ── Initialise ────────────────────────────────────────────────────────────
async function init() {
  // Load settings
  const stored = await chrome.storage.local.get(['siftlyUrl']);
  siftlyUrl = stored.siftlyUrl || DEFAULT_URL;
  siftlyUrlInput.value = siftlyUrl;

  // Check connection
  const connected = await checkConnection();

  if (!connected) return;

  // Get current tab context
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const isTwitter = /https?:\/\/(twitter|x)\.com/.test(tab.url || '');

  if (isTwitter) {
    // Try to get tweet context from content script
    try {
      const ctx = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTEXT' });
      if (ctx && ctx.tweetText) {
        const query = ctx.tweetText.slice(0, 200);
        searchInput.value = query;
        updateClearBtn();
        await runSearch(query);
        return;
      }
    } catch (_) {
      // Content script not yet injected or no tweet on page — fall through
    }
  }

  // Fall back to page title
  if (tab.title) {
    const query = sanitiseTitle(tab.title);
    searchInput.value = query;
    updateClearBtn();
    await runSearch(query);
  }
}

function sanitiseTitle(title) {
  // Strip common suffixes like "| Twitter", "/ X", site names, etc.
  return title
    .replace(/[|\-–—\/].*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

// ── Connection check ──────────────────────────────────────────────────────
async function checkConnection() {
  try {
    const res = await fetch(`${siftlyUrl}/api/stats`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      statusDot.className = 'status-dot connected';
      statusText.textContent = `Connected to ${new URL(siftlyUrl).host}`;
      return true;
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    statusDot.className = 'status-dot error';
    statusText.textContent = `Cannot reach Siftly — check settings`;
    showEmpty('Cannot connect to Siftly. Make sure it is running and the URL is correct in settings.');
    return false;
  }
}

// ── Search ────────────────────────────────────────────────────────────────
async function runSearch(query) {
  if (!query.trim()) {
    showEmpty('Type something to search your bookmarks.');
    return;
  }
  currentQuery = query.trim();
  setLoading(true);

  try {
    const sources = await askBookmarks(currentQuery);
    setLoading(false);
    displayResults(sources);
  } catch (err) {
    setLoading(false);
    showEmpty('Search failed. Is Siftly running?');
    console.error('[Siftly] search error', err);
  }
}

// ── SSE streaming from /api/ask ───────────────────────────────────────────
async function askBookmarks(question) {
  const response = await fetch(`${siftlyUrl}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let sources = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Keep last (potentially incomplete) line in buffer
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'sources') {
          sources = event.data;
          // Show sources immediately as they stream in
          displayResults(sources);
        }
        if (event.type === 'done') {
          return sources;
        }
      } catch (_) {
        // Ignore malformed SSE lines
      }
    }
  }

  return sources;
}

// ── Render results ────────────────────────────────────────────────────────
function displayResults(sources) {
  if (!sources || sources.length === 0) {
    showEmpty('No related bookmarks found. Try rephrasing your search.');
    return;
  }

  emptyState.hidden = true;
  resultsEl.innerHTML = '';

  for (const source of sources) {
    const card = buildCard(source);
    resultsEl.appendChild(card);
  }
}

function buildCard(source) {
  const {
    id,
    tweetText = '',
    authorHandle = '',
    authorName = '',
    authorProfileImageUrl = '',
    categories = [],
    createdAt = ''
  } = source;

  const card = document.createElement('div');
  card.className = 'bookmark-card';

  // Date
  let dateStr = '';
  if (createdAt) {
    try {
      dateStr = new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (_) {}
  }

  // Avatar initials fallback
  const initials = (authorHandle || authorName || '?').slice(0, 1).toUpperCase();

  // Categories chips HTML
  const chipsHtml = (Array.isArray(categories) ? categories : [])
    .slice(0, 4)
    .map(cat => `<span class="category-chip">${escHtml(cat)}</span>`)
    .join('');

  const handle = authorHandle ? `@${escHtml(authorHandle)}` : escHtml(authorName || 'Unknown');
  const snippet = escHtml((tweetText || '').trim());

  card.innerHTML = `
    <div class="card-header">
      <div class="author-avatar">
        ${authorProfileImageUrl
          ? `<img src="${escHtml(authorProfileImageUrl)}" alt="${escHtml(initials)}" onerror="this.parentNode.textContent='${escHtml(initials)}'" />`
          : escHtml(initials)
        }
      </div>
      <span class="author-handle">${handle}</span>
      ${dateStr ? `<span class="card-date">${dateStr}</span>` : ''}
    </div>
    <div class="card-text">${snippet}</div>
    ${chipsHtml ? `<div class="card-categories">${chipsHtml}</div>` : ''}
    <div class="card-actions">
      <button class="btn btn-view" data-id="${escHtml(String(id))}" title="Open in Siftly">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        View
      </button>
      <button class="btn btn-queue" data-id="${escHtml(String(id))}" title="Add to reading queue">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Queue
      </button>
    </div>
  `;

  // View button — open bookmark in Siftly
  card.querySelector('.btn-view').addEventListener('click', () => {
    chrome.tabs.create({ url: `${siftlyUrl}/bookmarks?id=${encodeURIComponent(id)}` });
  });

  // Queue button
  card.querySelector('.btn-queue').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    await addToQueue(id, btn);
  });

  return card;
}

// ── Add to Queue ──────────────────────────────────────────────────────────
async function addToQueue(bookmarkId, btn) {
  if (!bookmarkId) return;
  btn.classList.add('adding');
  btn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.7s linear infinite">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
    Adding…
  `;

  try {
    const res = await fetch(`${siftlyUrl}/api/bookmarks/${bookmarkId}/reading-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'queue' }),
      signal: AbortSignal.timeout(8000)
    });

    if (res.ok) {
      btn.classList.remove('adding');
      btn.classList.add('added');
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Added
      `;
      btn.disabled = true;
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    btn.classList.remove('adding');
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Queue
    `;
    console.error('[Siftly] addToQueue error', err);
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────
function setLoading(state) {
  loadingEl.hidden = !state;
  emptyState.hidden = true;
  if (state) resultsEl.innerHTML = '';
}

function showEmpty(msg) {
  resultsEl.innerHTML = '';
  loadingEl.hidden = true;
  emptyState.hidden = false;
  emptyState.querySelector('.empty-sub').textContent = msg || '';
}

function updateClearBtn() {
  searchClear.classList.toggle('visible', searchInput.value.length > 0);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Settings ──────────────────────────────────────────────────────────────
settingsBtn.addEventListener('click', () => {
  settingsPanel.hidden = false;
  siftlyUrlInput.value = siftlyUrl;
  siftlyUrlInput.focus();
});

settingsBack.addEventListener('click', () => {
  settingsPanel.hidden = true;
});

settingsSave.addEventListener('click', async () => {
  const newUrl = siftlyUrlInput.value.trim().replace(/\/$/, '') || DEFAULT_URL;
  siftlyUrl = newUrl;
  await chrome.storage.local.set({ siftlyUrl: newUrl });
  settingsPanel.hidden = true;
  await checkConnection();
});

// ── Search events ─────────────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  updateClearBtn();
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    runSearch(searchInput.value);
  }, 450);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(searchDebounceTimer);
    runSearch(searchInput.value);
  }
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  updateClearBtn();
  resultsEl.innerHTML = '';
  emptyState.hidden = false;
  emptyState.querySelector('.empty-sub').textContent = 'Type something to search your bookmarks.';
  searchInput.focus();
});

// ── Boot ──────────────────────────────────────────────────────────────────
init();
