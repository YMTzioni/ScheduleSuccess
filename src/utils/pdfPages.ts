import type { ScheduledSession } from '../types';

export interface PdfPageContent {
  showHeader: boolean;
  showCompactHeader: boolean;
  showStudent: boolean;
  showTracks: boolean;
  sessions: ScheduledSession[];
  showScheduleTitle: boolean;
  showTableHeader: boolean;
  showSignature: boolean;
}

export interface PdfPageOptions {
  trackCount?: number;
  totalDescriptionChars?: number;
  introNote?: string;
}

const INTRO_NOTE_CHARS_PER_LINE = 110;

function countIntroNoteLines(introNote: string): number {
  if (!introNote) return 0;
  return introNote
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / INTRO_NOTE_CHARS_PER_LINE)), 0);
}

function getFirstPageMaxRows(
  trackCount: number,
  totalDescriptionChars: number,
  introNoteLines: number,
): number {
  let rows = 11 - trackCount * 2;
  if (totalDescriptionChars > 350) rows -= 2;
  if (totalDescriptionChars > 700) rows -= 2;
  if (totalDescriptionChars > 1200) rows -= 2;
  if (introNoteLines === 0) return Math.max(5, rows);
  rows -= 1 + Math.ceil(introNoteLines / 2);
  return Math.max(2, rows);
}

const CONTINUATION_PAGE_ROWS = 14;
const LAST_PAGE_MAX_ROWS = 12;
const MIN_TAIL_ROWS = 3;

// Heights measured from the rendered document (px at screen scale), so pages
// break where the content actually ends instead of after a row count — a
// meeting can hold one lesson or a hundred.
export interface PageMetrics {
  // Usable height of one A4 page, top padding to bottom padding included.
  pageHeight: number;
  // Where the first table row starts on the first page and on the others.
  firstStart: number;
  continuationStart: number;
  bottomPadding: number;
  signatureHeight: number;
  // One entry per session: the row's height, and each lesson's height when
  // the lessons are listed (so a long meeting can continue on the next page).
  rows: { height: number; lessonHeights: number[] }[];
}

const MIN_LESSONS_PER_PART = 2;

export function buildMeasuredPdfPages(
  sessions: ScheduledSession[],
  m: PageMetrics,
): PdfPageContent[] {
  if (sessions.length === 0 || m.rows.length !== sessions.length) {
    return buildPdfPages(sessions);
  }

  const capacity = m.pageHeight - m.bottomPadding;
  const pages: { sessions: ScheduledSession[]; heights: number[]; used: number }[] = [];
  let page = { sessions: [] as ScheduledSession[], heights: [] as number[], used: m.firstStart };
  const newPage = () => {
    pages.push(page);
    page = { sessions: [], heights: [], used: m.continuationStart };
  };
  const place = (session: ScheduledSession, height: number) => {
    page.sessions.push(session);
    page.heights.push(height);
    page.used += height;
  };

  sessions.forEach((session, index) => {
    const { height, lessonHeights } = m.rows[index];
    if (page.used + height <= capacity) {
      place(session, height);
      return;
    }

    // A long meeting continues across pages: as many lessons as fit here,
    // the rest in a row with the same date on the next page.
    if (lessonHeights.length >= MIN_LESSONS_PER_PART * 2) {
      const padding = height - lessonHeights.reduce((sum, h) => sum + h, 0);
      let from = 0;
      while (from < lessonHeights.length) {
        const room = capacity - page.used - padding;
        let to = from;
        let taken = 0;
        while (to < lessonHeights.length && taken + lessonHeights[to] <= room) {
          taken += lessonHeights[to];
          to += 1;
        }
        const rest = lessonHeights.length - to;
        if (rest > 0 && rest < MIN_LESSONS_PER_PART) to = lessonHeights.length - MIN_LESSONS_PER_PART;
        if (to - from < MIN_LESSONS_PER_PART) {
          if (page.sessions.length === 0) {
            // Not even two lessons fit on an empty page; place them anyway.
            to = Math.min(lessonHeights.length, from + MIN_LESSONS_PER_PART);
          } else {
            newPage();
            continue;
          }
        }
        const partHeight =
          padding + lessonHeights.slice(from, to).reduce((sum, h) => sum + h, 0);
        place({ ...session, lessonItems: session.lessonItems.slice(from, to) }, partHeight);
        from = to;
        if (from < lessonHeights.length) newPage();
      }
      return;
    }

    if (page.sessions.length > 0) newPage();
    place(session, height);
  });

  // The signature goes under the last rows; if it does not fit, the last row
  // moves to a new page with it.
  if (page.used + m.signatureHeight > capacity && page.sessions.length > 1) {
    const session = page.sessions.pop()!;
    const height = page.heights.pop()!;
    page.used -= height;
    newPage();
    place(session, height);
  }
  pages.push(page);

  return pages.map((p, i) => ({
    showHeader: i === 0,
    showCompactHeader: i > 0,
    showStudent: i === 0,
    showTracks: i === 0,
    sessions: p.sessions,
    showScheduleTitle: i === 0,
    showTableHeader: true,
    showSignature: i === pages.length - 1,
  }));
}

export function buildPdfPages(
  sessions: ScheduledSession[],
  options: PdfPageOptions = {},
): PdfPageContent[] {
  const trackCount = options.trackCount ?? 1;
  const totalDescriptionChars = options.totalDescriptionChars ?? 0;
  const firstPageMax = getFirstPageMaxRows(
    trackCount,
    totalDescriptionChars,
    countIntroNoteLines(options.introNote ?? ''),
  );

  if (sessions.length === 0) {
    return [
      {
        showHeader: true,
        showCompactHeader: false,
        showStudent: true,
        showTracks: true,
        sessions: [],
        showScheduleTitle: true,
        showTableHeader: false,
        showSignature: true,
      },
    ];
  }

  const pages: PdfPageContent[] = [];
  let index = 0;
  let isFirst = true;

  while (index < sessions.length) {
    const remaining = sessions.length - index;
    let chunkSize: number;

    if (isFirst) {
      chunkSize = Math.min(firstPageMax, remaining);
    } else {
      const wouldBeLast = remaining <= CONTINUATION_PAGE_ROWS;
      const pageLimit = wouldBeLast ? LAST_PAGE_MAX_ROWS : CONTINUATION_PAGE_ROWS;

      if (remaining <= pageLimit) {
        chunkSize = remaining;
      } else {
        const wouldRemain = remaining - pageLimit;
        chunkSize =
          wouldRemain > 0 && wouldRemain < MIN_TAIL_ROWS
            ? remaining - MIN_TAIL_ROWS
            : pageLimit;
      }
    }

    const chunk = sessions.slice(index, index + chunkSize);
    index += chunkSize;
    const isLast = index >= sessions.length;

    pages.push({
      showHeader: isFirst,
      showCompactHeader: !isFirst && chunk.length > 0,
      showStudent: isFirst,
      showTracks: isFirst,
      sessions: chunk,
      showScheduleTitle: isFirst,
      showTableHeader: true,
      showSignature: isLast,
    });

    isFirst = false;
  }

  return pages;
}
