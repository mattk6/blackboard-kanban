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
