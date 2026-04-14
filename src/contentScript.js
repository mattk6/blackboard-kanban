'use strict';

// ── Calendar Scraper ──────────────────────────────────────────────────────────

/**
 * Parses a Blackboard due-date string like:
 *   "Due date 2: 2/24/26, 10:59 PM (MST)"
 *   "Due: 3/5/26, 11:59 PM (CST)"
 * Returns a YYYY-MM-DD string, or null if unparseable.
 */
function parseDueDateText(text) {
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
 * Finds the scrollable calendar deadlines container.
 * Returns the element, or null if not found.
 */
function findCalendarScrollContainer() {
  // The deadlines panel is the closest scrollable ancestor of the date groups
  const firstGroup = document.querySelector('div[id^="bb-calendar1-deadlines-"]');
  if (!firstGroup) return null;

  let el = firstGroup.parentElement;
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return el;
    el = el.parentElement;
  }

  // Fallback: return the direct parent of the date groups
  return firstGroup.parentElement;
}

/**
 * Scrolls the container by `delta` pixels and waits `delayMs` for content to load.
 */
function scrollStep(container, delta, delayMs) {
  return new Promise((resolve) => {
    container.scrollBy({ top: delta, behavior: 'smooth' });
    setTimeout(resolve, delayMs);
  });
}

/**
 * Scrolls up `steps` times then down `steps * 2` times with a pause between each step,
 * so AngularJS ng-repeat content above and below the viewport has time to render.
 * step size is roughly one viewport height of the container.
 */
async function scrollToLoadContent(container, steps = 15, stepDelayMs = 400) {
  const stepSize = container.clientHeight || 400;

  for (let i = 0; i < steps; i++) {
    await scrollStep(container, -stepSize, stepDelayMs);
  }

  for (let i = 0; i < steps * 2; i++) {
    await scrollStep(container, stepSize, stepDelayMs);
  }
}

/**
 * Scrapes all deadline items currently in the DOM.
 * Returns an array of { courseId, assignmentName, dueDate } objects.
 */
function scrapeCalendarDeadlines() {
  const results = [];
  const seen = new Set();
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

      // Deduplicate by courseId + assignmentName
      const key = `${courseId}|${assignmentName}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ courseId, assignmentName, dueDate });
      }
    });
  });

  return results;
}

/**
 * Full scrape routine: finds the calendar container, scrolls up 15 steps then
 * down 30 steps to trigger lazy-loaded content, then scrapes all visible deadlines.
 * Returns a Promise that resolves to an array of { courseId, assignmentName, dueDate }.
 */
async function scrapeCalendarWithScrolling() {
  const container = findCalendarScrollContainer();
  if (!container) {
    console.warn('[BB Kanban] Calendar scroll container not found — scraping static DOM.');
    return scrapeCalendarDeadlines();
  }

  await scrollToLoadContent(container);
  return scrapeCalendarDeadlines();
}

// ── Message Handling ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'SCRAPE_CALENDAR') {
    scrapeCalendarWithScrolling().then((assignments) => {
      sendResponse({ assignments });
    });
    return true; // keep channel open for async response
  }

  sendResponse({});
  return true;
});
