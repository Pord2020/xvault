/* ─── Siftly Content Script (Twitter / X) ────────────────────────────── */

(function () {
  'use strict';

  const SIFTLY_BADGE_ID = 'siftly-floating-badge';
  const DEFAULT_URL     = 'http://localhost:3000';

  // ── Message listener ────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_PAGE_CONTEXT') {
      sendResponse(getPageContext());
      return true; // keep channel open for async if needed
    }
    if (message.type === 'UPDATE_BADGE_COUNT') {
      updateBadgeCount(message.count);
      return true;
    }
  });

  // ── Extract page context ─────────────────────────────────────────────────
  function getPageContext() {
    const tweetData = extractTweetData();
    return {
      tweetText:   tweetData.text,
      tweetAuthor: tweetData.author,
      pageUrl:     window.location.href,
      pageTitle:   document.title
    };
  }

  function extractTweetData() {
    // On a single-tweet permalink page the primary article is the first one
    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    if (articles.length === 0) return { text: '', author: '' };

    // Prefer the article that is in the main timeline focus position
    const primary = articles[0];

    const textEl   = primary.querySelector('[data-testid="tweetText"]');
    const authorEl = primary.querySelector('[data-testid="User-Name"]');

    const text   = textEl   ? textEl.innerText.trim()   : '';
    const author = authorEl ? authorEl.innerText.trim() : '';

    return { text, author };
  }

  // ── Floating badge ───────────────────────────────────────────────────────
  function injectBadge() {
    if (document.getElementById(SIFTLY_BADGE_ID)) return;

    const badge = document.createElement('button');
    badge.id    = SIFTLY_BADGE_ID;
    badge.setAttribute('aria-label', 'Siftly — related bookmarks');
    badge.innerHTML = `<span class="siftly-icon">📚</span><span class="siftly-label">Siftly</span>`;

    applyBadgeStyles(badge);

    badge.addEventListener('click', () => {
      // Send message to background to open the popup programmatically.
      // MV3 cannot open popups directly from content scripts; we rely on
      // the user having the popup pinned. We can at least focus the window.
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
    });

    document.body.appendChild(badge);

    // Fetch related count in background and update badge
    fetchRelatedCount();
  }

  function applyBadgeStyles(badge) {
    const style = badge.style;
    style.cssText = [
      'position: fixed',
      'bottom: 24px',
      'right: 24px',
      'z-index: 999999',
      'display: flex',
      'align-items: center',
      'gap: 6px',
      'padding: 8px 14px',
      'background: #09090b',
      'color: #f4f4f5',
      'border: 1px solid #27272a',
      'border-radius: 999px',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'font-size: 13px',
      'font-weight: 600',
      'cursor: pointer',
      'box-shadow: 0 4px 16px rgba(0,0,0,0.5)',
      'transition: transform 0.15s, box-shadow 0.15s, background 0.15s',
      'outline: none',
      'user-select: none'
    ].join(';');

    badge.addEventListener('mouseenter', () => {
      badge.style.background   = '#18181b';
      badge.style.transform    = 'translateY(-2px)';
      badge.style.boxShadow    = '0 6px 20px rgba(99,102,241,0.35)';
    });
    badge.addEventListener('mouseleave', () => {
      badge.style.background   = '#09090b';
      badge.style.transform    = 'translateY(0)';
      badge.style.boxShadow    = '0 4px 16px rgba(0,0,0,0.5)';
    });
  }

  function updateBadgeCount(count) {
    const badge = document.getElementById(SIFTLY_BADGE_ID);
    if (!badge) return;

    const labelEl = badge.querySelector('.siftly-label');
    if (!labelEl) return;

    if (count > 0) {
      labelEl.textContent = `${count} related`;
      badge.style.borderColor = '#6366f1';
    } else {
      labelEl.textContent = 'Siftly';
      badge.style.borderColor = '#27272a';
    }
  }

  async function fetchRelatedCount() {
    try {
      const stored = await chrome.storage.local.get(['siftlyUrl']);
      const baseUrl = (stored.siftlyUrl || DEFAULT_URL).replace(/\/$/, '');

      const { text } = extractTweetData();
      const query = text || sanitiseTitle(document.title);
      if (!query.trim()) return;

      const res = await fetch(`${baseUrl}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query }),
        signal: AbortSignal.timeout(15000)
      });

      if (!res.ok) return;

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'sources' && Array.isArray(event.data)) {
              updateBadgeCount(event.data.length);
            }
            if (event.type === 'done') return;
          } catch (_) {}
        }
      }
    } catch (_) {
      // Silently fail — badge count is a nice-to-have
    }
  }

  function sanitiseTitle(title) {
    return title.replace(/[|\-–—\/].*$/, '').replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  // ── SPA navigation watcher ───────────────────────────────────────────────
  // Twitter/X is a SPA; we watch for URL changes to re-inject the badge
  // and update the count when the user navigates to a tweet.
  let lastUrl = location.href;

  function onUrlChange() {
    const current = location.href;
    if (current === lastUrl) return;
    lastUrl = current;

    // Remove old badge
    const old = document.getElementById(SIFTLY_BADGE_ID);
    if (old) old.remove();

    // Re-inject after a short delay to allow the new page content to render
    setTimeout(injectBadge, 1200);
  }

  // MutationObserver to detect SPA navigation
  const navObserver = new MutationObserver(onUrlChange);
  navObserver.observe(document.body, { childList: true, subtree: true });

  // Also listen to popstate / pushstate
  window.addEventListener('popstate', onUrlChange);

  // Patch history.pushState / replaceState
  const _push    = history.pushState.bind(history);
  const _replace = history.replaceState.bind(history);

  history.pushState = function (...args) {
    _push(...args);
    onUrlChange();
  };
  history.replaceState = function (...args) {
    _replace(...args);
    onUrlChange();
  };

  // ── Initial injection ────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBadge);
  } else {
    injectBadge();
  }
})();
