'use strict';

import './popup.css';

document.getElementById('openBoardBtn').addEventListener('click', () => {
  const url = chrome.runtime.getURL('kanban.html');
  chrome.tabs.query({ url }, (existing) => {
    if (existing.length > 0) {
      chrome.tabs.update(existing[0].id, { active: true });
      chrome.windows.update(existing[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url });
    }
  });
  window.close();
});

document.getElementById('syncBtn').addEventListener('click', () => {
  const btn = document.getElementById('syncBtn');
  const status = document.getElementById('syncStatus');

  btn.disabled = true;
  btn.textContent = 'Syncing…';
  status.textContent = 'Scrolling calendar to load all assignments…';

  chrome.runtime.sendMessage({ type: 'TRIGGER_SCRAPE' }, (response) => {
    btn.disabled = false;
    btn.textContent = 'Sync Assignments';

    if (chrome.runtime.lastError) {
      status.textContent = 'Error: ' + chrome.runtime.lastError.message;
      return;
    }
    if (!response || response.error) {
      status.textContent = response?.error || 'No response from extension.';
      return;
    }
    status.textContent = response.added > 0
      ? `Added ${response.added} assignment${response.added !== 1 ? 's' : ''} to the board.`
      : 'Already up to date.';
  });
});
