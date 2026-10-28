export interface CourseModule {
  title: string;
  lessons: string[];
}

export interface Track {
  id: string;
  name: string;
  subtitle?: string;
  description: string;
  modules: CourseModule[];
}

export interface TimeSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

// auto: the end date follows from the lessons.
// manual: the period ends on a chosen date; what does not fit is left out.
// fixed: the period is fixed and every lesson of every track is spread over
// it, however many lessons that puts in one meeting.
export type EndDateMode = 'auto' | 'manual' | 'fixed';

export type ScheduleTemplateId = 'custom' | 'michael';

export interface LessonItem {
  title: string;
  trackName: string;
}

export interface ScheduledSession {
  date: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  lessonItems: LessonItem[];
}

export interface StudentDocument {
  fullName: string;
  idNumber: string;
  trackIds: string[];
  amountNis: number;
  introNote: string;
  startDate: string;
  endDate: string;
  timeSlots: TimeSlot[];
  sessions: ScheduledSession[];
  documentDate: string;
  totalLessons: number;
}

export const DAY_NAMES = [
  'ראשון',
  'שני',
  'שלישי',
  'רביעי',
  'חמישי',
  'שישי',
  'שבת',
] as const;

export const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו'] as const;

export function formatDayLetter(dayOfWeek: number): string {
  if (dayOfWeek === 6) return 'שבת';
  return `יום ${DAY_LETTERS[dayOfWeek]}`;
}
