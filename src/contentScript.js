'use strict';

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Polls `predicate` every `intervalMs` until it returns a truthy value or
 * `timeoutMs` elapses.  Resolves with the truthy value or null on timeout.
 */
function waitFor(predicate, timeoutMs = 6000, intervalMs = 150) {
  return new Promise((resolve) => {
    const start = Date.now();
    const id = setInterval(() => {
      const val = predicate();
      if (val) { clearInterval(id); resolve(val); return; }
      if (Date.now() - start > timeoutMs) { clearInterval(id); resolve(null); }
    }, intervalMs);
  });
}

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
 * Extracts a human-readable course name from the course anchor text.
 * e.g. "CS-331-01_202620: CS 331 - Software Engineering" → "CS 331 - Software Engineering"
 * Falls back to the full text if no ": " separator is found.
 */
function extractCourseName(text) {
  const sep = text.indexOf(': ');
  return sep !== -1 ? text.slice(sep + 2).trim() : text.trim();
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
      ) || card.querySelector('a[href*="/courses/"][href*="/outline"]');

      if (!nameAnchor) return;

      const assignmentName = nameAnchor.textContent.trim();
      const courseId = parseCourseId(courseAnchor ? courseAnchor.getAttribute('href') : null);
      const courseName = courseAnchor ? extractCourseName(courseAnchor.textContent) : null;

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
        // _anchor kept for click-through enrichment; stripped before returning to background
        results.push({ courseId, courseName, assignmentName, dueDate, _anchor: nameAnchor });
      }
    });
  });

  return results;
}

/**
 * Reads the Blackboard content ID for the currently open assessment overview panel,
 * but only if the panel's visible title matches `expectedName`.
 * Uses AngularJS scope introspection — no navigation required.
 */
function readPanelContentId(expectedName) {
  const header = document.querySelector('assessment-overview-panel-header');
  if (!header) return null;

  // Confirm the panel has rendered the right assignment
  const h1 = header.querySelector('.js-header-text');
  if (!h1 || h1.textContent.trim() !== expectedName) return null;

  try {
    const ang = window.angular;
    if (!ang) return null;

    // Components may use an isolate scope with the bound attribute normalised to camelCase
    const iso = ang.element(header).isolateScope();
    if (iso?.contentId) return iso.contentId;

    // Fall back to the parent controller scope
    const scope = ang.element(header).scope();
    return scope?.assessmentOverview?.content?.id || null;
  } catch (_) {
    return null;
  }
}

/**
 * For each scraped result that has a `_anchor` element, clicks the card to open
 * the Blackboard detail panel, reads the AngularJS content ID, then dismisses
 * the panel with Escape.  Adds `contentId` to each result in-place.
 *
 * All DOM interaction happens inside the user's live browser session — no extra
 * authentication or headless browser needed.
 */
async function enrichWithContentIds(results) {
  if (!window.angular) {
    console.warn('[BB Kanban] AngularJS not detected — skipping contentId enrichment.');
    return;
  }

  const CARD_ANCHOR_SELECTOR =
    'a[analytics-id="components.directives.calendar.deadlines.navigation.openDueDateItem"]';

  for (const item of results) {
    // Re-acquire anchor in case virtual scrolling detached the stored reference
    let anchor = item._anchor?.isConnected ? item._anchor : null;
    if (!anchor) {
      for (const a of document.querySelectorAll(CARD_ANCHOR_SELECTOR)) {
        if (a.textContent.trim() === item.assignmentName) { anchor = a; break; }
      }
    }
    if (!anchor) {
      console.warn(`[BB Kanban] Card anchor not found for "${item.assignmentName}" — skipping`);
      continue;
    }

    // Bring the card into view, then click it to open the detail panel
    anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise((r) => setTimeout(r, 250));
    anchor.click();

    // Wait for the panel to show this specific assignment and expose a content ID
    const contentId = await waitFor(() => readPanelContentId(item.assignmentName), 6000, 150);

    if (contentId) {
      item.contentId = contentId;
    } else {
      console.warn(`[BB Kanban] Timed out waiting for contentId on "${item.assignmentName}"`);
    }

    // Dismiss the panel and give it a moment to close
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true })
    );
    await new Promise((r) => setTimeout(r, 400));
  }
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
  const results = scrapeCalendarDeadlines();

  // Phase 2: click each card to pull content IDs from the AngularJS scope
  await enrichWithContentIds(results);

  // Strip internal references before handing data to the background script
  for (const item of results) delete item._anchor;

  return results;
}

// ── Message Handling ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'SCRAPE_CALENDAR') {
    scrapeCalendarWithScrolling().then((assignments) => {
      sendResponse({ assignments, origin: window.location.origin });
    });
    return true; // keep channel open for async response
  }

  sendResponse({});
  return true;
});
