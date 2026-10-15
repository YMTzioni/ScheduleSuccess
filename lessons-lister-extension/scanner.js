// Runs inside a login.successcollege.co.il tab (injected by background.js).
// Walks the college's public API: every track (bundle) -> its courses ->
// each course's content map, and keeps only the items that are lessons.
// Must stay self-contained: chrome.scripting serialises this one function.
export async function scanAllTracks() {
  const API = 'https://yeda-college.co.il/api';
  const LESSON_TYPES = new Set(['video', 'lesson']);
  const SKIP_PATTERNS = [
    /מבחן/i,
    /משוב על הקורס/i,
    /מצגות/i,
    /מצגת/i,
    /ספר דיגיטלי/i,
    /\sספר$/i,
    /טופס משוב/i,
    /\bsurvey\b/i,
    /\bquiz\b/i,
    /\bexam\b/i,
    /\btest\b/i,
    /\bpresentation/i,
  ];
  const COURSE_SKIP_PATTERNS = [/מצגת/i, /מצגות/i, /\bpresentation/i];

  const progress = (text) => {
    try {
      chrome.runtime.sendMessage({ type: 'SCAN_PROGRESS', text });
    } catch {
      // popup closed — nothing to update
    }
  };

  const clean = (text) =>
    String(text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\.(mp4|mov|m4v|mkv|webm|avi)$/i, '')
      .trim();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // The API rate-limits (429). Back off and retry those and server errors;
  // any other status is a real answer and fails at once.
  const MAX_ATTEMPTS = 6;
  async function getJson(url) {
    for (let attempt = 1; ; attempt += 1) {
      let res;
      try {
        res = await fetch(url, { headers: { Accept: 'application/json' } });
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS) throw error;
        await sleep(1000 * attempt);
        continue;
      }
      // 600 requests a minute: ease off before the limit instead of after.
      const remaining = Number(res.headers.get('x-ratelimit-remaining'));
      if (res.headers.has('x-ratelimit-remaining') && remaining < 15) await sleep(8000);
      if (res.ok) return res.json();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) throw new Error(`HTTP ${res.status}`);
      const retryAfter = Number(res.headers.get('Retry-After'));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 1500 * 2 ** (attempt - 1));
    }
  }

  // Runs `fn` over `items` with at most `limit` in flight, keeping order.
  async function mapLimited(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await fn(items[index]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  const { college_id: collegeId } = await getJson(
    `${API}/colleges/getCollegeIdByDomain?domain=${encodeURIComponent(location.hostname)}`,
  ).catch(() => ({ college_id: 139 }));
  const q = `current_college_id=${collegeId}`;

  const bundles = [];
  for (let page = 1; ; page += 1) {
    const res = await getJson(`${API}/wl/colleges/${collegeId}/bundles?page=${page}&count=50&${q}`);
    bundles.push(...(res.data ?? []));
    if (!res.last_page || page >= res.last_page) break;
  }

  // Some sections on the site have no fixed order — the API returns their
  // lessons in one of two orders, at random, on each request (DevOps ›
  // Operating Systems, October 2026). Reading every course twice catches such
  // a section about half the time per scan; when caught it is put in the
  // order the lessons were created (item_id) and reported, so the order can
  // be fixed on the site. Sorting every section that way is not an option:
  // about 90 sections are deliberately ordered otherwise.
  const READS_PER_COURSE = 2;
  async function loadCourse(slug) {
    const url = `${API}/courses/${encodeURIComponent(slug)}/about?${q}`;
    const reads = [];
    for (let i = 0; i < READS_PER_COURSE; i += 1) reads.push(await getJson(url));

    const course = reads[0];
    const unstable = [];
    for (const section of course.content_map?.map ?? []) {
      const orderOf = (read) =>
        (read.content_map?.map ?? [])
          .find((s) => s.id === section.id)
          ?.items?.map((item) => item.item_id)
          .join(',');
      const first = orderOf(course);
      if (reads.some((read) => orderOf(read) !== first)) {
        section.items = [...section.items].sort((a, b) => a.item_id - b.item_id);
        unstable.push(clean(section.name));
      }
    }
    return { course, unstable };
  }

  const tracks = [];
  const problems = [];

  for (const [index, bundle] of bundles.entries()) {
    progress(`מסלול ${index + 1}/${bundles.length}: ${bundle.name}`);
    let detail;
    try {
      detail = await getJson(`${API}/wl/colleges/${collegeId}/bundle/${encodeURIComponent(bundle.slug)}?${q}`);
    } catch (error) {
      problems.push(`מסלול "${bundle.name}": לא נטען (${error.message})`);
      continue;
    }

    const courseRefs = detail.courses ?? [];
    const courses = await mapLimited(courseRefs, 3, async (ref) => {
      try {
        return { ref, ...(await loadCourse(ref.slug_id)) };
      } catch (error) {
        return { ref, error: error.message };
      }
    });

    const track = {
      id: bundle.id,
      slug: bundle.slug,
      name: clean(bundle.name),
      description: clean(bundle.description),
      hidden: Boolean(bundle.hidden),
      expectedCourses: bundle.courses_count ?? courseRefs.length,
      courses: [],
      excluded: [],
      skippedCourses: 0,
      lessonCount: 0,
    };

    for (const { ref, course, unstable, error } of courses) {
      const title = clean(ref.name);
      if (error) {
        problems.push(`"${track.name}" › "${title}": הקורס לא נטען (${error})`);
        continue;
      }
      for (const sectionName of unstable) {
        problems.push(
          `"${track.name}" › "${title}" › "${sectionName}": לשיעורים אין סדר קבוע באתר — סודרו לפי סדר היצירה`,
        );
      }
      // A course *about* an exam ("הכנה למבחן…") is still a course; only a
      // presentations course is dropped whole. An exam-only unit falls out
      // below, when nothing in it survives the filter.
      if (COURSE_SKIP_PATTERNS.some((p) => p.test(title))) {
        track.excluded.push({ course: title, name: `הקורס כולו: ${title}`, reason: 'סינון לפי שם' });
        track.skippedCourses += 1;
        continue;
      }

      const seen = new Set();
      const lessons = [];
      for (const section of course.content_map?.map ?? []) {
        for (const item of section.items ?? []) {
          const name = clean(item.name);
          if (!name) continue;
          if (!LESSON_TYPES.has(item.type)) {
            track.excluded.push({ course: title, name, reason: item.type });
            continue;
          }
          if (SKIP_PATTERNS.some((p) => p.test(name))) {
            track.excluded.push({ course: title, name, reason: 'סינון לפי שם' });
            continue;
          }
          if (seen.has(name)) {
            track.excluded.push({ course: title, name, reason: 'כפול' });
            continue;
          }
          seen.add(name);
          lessons.push(name);
        }
      }

      if (!lessons.length) {
        const itemCount = (course.content_map?.map ?? []).reduce(
          (sum, section) => sum + (section.items?.length ?? 0),
          0,
        );
        if (itemCount) {
          // Only exams / feedback inside — not a teaching course.
          track.excluded.push({ course: title, name: `הקורס כולו: ${title}`, reason: 'ללא שיעורים' });
          track.skippedCourses += 1;
        } else {
          problems.push(`"${track.name}" › "${title}": הקורס ריק`);
          track.courses.push({ title, slug: ref.slug_id, lessons });
        }
        continue;
      }
      track.courses.push({ title, slug: ref.slug_id, lessons });
      track.lessonCount += lessons.length;
    }

    if (track.courses.length + track.skippedCourses !== track.expectedCourses) {
      problems.push(
        `"${track.name}": נטענו ${track.courses.length} קורסים מתוך ${track.expectedCourses}`,
      );
    }
    tracks.push(track);
  }

  return {
    exportedAt: new Date().toISOString(),
    source: location.origin,
    collegeId,
    tracks,
    problems,
  };
}
