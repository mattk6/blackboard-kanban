'use strict';

// ── Calendar Scraper ──────────────────────────────────────────────────────────

/**
 * Parses a Blackboard due-date string like:
 *   "Due date 2: 2/24/26, 10:59 PM (MST)"
 *   "Due: 3/5/26, 11:59 PM (CST)"
 * Returns a YYYY-MM-DD string, or null if unparseable.
 */
function parseDueDateText(text) {
  // Match M/D/YY or MM/DD/YY patterns after the colon
  const match = text.match(/:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;
  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  let year = parseInt(match[3], 10);
  if (year < 100) year += 2000;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Extracts the Blackboard course ID from a course outline href.
 * e.g. "https://blackboard.cune.edu/ultra//_51705_1/outline" → "_51705_1"
 */
function parseCourseId(href) {
  if (!href) return null;
  const match = href.match(/\/_(\d+_\d+)\/outline/);
  return match ? `_${match[1]}` : null;
}

/**
 * Scrapes all deadline items from the Blackboard calendar deadlines view.
 * Returns an array of { courseId, assignmentName, dueDate } objects.
 */
function scrapeCalendarDeadlines() {
  const results = [];
  const dateGroups = document.querySelectorAll('div[id^="bb-calendar1-deadlines-"]');

  dateGroups.forEach((group) => {
    const cards = group.querySelectorAll('.element-card-deadline');
    cards.forEach((card) => {
      const nameAnchor = card.querySelector(
        'a[analytics-id="components.directives.calendar.deadlines.navigation.openDueDateItem"]'
      );
      const courseAnchor = card.querySelector(
        'a[analytics-id="components.directives.calendar.deadlines.navigation.openCourseOutline"]'
      );

      if (!nameAnchor) return;

      const assignmentName = nameAnchor.textContent.trim();
      const courseId = parseCourseId(courseAnchor ? courseAnchor.getAttribute('href') : null);

      // Due date is in the first span inside .content that contains "Due"
      let dueDate = null;
      const contentEl = card.querySelector('.content');
      if (contentEl) {
        const spans = contentEl.querySelectorAll('span');
        for (const span of spans) {
          if (span.textContent.includes('Due')) {
            dueDate = parseDueDateText(span.textContent);
            break;
          }
        }
      }

      results.push({ courseId, assignmentName, dueDate });
    });
  });

  return results;
}

// ── Message Handling ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SCRAPE_CALENDAR') {
    const assignments = scrapeCalendarDeadlines();
    sendResponse({ assignments });
    return true;
  }

  // Send an empty response
  // See https://github.com/mozilla/webextension-polyfill/issues/130#issuecomment-531531890
  sendResponse({});
  return true;
});
