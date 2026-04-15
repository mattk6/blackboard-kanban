'use strict';

import { generateAssignmentId, isValidSemesterDate } from './utils.js';

// ── Scrape Result Handler ─────────────────────────────────────────────────────

/**
 * Merges scraped assignments into chrome.storage.sync.
 * - Skips items whose due date fails isValidSemesterDate.
 * - Skips items whose generated ID already exists in storage.
 */
function saveScrapedAssignments(scraped, origin, sendResponse) {
  chrome.storage.sync.get(['assignments'], (result) => {
    const existing = result.assignments || [];
    // Index by id for O(1) lookup and in-place mutation
    const existingById = Object.fromEntries(existing.map((a) => [a.id, a]));

    const toAdd = [];
    let skippedDate = 0;
    let skippedDuplicate = 0;
    let backfilled = 0;

    const now = Date.now();
    for (const item of scraped) {
      if (!isValidSemesterDate(item.dueDate || '')) { skippedDate++; continue; }

      // Skip assignments more than 7 days past due
      if (item.dueDate) {
        const dueMs = new Date(item.dueDate + 'T23:59:59').getTime();
        if (now - dueMs > 7 * 86400000) { skippedDate++; continue; }
      }

      const id = generateAssignmentId(item.courseId || '', item.assignmentName);
      const course = item.courseName || item.courseId || '';
      const basePath = (origin && item.courseId && item.contentId)
        ? `${origin}/ultra/courses/${item.courseId}/outline/assessment/${item.contentId}/overview`
        : '';
      const url = basePath
        ? basePath + (item.submitted ? '' : '/attempt/create') + `?courseId=${item.courseId}`
        : '';

      if (existingById[id]) {
        // Backfill course name, url, and submission status on the existing record
        const rec = existingById[id];
        if (course && !rec.course) { rec.course = course; backfilled++; }
        if (url && url !== rec.url) { rec.url = url; backfilled++; }
        // Auto-advance status if Blackboard says it's submitted
        if (item.submitted && (rec.status === 'ready' || rec.status === 'inprogress')) {
          rec.status = 'submitted'; backfilled++;
        }
        skippedDuplicate++;
        continue;
      }

      toAdd.push({
        id,
        title: item.assignmentName,
        course,
        due: item.dueDate || '',
        url,
        status: item.submitted ? 'submitted' : 'ready',
        notes: '',
        checklist: [],
      });
    }

    console.log(
      `[BB Kanban] Scrape complete — scraped: ${scraped.length}, ` +
      `skipped (date): ${skippedDate}, duplicates: ${skippedDuplicate}, ` +
      `backfilled: ${backfilled}, added: ${toAdd.length}`
    );

    if (toAdd.length === 0 && backfilled === 0) {
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
        saveScrapedAssignments(response.assignments || [], response.origin || '', sendResponse);
      });
    });
    return true; // keep channel open for async response
  }

  sendResponse({});
  return true;
});
