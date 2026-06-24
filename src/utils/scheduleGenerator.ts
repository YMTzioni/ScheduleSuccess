import { addDays, addYears, format, isAfter, isBefore, parseISO } from 'date-fns';
import type { EndDateMode, ScheduledSession, TimeSlot } from '../types';
import { TRACKS, getTotalLessonCount } from '../data/tracks';
import { getIsraeliHolidays, isStudyDay } from './holidays';

export const FINAL_EXAM_TITLE = 'מבחן סיום';
export const CERTIFICATE_TITLE = 'חלוקת תעודות';
export const PRACTICE_TITLE = 'תרגול חומר';

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

function isMilestoneTitle(title: string): boolean {
  return title === FINAL_EXAM_TITLE || title === CERTIFICATE_TITLE;
}

function isPracticeTitle(title: string): boolean {
  return title === PRACTICE_TITLE;
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

interface MeetingSlot {
  date: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

function collectValidMeetingSlots(
  start: Date,
  end: Date,
  timeSlots: TimeSlot[],
  holidayMap: ReturnType<typeof getIsraeliHolidays>,
): MeetingSlot[] {
  const meetings: MeetingSlot[] = [];
  let current = start;

  while (!isAfter(current, end)) {
    const daySlots = timeSlots.filter((s) => s.dayOfWeek === current.getDay());
    if (daySlots.length > 0 && isStudyDay(current, holidayMap).allowed) {
      for (const slot of daySlots) {
        meetings.push({
          date: format(current, 'yyyy-MM-dd'),
          dayOfWeek: current.getDay(),
          startTime: slot.startTime,
          endTime: slot.endTime,
        });
      }
    }
    current = addDays(current, 1);
  }

  return meetings;
}

function remapSession(session: ScheduledSession, slot: MeetingSlot): ScheduledSession {
  return {
    ...session,
    date: slot.date,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
  };
}

function separateLessonAndMilestoneSessions(sessions: ScheduledSession[]): {
  lessonSessions: ScheduledSession[];
  milestoneSessions: ScheduledSession[];
} {
  const lessonSessions: ScheduledSession[] = [];
  const milestoneSessions: ScheduledSession[] = [];

  for (const session of sessions) {
    if (session.lessonItems.length === 1 && isMilestoneTitle(session.lessonItems[0].title)) {
      milestoneSessions.push(session);
    } else {
      lessonSessions.push(session);
    }
  }

  return { lessonSessions, milestoneSessions };
}

function createPracticeSession(slot: MeetingSlot, trackName: string): ScheduledSession {
  return {
    date: slot.date,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    lessonItems: [{ title: PRACTICE_TITLE, trackName }],
  };
}

function allocateTrackMeetings(
  trackSessions: ScheduledSession[],
  meetingSlots: MeetingSlot[],
): ScheduledSession[] {
  if (meetingSlots.length === 0 || trackSessions.length === 0) return trackSessions;

  const { lessonSessions, milestoneSessions } = separateLessonAndMilestoneSessions(trackSessions);
  const trackName = trackSessions[0].lessonItems[0].trackName;
  const practiceCount = Math.max(
    0,
    meetingSlots.length - lessonSessions.length - milestoneSessions.length,
  );

  if (lessonSessions.length === 0 && milestoneSessions.length === 0) return trackSessions;

  const result: ScheduledSession[] = [];
  let slotIndex = 0;

  for (const session of lessonSessions) {
    if (slotIndex >= meetingSlots.length) break;
    result.push(remapSession(session, meetingSlots[slotIndex]));
    slotIndex += 1;
  }

  for (let i = 0; i < practiceCount; i += 1) {
    if (slotIndex >= meetingSlots.length) break;
    result.push(createPracticeSession(meetingSlots[slotIndex], trackName));
    slotIndex += 1;
  }

  for (const session of milestoneSessions) {
    if (slotIndex >= meetingSlots.length) break;
    result.push(remapSession(session, meetingSlots[slotIndex]));
    slotIndex += 1;
  }

  return result;
}

function partitionTrackSessions(
  sessions: ScheduledSession[],
): { trackName: string; sessions: ScheduledSession[] }[] {
  const tracks: { trackName: string; sessions: ScheduledSession[] }[] = [];

  for (const session of sessions) {
    const trackName = session.lessonItems[0].trackName;
    const last = tracks[tracks.length - 1];

    if (last && last.trackName === trackName) {
      last.sessions.push(session);
    } else {
      tracks.push({ trackName, sessions: [session] });
    }
  }

  return tracks;
}

function splitWeeksAmongTracks(weeks: string[], trackCount: number): string[][] {
  const result = Array.from({ length: trackCount }, () => [] as string[]);
  const baseWeeks = Math.floor(weeks.length / trackCount);
  let remainder = weeks.length % trackCount;
  let offset = 0;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    const trackWeekCount = baseWeeks + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    result[trackIndex] = weeks.slice(offset, offset + trackWeekCount);
    offset += trackWeekCount;
  }

  return result;
}

function padSessionsWithPracticeDays(
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
  const allMeetings = collectValidMeetingSlots(start, minEnd, timeSlots, holidayMap);
  if (allMeetings.length <= sessions.length) {
    return sessions.map((session, index) => remapSession(session, allMeetings[index] ?? allMeetings[allMeetings.length - 1]));
  }

  const trackPartitions = partitionTrackSessions(sessions);

  if (!enforceSequentialTracks || trackPartitions.length === 1) {
    return allocateTrackMeetings(sessions, allMeetings);
  }

  const validWeeks = getValidWeekKeys(start, minEnd, timeSlots, holidayMap);
  const weeksPerTrack = splitWeeksAmongTracks(validWeeks, trackPartitions.length);

  return trackPartitions.flatMap((track, index) => {
    const weekSet = new Set(weeksPerTrack[index]);
    const trackMeetings = allMeetings.filter((meeting) =>
      weekSet.has(getWeekKey(parseISO(meeting.date))),
    );
    return allocateTrackMeetings(track.sessions, trackMeetings);
  });
}

export function getMinimumPeriodEndDate(startDate: string, years: number): string {
  return format(addYears(parseISO(startDate), years), 'yyyy-MM-dd');
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
    finalSessions = padSessionsWithPracticeDays(
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
      (item) =>
        !isMilestoneTitle(item.title) && !isPracticeTitle(item.title),
    ).length;
    return sum + lessonCount;
  }, 0);
}
