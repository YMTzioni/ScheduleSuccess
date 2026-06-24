import { addDays, addYears, differenceInCalendarDays, format, isAfter, isBefore, parseISO } from 'date-fns';
import type { EndDateMode, ScheduledSession, TimeSlot } from '../types';
import { TRACKS, getTotalLessonCount } from '../data/tracks';
import { getIsraeliHolidays, isStudyDay } from './holidays';

export const FINAL_EXAM_TITLE = 'מבחן סיום';
export const CERTIFICATE_TITLE = 'חלוקת תעודות';

export type ScheduleQueueItem =
  | { type: 'lesson'; title: string; trackName: string }
  | { type: 'final_exam'; trackName: string }
  | { type: 'certificate'; trackName: string };

export function buildScheduleQueue(trackIds: string[]): ScheduleQueueItem[] {
  const queue: ScheduleQueueItem[] = [];

  for (const trackId of trackIds) {
    const track = TRACKS.find((t) => t.id === trackId);
    if (!track) continue;

    for (const mod of track.modules) {
      for (const lesson of mod.lessons) {
        queue.push({ type: 'lesson', title: lesson, trackName: track.name });
      }
    }

    queue.push({ type: 'final_exam', trackName: track.name });
    queue.push({ type: 'certificate', trackName: track.name });
  }

  return queue;
}

export function getScheduleQueueItemCount(trackIds: string[]): number {
  return buildScheduleQueue(trackIds).length;
}

export function getTrackMilestoneCount(trackIds: string[]): number {
  return trackIds.length * 2;
}

function queueItemToLessonItem(item: ScheduleQueueItem): { title: string; trackName: string } {
  if (item.type === 'lesson') {
    return { title: item.title, trackName: item.trackName };
  }
  if (item.type === 'final_exam') {
    return { title: FINAL_EXAM_TITLE, trackName: item.trackName };
  }
  return { title: CERTIFICATE_TITLE, trackName: item.trackName };
}

function isMilestoneItem(item: ScheduleQueueItem): boolean {
  return item.type === 'final_exam' || item.type === 'certificate';
}

function getWeekKey(date: Date): string {
  return format(addDays(date, -date.getDay()), 'yyyy-MM-dd');
}

function canScheduleTrackOnDate(
  date: Date,
  trackName: string,
  weekTrackMap: Map<string, string>,
  blockUntilAfterWeek: string | null,
  enforceSequentialTracks: boolean,
): boolean {
  if (!enforceSequentialTracks) return true;

  const weekKey = getWeekKey(date);
  const weekTrack = weekTrackMap.get(weekKey);

  if (weekTrack && weekTrack !== trackName) {
    return false;
  }

  if (blockUntilAfterWeek && weekKey <= blockUntilAfterWeek) {
    return false;
  }

  return true;
}

function markWeekTrack(
  date: Date,
  trackName: string,
  weekTrackMap: Map<string, string>,
  enforceSequentialTracks: boolean,
): void {
  if (!enforceSequentialTracks) return;
  weekTrackMap.set(getWeekKey(date), trackName);
}

export interface BuildScheduleParams {
  trackIds: string[];
  startDate: string;
  timeSlots: TimeSlot[];
  endDateMode: EndDateMode;
  manualEndDate?: string;
  minimumPeriodYears?: number;
}

export interface ScheduleResult {
  sessions: ScheduledSession[];
  endDate: string;
  skippedDays: { date: string; reason: string }[];
  totalLessons: number;
  assignedLessons: number;
  fitsCompletely: boolean;
  periodCapacity: number;
  meetingCount: number;
}

function parseMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function getLessonCountForSlot(startTime: string, endTime: string): number {
  const duration = parseMinutes(endTime) - parseMinutes(startTime);
  if (duration <= 0) return 1;
  const count = Math.floor(duration / 60);
  return count > 0 ? count : 1;
}

function groupSessionsByWeek(sessions: ScheduledSession[]): ScheduledSession[][] {
  const groups = new Map<string, ScheduledSession[]>();

  for (const session of sessions) {
    const weekKey = getWeekKey(parseISO(session.date));
    const weekSessions = groups.get(weekKey);
    if (weekSessions) {
      weekSessions.push(session);
    } else {
      groups.set(weekKey, [session]);
    }
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, weekSessions]) => weekSessions);
}

function getValidWeekKeys(
  start: Date,
  end: Date,
  timeSlots: TimeSlot[],
  holidayMap: ReturnType<typeof getIsraeliHolidays>,
): string[] {
  const weekKeys = new Set<string>();
  let current = start;

  while (!isAfter(current, end)) {
    const daySlots = timeSlots.filter((s) => s.dayOfWeek === current.getDay());
    if (daySlots.length > 0 && isStudyDay(current, holidayMap).allowed) {
      weekKeys.add(getWeekKey(current));
    }
    current = addDays(current, 1);
  }

  return Array.from(weekKeys).sort();
}

function collectValidMeetingDates(
  start: Date,
  end: Date,
  timeSlots: TimeSlot[],
  holidayMap: ReturnType<typeof getIsraeliHolidays>,
): { date: string; dayOfWeek: number }[] {
  const meetings: { date: string; dayOfWeek: number }[] = [];
  let current = start;

  while (!isAfter(current, end)) {
    const daySlots = timeSlots.filter((s) => s.dayOfWeek === current.getDay());
    if (daySlots.length > 0 && isStudyDay(current, holidayMap).allowed) {
      meetings.push({
        date: format(current, 'yyyy-MM-dd'),
        dayOfWeek: current.getDay(),
      });
    }
    current = addDays(current, 1);
  }

  return meetings;
}

function pickEvenlySpacedIndices(count: number, total: number): number[] {
  if (count <= 0 || total <= 0) return [];
  if (count === 1) return [total - 1];

  return Array.from({ length: count }, (_, index) =>
    Math.round((index / (count - 1)) * (total - 1)),
  );
}

function spreadSessionsEvenly(
  sessions: ScheduledSession[],
  start: Date,
  end: Date,
  timeSlots: TimeSlot[],
  holidayMap: ReturnType<typeof getIsraeliHolidays>,
): ScheduledSession[] {
  const meetings = collectValidMeetingDates(start, end, timeSlots, holidayMap);
  if (meetings.length < sessions.length) return sessions;

  const indices = pickEvenlySpacedIndices(sessions.length, meetings.length);

  return sessions.map((session, index) => {
    const meeting = meetings[indices[index]];
    return {
      ...session,
      date: meeting.date,
      dayOfWeek: meeting.dayOfWeek,
    };
  });
}

function spreadSequentialSessionsByWeek(
  sessions: ScheduledSession[],
  start: Date,
  end: Date,
  timeSlots: TimeSlot[],
  holidayMap: ReturnType<typeof getIsraeliHolidays>,
): ScheduledSession[] {
  const weekGroups = groupSessionsByWeek(sessions);
  const validWeeks = getValidWeekKeys(start, end, timeSlots, holidayMap);

  if (validWeeks.length < weekGroups.length) return sessions;

  const pickedWeeks = pickEvenlySpacedIndices(weekGroups.length, validWeeks.length).map(
    (index) => validWeeks[index],
  );

  return weekGroups.flatMap((group, index) => {
    const oldWeekKey = getWeekKey(parseISO(group[0].date));
    const dayOffset = differenceInCalendarDays(parseISO(pickedWeeks[index]), parseISO(oldWeekKey));

    return group.map((session) => {
      const newDate = addDays(parseISO(session.date), dayOffset);
      return {
        ...session,
        date: format(newDate, 'yyyy-MM-dd'),
        dayOfWeek: newDate.getDay(),
      };
    });
  });
}

export function getMinimumPeriodEndDate(startDate: string, years: number): string {
  return format(addYears(parseISO(startDate), years), 'yyyy-MM-dd');
}

function spreadSessionsToMinimumPeriod(
  sessions: ScheduledSession[],
  startDate: string,
  minimumYears: number,
  timeSlots: TimeSlot[],
  enforceSequentialTracks: boolean,
): ScheduledSession[] {
  if (sessions.length === 0 || minimumYears <= 0) return sessions;

  const start = parseISO(startDate);
  const minEnd = addYears(start, minimumYears);
  const lastDate = parseISO(sessions[sessions.length - 1].date);
  if (!isBefore(lastDate, minEnd)) return sessions;

  const holidayMap = getIsraeliHolidays(startDate, format(minEnd, 'yyyy-MM-dd'));

  if (enforceSequentialTracks) {
    return spreadSequentialSessionsByWeek(sessions, start, minEnd, timeSlots, holidayMap);
  }

  return spreadSessionsEvenly(sessions, start, minEnd, timeSlots, holidayMap);
}

const MAX_SCHEDULE_DAYS = 365 * 4;

export function countPeriodCapacity(
  startDate: string,
  endDate: string,
  timeSlots: TimeSlot[],
): { lessonCapacity: number; meetingCount: number } {
  if (!startDate || !endDate || !timeSlots.length) {
    return { lessonCapacity: 0, meetingCount: 0 };
  }

  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (isAfter(start, end)) {
    return { lessonCapacity: 0, meetingCount: 0 };
  }

  const holidayMap = getIsraeliHolidays(startDate, endDate);
  let lessonCapacity = 0;
  let meetingCount = 0;
  let current = start;

  while (!isAfter(current, end)) {
    const daySlots = timeSlots.filter((s) => s.dayOfWeek === current.getDay());

    if (daySlots.length > 0) {
      const { allowed } = isStudyDay(current, holidayMap);
      if (allowed) {
        for (const slot of daySlots) {
          lessonCapacity += getLessonCountForSlot(slot.startTime, slot.endTime);
          meetingCount += 1;
        }
      }
    }

    current = addDays(current, 1);
  }

  return { lessonCapacity, meetingCount };
}

export function buildSchedule({
  trackIds,
  startDate,
  timeSlots,
  endDateMode,
  manualEndDate,
  minimumPeriodYears = 0,
}: BuildScheduleParams): ScheduleResult {
  const empty: ScheduleResult = {
    sessions: [],
    endDate: '',
    skippedDays: [],
    totalLessons: 0,
    assignedLessons: 0,
    fitsCompletely: false,
    periodCapacity: 0,
    meetingCount: 0,
  };

  if (!trackIds.length || !timeSlots.length || !startDate) {
    return empty;
  }

  const totalLessons = getTotalLessonCount(trackIds);
  const scheduleQueue = buildScheduleQueue(trackIds);
  const totalScheduleItems = scheduleQueue.length;
  const enforceSequentialTracks = trackIds.length > 1;

  if (totalScheduleItems === 0) {
    return { ...empty, endDate: startDate, totalLessons: 0, fitsCompletely: true };
  }

  if (totalLessons === 0) {
    return { ...empty, endDate: startDate, totalLessons: 0, fitsCompletely: true };
  }

  const isManual = endDateMode === 'manual';
  if (isManual && !manualEndDate) {
    return { ...empty, totalLessons };
  }

  const manualEnd = isManual && manualEndDate ? parseISO(manualEndDate) : null;
  const searchEnd = isManual
    ? manualEndDate!
    : format(addYears(parseISO(startDate), 4), 'yyyy-MM-dd');

  const holidayMap = getIsraeliHolidays(startDate, searchEnd);
  const { lessonCapacity: periodCapacity, meetingCount } = isManual
    ? countPeriodCapacity(startDate, manualEndDate!, timeSlots)
    : { lessonCapacity: 0, meetingCount: 0 };

  const sessions: ScheduledSession[] = [];
  const skippedDays: { date: string; reason: string }[] = [];
  const weekTrackMap = new Map<string, string>();
  let blockUntilAfterWeek: string | null = null;
  let queueIndex = 0;
  let current = parseISO(startDate);

  for (let day = 0; day < MAX_SCHEDULE_DAYS; day += 1) {
    if (!isManual && queueIndex >= totalScheduleItems) break;
    if (isManual && manualEnd && isAfter(current, manualEnd)) break;

    const dateStr = format(current, 'yyyy-MM-dd');
    const dayOfWeek = current.getDay();
    const daySlots = timeSlots.filter((s) => s.dayOfWeek === dayOfWeek);

    if (daySlots.length > 0) {
      const { allowed, reason } = isStudyDay(current, holidayMap);

      if (!allowed && reason) {
        skippedDays.push({ date: dateStr, reason });
      } else {
        for (const slot of daySlots) {
          if (queueIndex >= totalScheduleItems) break;

          const currentItem = scheduleQueue[queueIndex];
          const trackName = currentItem.trackName;

          if (
            !canScheduleTrackOnDate(
              current,
              trackName,
              weekTrackMap,
              blockUntilAfterWeek,
              enforceSequentialTracks,
            )
          ) {
            continue;
          }

          if (isMilestoneItem(currentItem)) {
            sessions.push({
              date: dateStr,
              dayOfWeek,
              startTime: slot.startTime,
              endTime: slot.endTime,
              lessonItems: [queueItemToLessonItem(currentItem)],
            });
            markWeekTrack(current, trackName, weekTrackMap, enforceSequentialTracks);

            if (currentItem.type === 'certificate' && enforceSequentialTracks) {
              blockUntilAfterWeek = getWeekKey(current);
            }

            queueIndex += 1;
            continue;
          }

          const maxLessonsInSlot = getLessonCountForSlot(slot.startTime, slot.endTime);
          const lessonItems: { title: string; trackName: string }[] = [];

          for (let i = 0; i < maxLessonsInSlot && queueIndex < totalScheduleItems; i += 1) {
            const item = scheduleQueue[queueIndex];
            if (isMilestoneItem(item)) break;
            if (lessonItems.length > 0 && lessonItems[0].trackName !== item.trackName) break;

            lessonItems.push(queueItemToLessonItem(item));
            queueIndex += 1;
          }

          if (lessonItems.length > 0) {
            sessions.push({
              date: dateStr,
              dayOfWeek,
              startTime: slot.startTime,
              endTime: slot.endTime,
              lessonItems,
            });
            markWeekTrack(current, lessonItems[0].trackName, weekTrackMap, enforceSequentialTracks);

            if (blockUntilAfterWeek && getWeekKey(current) > blockUntilAfterWeek) {
              blockUntilAfterWeek = null;
            }
          }
        }
      }
    }

    if (!isManual && queueIndex >= totalScheduleItems) break;
    current = addDays(current, 1);
  }

  let finalSessions = sessions;
  if (!isManual && minimumPeriodYears > 0) {
    finalSessions = spreadSessionsToMinimumPeriod(
      sessions,
      startDate,
      minimumPeriodYears,
      timeSlots,
      enforceSequentialTracks,
    );
  }

  let endDate: string;
  if (isManual && manualEndDate) {
    endDate = manualEndDate;
  } else {
    const naturalEnd =
      finalSessions.length > 0 ? finalSessions[finalSessions.length - 1].date : startDate;
    if (minimumPeriodYears > 0) {
      const minEnd = getMinimumPeriodEndDate(startDate, minimumPeriodYears);
      endDate = naturalEnd > minEnd ? naturalEnd : minEnd;
    } else {
      endDate = naturalEnd;
    }
  }

  return {
    sessions: finalSessions,
    endDate,
    skippedDays,
    totalLessons,
    assignedLessons: queueIndex,
    fitsCompletely: queueIndex >= totalScheduleItems,
    periodCapacity: isManual ? periodCapacity : queueIndex,
    meetingCount: isManual ? meetingCount : finalSessions.length,
  };
}

export function countScheduledLessons(sessions: ScheduledSession[]): number {
  return sessions.reduce((sum, session) => {
    const lessonCount = session.lessonItems.filter(
      (item) => item.title !== FINAL_EXAM_TITLE && item.title !== CERTIFICATE_TITLE,
    ).length;
    return sum + lessonCount;
  }, 0);
}
