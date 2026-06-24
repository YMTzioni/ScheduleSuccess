import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { TimeSlot } from '../types';
import { getTotalLessonCount } from '../data/tracks';
import { countPeriodCapacity } from './scheduleGenerator';

export interface PeriodStats {
  totalLessons: number;
  daysInPeriod: number;
  weeks: number;
  lessonsPerWeekNeeded: number;
}

export interface DistributionOption {
  id: string;
  sessionsPerWeek: number;
  hoursPerSession: number;
  lessonsPerWeek: number;
  estimatedCapacity: number;
  fits: boolean;
  recommendedDays: number[];
  label: string;
  description: string;
}

const DAY_PATTERNS: Record<number, number[]> = {
  1: [0],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
};

function parseMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function toTime(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function addHoursToTime(startTime: string, hours: number): string {
  return toTime(parseMinutes(startTime) + hours * 60);
}

export function getPeriodStats(
  trackIds: string[],
  startDate: string,
  endDate: string,
): PeriodStats | null {
  if (!trackIds.length || !startDate || !endDate) return null;

  const totalLessons = getTotalLessonCount(trackIds);
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (end < start || totalLessons === 0) return null;

  const daysInPeriod = differenceInCalendarDays(end, start) + 1;
  const weeks = Math.max(1, Math.ceil(daysInPeriod / 7));
  const lessonsPerWeekNeeded = Math.ceil(totalLessons / weeks);

  return { totalLessons, daysInPeriod, weeks, lessonsPerWeekNeeded };
}

function estimateCapacity(
  startDate: string,
  endDate: string,
  hoursPerSession: number,
  days: number[],
): number {
  const slots: TimeSlot[] = days.map((dayOfWeek) => ({
    dayOfWeek,
    startTime: '09:00',
    endTime: addHoursToTime('09:00', hoursPerSession),
  }));
  return countPeriodCapacity(startDate, endDate, slots).lessonCapacity;
}

export function getDistributionOptions(
  trackIds: string[],
  startDate: string,
  endDate: string,
): DistributionOption[] {
  const stats = getPeriodStats(trackIds, startDate, endDate);
  if (!stats) return [];

  const { totalLessons, lessonsPerWeekNeeded } = stats;
  const options: DistributionOption[] = [];

  for (let sessions = 1; sessions <= 5; sessions += 1) {
    const recommendedDays = DAY_PATTERNS[sessions] ?? DAY_PATTERNS[2];

    for (let hours = 2; hours <= 8; hours += 1) {
      const lessonsPerWeek = sessions * hours;
      const estimatedCapacity = estimateCapacity(
        startDate,
        endDate,
        hours,
        recommendedDays,
      );

      options.push({
        id: `${sessions}x${hours}`,
        sessionsPerWeek: sessions,
        hoursPerSession: hours,
        lessonsPerWeek,
        estimatedCapacity,
        fits: estimatedCapacity >= totalLessons,
        recommendedDays,
        label: `${sessions} פעמים בשבוע × ${hours} שעות`,
        description: `${lessonsPerWeek} שיעורים בשבוע · קיבולת ~${estimatedCapacity} שיעורים בתקופה`,
      });
    }
  }

  return options
    .sort((a, b) => {
      if (a.fits !== b.fits) return a.fits ? -1 : 1;
      const aDiff = Math.abs(a.lessonsPerWeek - lessonsPerWeekNeeded);
      const bDiff = Math.abs(b.lessonsPerWeek - lessonsPerWeekNeeded);
      if (aDiff !== bDiff) return aDiff - bDiff;
      return a.sessionsPerWeek - b.sessionsPerWeek;
    })
    .slice(0, 6);
}

export function buildTimeSlotsFromDistribution(
  days: number[],
  hoursPerSession: number,
  startTime = '09:00',
): TimeSlot[] {
  return days.map((dayOfWeek) => ({
    dayOfWeek,
    startTime,
    endTime: addHoursToTime(startTime, hoursPerSession),
  }));
}

export function getDistributionSummary(
  stats: PeriodStats,
  options: DistributionOption[],
): { status: 'ok' | 'short' | 'info'; title: string; messages: string[] } {
  const fitting = options.filter((o) => o.fits);
  const best = fitting[0] ?? options[0];

  if (fitting.length > 0 && best) {
    return {
      status: 'ok',
      title: 'ניתן להשלים את כל המסלולים בתקופה',
      messages: [
        `נדרשים ${stats.totalLessons} שיעורים ב-${stats.weeks} שבועות (~${stats.lessonsPerWeekNeeded} שיעורים בשבוע).`,
        `המלצה מובילה: ${best.label} (${best.description}).`,
        'בחר חלוקה למטה ולאחר מכן את ימי הלימוד.',
      ],
    };
  }

  if (best) {
    return {
      status: 'short',
      title: 'התקופה קצרה יחסית לכמות השיעורים',
      messages: [
        `נדרשים ${stats.totalLessons} שיעורים ב-${stats.weeks} שבועות (~${stats.lessonsPerWeekNeeded} שיעורים בשבוע).`,
        `האפשרות הקרובה ביותר: ${best.label} — קיבולת ~${best.estimatedCapacity} שיעורים (חסרים ${stats.totalLessons - best.estimatedCapacity}).`,
        'הארך את תאריך הסיום, או עבור למצב אוטומטי.',
      ],
    };
  }

  return {
    status: 'info',
    title: 'בחר חלוקת לימודים',
    messages: ['הגדר תאריכים ומסלולים כדי לקבל המלצות.'],
  };
}
