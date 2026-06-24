import { addYears, format, parseISO } from 'date-fns';
import type { EndDateMode, TimeSlot } from '../types';
import { buildTimeSlotsFromDistribution } from './distributionPlanner';
import { getLessonCountForSlot } from './scheduleGenerator';

export type ScheduleTemplateId = 'custom' | 'michael';

export interface ScheduleTemplate {
  id: ScheduleTemplateId;
  name: string;
  description: string;
  sessionsPerWeek: number;
  hoursPerSession: number;
  studyDays: number[];
  minHoursPerSession: number;
  endDateMode: EndDateMode;
  periodYears: number;
}

export const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  {
    id: 'custom',
    name: 'מותאם אישית',
    description: 'בחירה חופשית של תאריכים, ימים ושעות לימוד',
    sessionsPerWeek: 0,
    hoursPerSession: 0,
    studyDays: [],
    minHoursPerSession: 1,
    endDateMode: 'auto',
    periodYears: 0,
  },
  {
    id: 'michael',
    name: 'מיכאל',
    description: '2 ימי לימוד בשבוע (לבחירתך) · 8 שעות ביום משעת התחלה · תאריך סיום אוטומטי',
    sessionsPerWeek: 2,
    hoursPerSession: 8,
    studyDays: [0, 3],
    minHoursPerSession: 8,
    endDateMode: 'auto',
    periodYears: 0,
  },
];

export function getScheduleTemplate(id: ScheduleTemplateId): ScheduleTemplate {
  return SCHEDULE_TEMPLATES.find((t) => t.id === id) ?? SCHEDULE_TEMPLATES[0];
}

export function getTemplateEndDate(startDate: string, years: number): string {
  return format(addYears(parseISO(startDate), years), 'yyyy-MM-dd');
}

export function buildTemplateTimeSlots(template: ScheduleTemplate): TimeSlot[] {
  if (template.id === 'custom') return [];
  return buildTimeSlotsFromDistribution(
    template.studyDays,
    template.hoursPerSession,
    '09:00',
  );
}

export function slotMeetsMinHours(slot: TimeSlot, minHours: number): boolean {
  return getLessonCountForSlot(slot.startTime, slot.endTime) >= minHours;
}
