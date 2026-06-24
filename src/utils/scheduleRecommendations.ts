import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { EndDateMode, TimeSlot } from '../types';
import { getTotalLessonCount } from '../data/tracks';
import { getLessonCountForSlot } from './scheduleGenerator';

export interface ScheduleFitStatus {
  status: 'ok' | 'short';
  title: string;
  messages: string[];
}

export function getScheduleFitStatus({
  trackIds,
  startDate,
  manualEndDate,
  timeSlots,
  endDateMode,
  assignedLessons,
}: {
  trackIds: string[];
  startDate: string;
  manualEndDate: string;
  timeSlots: TimeSlot[];
  endDateMode: EndDateMode;
  assignedLessons: number;
}): ScheduleFitStatus | null {
  if (endDateMode !== 'manual' || !startDate || !manualEndDate || !timeSlots.length) {
    return null;
  }

  const totalLessons = getTotalLessonCount(trackIds);
  if (!totalLessons) return null;

  const start = parseISO(startDate);
  const end = parseISO(manualEndDate);
  if (end < start) return null;

  if (assignedLessons >= totalLessons) {
    return {
      status: 'ok',
      title: 'הלוז שהוחל מתאים לתקופה',
      messages: [`שובצו כל ${totalLessons} השיעורים בהצלחה.`],
    };
  }

  return {
    status: 'short',
    title: `שובצו ${assignedLessons} מתוך ${totalLessons} שיעורים`,
    messages: [
      `חסרים עוד ${totalLessons - assignedLessons} שיעורים — נסה חלוקה אחרת או הארך את התקופה.`,
    ],
  };
}

export function formatSlotSummary(timeSlots: TimeSlot[]): string {
  return timeSlots
    .map((s) => `יום ${s.dayOfWeek} (${getLessonCountForSlot(s.startTime, s.endTime)} שעות)`)
    .join(', ');
}

export function getWeeksInPeriod(startDate: string, endDate: string): number {
  const days = differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1;
  return Math.max(1, Math.ceil(days / 7));
}
