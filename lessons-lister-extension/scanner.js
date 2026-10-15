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

  async function getJson(url) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (res.ok) return await res.json();
        if (res.status < 500) throw new Error(`HTTP ${res.status}`);
      } catch (error) {
        if (attempt === 3) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
    throw new Error('unreachable');
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
    const courses = await Promise.all(
      courseRefs.map(async (ref) => {
        try {
          const course = await getJson(`${API}/courses/${encodeURIComponent(ref.slug_id)}/about?${q}`);
          return { ref, course };
        } catch (error) {
          return { ref, error: error.message };
        }
      }),
    );

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

    for (const { ref, course, error } of courses) {
      const title = clean(ref.name);
      if (error) {
        problems.push(`"${track.name}" › "${title}": הקורס לא נטען (${error})`);
        continue;
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
