import { HebrewCalendar, flags } from '@hebcal/core';
import { format, parseISO } from 'date-fns';

const NO_STUDY_CATEGORIES = new Set([
  'yomtov',
  'holiday',
  'modern',
  'fast',
]);

const NO_STUDY_KEYWORDS = [
  'ערב',
  'Erev',
  'Chol ha-Moed',
  'חול המועד',
];

export interface HolidayInfo {
  date: string;
  title: string;
}

function isNoStudyEvent(title: string, eventFlags: number): boolean {
  if (eventFlags & flags.CHAG) return true;
  if (eventFlags & flags.CHOL_HAMOED) return true;

  const lower = title.toLowerCase();
  if (NO_STUDY_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) {
    return true;
  }

  const israeliHolidays = [
    'yom kippur',
    'rosh hashana',
    'pesach',
    'sukkot',
    'shavuot',
    'purim',
    'yom haatzmaut',
    'yom hazikaron',
    'lag baomer',
    'tu bishvat',
    'hanukkah',
    'chanukah',
  ];
  return israeliHolidays.some((h) => lower.includes(h));
}

export function getIsraeliHolidays(
  startDate: string,
  endDate: string,
): Map<string, HolidayInfo[]> {
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  const events = HebrewCalendar.calendar({
    start,
    end,
    il: true,
    candlelighting: false,
    sedrot: false,
    omer: false,
  });

  const holidayMap = new Map<string, HolidayInfo[]>();

  for (const event of events) {
    const categories = event.getCategories();
    const isRelevant =
      categories.some((c) => NO_STUDY_CATEGORIES.has(c)) ||
      isNoStudyEvent(event.basename(), event.getFlags());

    if (!isRelevant) continue;

    const dateKey = format(event.getDate().greg(), 'yyyy-MM-dd');
    const existing = holidayMap.get(dateKey) ?? [];
    existing.push({ date: dateKey, title: event.render('he') });
    holidayMap.set(dateKey, existing);
  }

  return holidayMap;
}

export function isStudyDay(
  date: Date,
  holidayMap: Map<string, HolidayInfo[]>,
): { allowed: boolean; reason?: string } {
  const day = date.getDay();
  if (day === 6) {
    return { allowed: false, reason: 'שבת' };
  }

  const dateKey = format(date, 'yyyy-MM-dd');
  const holidays = holidayMap.get(dateKey);
  if (holidays && holidays.length > 0) {
    return {
      allowed: false,
      reason: holidays.map((h) => h.title).join(', '),
    };
  }

  return { allowed: true };
}
