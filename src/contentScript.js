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
 * Injects a tiny <script> into the page's MAIN world so it can access
 * window.angular (which is invisible from a content script's isolated world).
 * The injected code reads the AngularJS scope on the assessment-overview panel
 * header and posts the content ID back via window.postMessage.
 */
function readContentIdFromPageScope() {
  return new Promise((resolve) => {
    const MSG_TYPE = 'BB_KANBAN_CONTENT_ID';

    const handler = (event) => {
      if (event.source !== window || event.data?.type !== MSG_TYPE) return;
      window.removeEventListener('message', handler);
      resolve(event.data.contentId || null);
    };
    window.addEventListener('message', handler);

    const script = document.createElement('script');
    script.textContent = `(function(){
      var cid = null;
      try {
        var hdr = document.querySelector('assessment-overview-panel-header');
        if (hdr && window.angular) {
          var el = angular.element(hdr);
          var iso = el.isolateScope && el.isolateScope();
          cid = (iso && iso.contentId) || null;
          if (!cid) {
            var s = el.scope();
            cid = (s && s.assessmentOverview && s.assessmentOverview.content
                   && s.assessmentOverview.content.id) || null;
          }
        }
      } catch(e) {}
      window.postMessage({type:'BB_KANBAN_CONTENT_ID', contentId: cid}, '*');
    })();`;
    (document.head || document.documentElement).appendChild(script);
    script.remove();

    setTimeout(() => { window.removeEventListener('message', handler); resolve(null); }, 2000);
  });
}

/**
 * For each scraped result, clicks its calendar card to open the detail panel,
 * then extracts the Blackboard content ID using two strategies:
 *   1. Parse it from the URL (Blackboard may update the hash/path when the panel opens)
 *   2. Inject a page-world script to read the AngularJS scope
 * Adds `contentId` to each result in-place.
 */
async function enrichWithContentIds(results) {
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

    // Wait for the panel to appear with the correct assignment title
    const panelReady = await waitFor(() => {
      const h1 = document.querySelector('assessment-overview-panel-header .js-header-text');
      return h1 && h1.textContent.trim() === item.assignmentName;
    }, 6000, 150);

    let contentId = null;

    if (panelReady) {
      // Strategy 1: Blackboard updates the URL when the panel opens
      // e.g. /ultra/calendar/assessment/_2439749_1/overview?courseId=_51705_1
      const url = window.location.href;
      const cidMatch = url.match(/\/assessment\/(_\d+_\d+)\//);
      if (cidMatch) contentId = cidMatch[1];

      // Also grab courseId from the URL query param as a fallback
      if (!item.courseId) {
        const qMatch = url.match(/[?&]courseId=(_\d+_\d+)/);
        if (qMatch) item.courseId = qMatch[1];
      }

      // Strategy 2: inject into page's main world to read Angular scope
      if (!contentId) contentId = await readContentIdFromPageScope();

      // Scrape submission/graded status from the panel DOM
      // 1. Grade card: present when graded (even if attempts remain)
      const gradeCard = document.querySelector('.js-attempt-posted');
      const submissionLabel = document.querySelector('.submission-label');
      if (gradeCard || (submissionLabel && /grade|score/i.test(submissionLabel.textContent))) {
        item.submitted = true;
      }
      // 2. Button text: "View submission" when submitted but not yet graded
      if (!item.submitted) {
        const btnLabel = document.querySelector('.label-button-attempt');
        if (btnLabel && /submission|review/i.test(btnLabel.textContent)) {
          item.submitted = true;
        }
      }
    }

    if (contentId) {
      item.contentId = contentId;
    } else {
      console.warn(`[BB Kanban] Could not extract contentId for "${item.assignmentName}"`);
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
