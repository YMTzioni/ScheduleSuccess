const WAIT_AFTER_NAVIGATION_MS = 1200;

const SKIP_PATTERNS = [
  /מבחן/i,
  /משוב על הקורס/i,
  /מצגות/i,
  /\bsurvey\b/i,
  /\bquiz\b/i,
  /\btest\b/i,
  /\bpresentation/i,
];

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function shouldSkipTitle(title) {
  const cleanTitle = normalizeText(title);
  return SKIP_PATTERNS.some((pattern) => pattern.test(cleanTitle));
}

async function waitForTabComplete(tabId, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('טעינת הדף ארכה יותר מדי זמן.');
}

async function executeInTab(tabId, func) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
  });
  return result.result;
}

async function waitForMenus(tabId, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const hasMenus = await executeInTab(tabId, () => Boolean(document.querySelector('#menus')));
    if (hasMenus) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function getCourseLinks(tabId) {
  return executeInTab(tabId, () => {
    const isCoursePage = Boolean(document.querySelector('#menus'));
    if (isCoursePage) return [window.location.href];

    const anchors = Array.from(document.querySelectorAll('a[href*="/courses/"]'));

    const links = anchors
      .map((anchor) => anchor.href)
      .filter((href) => href.includes('/courses/'))
      // דף קורס ראשי בלבד (לא lesson/survey/about פנימיים)
      .filter((href) => !href.includes('/learn/'))
      .map((href) => {
        const url = new URL(href, window.location.origin);
        // מנקה query/hash כדי להימנע מכפילויות
        return `${url.origin}${url.pathname}`;
      });

    return Array.from(new Set(links));
  });
}

async function scrapeLessonsOnCurrentPage(tabId) {
  return executeInTab(tabId, () => {
    const skipPatterns = [
      /מבחן/i,
      /משוב על הקורס/i,
      /מצגות/i,
      /\bsurvey\b/i,
      /\bquiz\b/i,
      /\btest\b/i,
      /\bpresentation/i,
    ];

    const normalize = (text) => text.replace(/\s+/g, ' ').trim();
    const shouldSkip = (text) => skipPatterns.some((regex) => regex.test(normalize(text)));

    const menusRoot = document.querySelector('#menus');
    const titleFromH1 = normalize(document.querySelector('h1')?.textContent || '');
    const titleFromSidebar = normalize(
      document.querySelector('#menus .sidebar-section__title')?.textContent || ''
    );
    const fallbackTitle = normalize(document.title || '');
    const courseTitle = titleFromH1 || titleFromSidebar || fallbackTitle || 'ללא כותרת';

    if (!menusRoot) {
      return { title: courseTitle, lessons: [] };
    }

    const lessonAnchors = Array.from(
      menusRoot.querySelectorAll(
        'ul.names-list a[href*="/learn/lesson/"], ul.names-list a[href*="/learn/live/"], ul.names-list a[href*="/learn/practice/"]'
      )
    );

    const lessons = lessonAnchors
      .map((a) => normalize(a.textContent || ''))
      .filter(Boolean)
      .filter((lessonTitle) => !shouldSkip(lessonTitle))
      .filter((lessonTitle) => !/^אודות הקורס$/i.test(lessonTitle));

    return {
      title: courseTitle,
      lessons: Array.from(new Set(lessons)),
    };
  });
}

async function scanAllCourses(tabId, startUrl) {
  const links = await getCourseLinks(tabId);
  if (!links.length) throw new Error('לא נמצאו קישורי קורסים בדף.');

  const courses = [];
  const debug = {
    discoveredLinks: links.length,
    visited: 0,
    skippedNoLessons: 0,
  };

  for (const courseUrl of links) {
    debug.visited += 1;
    await chrome.tabs.update(tabId, { url: courseUrl });
    await waitForTabComplete(tabId);
    await new Promise((resolve) => setTimeout(resolve, WAIT_AFTER_NAVIGATION_MS));
    await waitForMenus(tabId);

    const courseData = await scrapeLessonsOnCurrentPage(tabId);
    if (shouldSkipTitle(courseData.title)) continue;
    if (!courseData.lessons.length) {
      debug.skippedNoLessons += 1;
      continue;
    }
    courses.push(courseData);
  }

  if (startUrl) {
    await chrome.tabs.update(tabId, { url: startUrl });
  }

  return { courses, debug };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'START_SCAN') return;

  (async () => {
    try {
      const data = await scanAllCourses(message.tabId, message.startUrl);
      sendResponse({ ok: true, data });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || 'שגיאה בהרצת הסריקה' });
    }
  })();

  return true;
});
