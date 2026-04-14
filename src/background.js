'use strict';

import { generateAssignmentId, isValidSemesterDate } from './utils.js';

// ── Scrape Result Handler ─────────────────────────────────────────────────────

/**
 * Merges scraped assignments into chrome.storage.sync.
 * - Skips items whose due date fails isValidSemesterDate.
 * - Skips items whose generated ID already exists in storage.
 */
function saveScrapedAssignments(scraped, sendResponse) {
  chrome.storage.sync.get(['assignments'], (result) => {
    const existing = result.assignments || [];
    const existingIds = new Set(existing.map((a) => a.id));

    const toAdd = [];
    let skippedDate = 0;
    let skippedDuplicate = 0;

    for (const item of scraped) {
      if (!isValidSemesterDate(item.dueDate || '')) { skippedDate++; continue; }

      const id = generateAssignmentId(item.courseId || '', item.assignmentName);
      if (existingIds.has(id)) { skippedDuplicate++; continue; }

      toAdd.push({
        id,
        title: item.assignmentName,
        course: item.courseName || item.courseId || '',
        due: item.dueDate || '',
        status: 'ready',
        notes: '',
        checklist: [],
      });
    }

    console.log(
      `[BB Kanban] Scrape complete — scraped: ${scraped.length}, ` +
      `skipped (date): ${skippedDate}, skipped (duplicate): ${skippedDuplicate}, ` +
      `saved: ${toAdd.length}`
    );

    if (toAdd.length === 0) {
      sendResponse({ added: 0 });
      return;
    }

    chrome.storage.sync.set({ assignments: [...existing, ...toAdd] }, () => {
      sendResponse({ added: toAdd.length });
    });
  });
}

// ── Message Handling ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GREETINGS') {
    const message = `Hi ${
      sender.tab ? 'Con' : 'Pop'
    }, my name is Bac. I am from Background. It's great to hear from you.`;
    console.log(request.payload.message);
    sendResponse({ message });
    return true;
  }

  if (request.type === 'TRIGGER_SCRAPE') {
    chrome.tabs.query({ url: ['*://*.blackboard.com/*', '*://*.cune.edu/*'] }, (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        sendResponse({ error: 'No Blackboard tab found. Open the Blackboard calendar first.' });
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_CALENDAR' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          sendResponse({ error: chrome.runtime.lastError?.message || 'No response from content script.' });
          return;
        }
        saveScrapedAssignments(response.assignments || [], sendResponse);
      });
    });
    return true; // keep channel open for async response
  }

  sendResponse({});
  return true;
});
