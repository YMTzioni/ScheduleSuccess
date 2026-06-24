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
}

function getFirstPageMaxRows(trackCount: number, totalDescriptionChars: number): number {
  let rows = 11 - trackCount * 2;
  if (totalDescriptionChars > 350) rows -= 2;
  if (totalDescriptionChars > 700) rows -= 2;
  if (totalDescriptionChars > 1200) rows -= 2;
  return Math.max(5, rows);
}

const CONTINUATION_PAGE_ROWS = 14;
const LAST_PAGE_MAX_ROWS = 12;
const MIN_TAIL_ROWS = 3;

export function buildPdfPages(
  sessions: ScheduledSession[],
  options: PdfPageOptions = {},
): PdfPageContent[] {
  const trackCount = options.trackCount ?? 1;
  const totalDescriptionChars = options.totalDescriptionChars ?? 0;
  const firstPageMax = getFirstPageMaxRows(trackCount, totalDescriptionChars);

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
