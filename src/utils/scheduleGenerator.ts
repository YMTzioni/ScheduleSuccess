import { addDays, addYears, format, isAfter, parseISO } from 'date-fns';
import type { EndDateMode, LessonItem, ScheduledSession, TimeSlot } from '../types';
import { TRACKS, getTotalLessonCount } from '../data/tracks';
import {
  DEFAULT_HOLIDAY_POLICY,
  getIsraeliHolidays,
  isStudyDay,
  type HolidayPolicy,
} from './holidays';

export const FINAL_EXAM_TITLE = 'מבחן סיום';
export const CERTIFICATE_TITLE = 'חלוקת תעודות';
export const PRACTICE_TITLE = 'תרגול';
export const PROJECT_BUILDING_TITLE = 'בניית פרויקטים';
export const PROJECT_PRESENTATION_TITLE = 'הצגת פרויקטים';
const PRACTICE_EVERY_N_MEETINGS = 4;
const MAX_PROJECT_BUILDING_SESSIONS = 5;
const MAX_PROJECT_PRESENTATION_SESSIONS = 1;

function getTrackTeachingEndDate(sessions: ScheduledSession[], trackName: string): string | null {
  let lastDate: string | null = null;

  for (const session of sessions) {
    if (session.lessonItems[0]?.trackName !== trackName) continue;
    const title = session.lessonItems[0]?.title ?? '';
    if (isMilestoneTitle(title) || isSupplementaryTitle(title)) continue;
    lastDate = session.date;
  }

  return lastDate;
}

function getMichaelClosingPeriodEnd(
  teachingEndDate: string,
  isLastTrack: boolean,
  minEndDate: Date | null,
): Date {
  const teachingEnd = parseISO(teachingEndDate);
  if (!isLastTrack || !minEndDate) {
    return addDays(teachingEnd, 120);
  }
  return isAfter(teachingEnd, minEndDate) ? addDays(teachingEnd, 90) : minEndDate;
}

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

function splitQueueByTrack(queue: ScheduleQueueItem[]): ScheduleQueueItem[][] {
  const segments: ScheduleQueueItem[][] = [];
  let current: ScheduleQueueItem[] = [];

  for (const item of queue) {
    if (current.length > 0 && current[0].trackName !== item.trackName) {
      segments.push(current);
      current = [];
    }
    current.push(item);
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
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

function isSupplementaryTitle(title: string): boolean {
  return title === PROJECT_BUILDING_TITLE || title === PROJECT_PRESENTATION_TITLE;
}

function pickSpacedMeetingIndices(poolLength: number, desiredCount: number): number[] {
  if (poolLength <= 0 || desiredCount <= 0) return [];
  if (desiredCount === 1) return [poolLength - 1];

  const picked: number[] = [];
  const idealStep = (poolLength - 1) / (desiredCount - 1);

  for (let i = 0; i < desiredCount; i += 1) {
    let index = Math.round(i * idealStep);
    if (picked.length > 0 && index - picked[picked.length - 1] < 2) {
      index = picked[picked.length - 1] + 2;
    }
    if (index >= poolLength) break;
    picked.push(index);
  }

  return picked;
}

function scheduleMichaelTrackClosing(
  sessions: ScheduledSession[],
  trackName: string,
  segmentDeferred: ScheduleQueueItem[],
  periodStart: Date,
  timeSlots: TimeSlot[],
  holidayMap: ReturnType<typeof getIsraeliHolidays>,
  isLastTrack: boolean,
  minEndDate: Date | null,
  hardEnd: Date | null,
): string | null {
  const teachingEndDate = getTrackTeachingEndDate(sessions, trackName);
  if (!teachingEndDate) return null;

  const usedDates = new Set(
    sessions
      .filter((session) => session.lessonItems[0]?.trackName === trackName)
      .map((session) => session.date),
  );
  const orderedMilestones = [...segmentDeferred].sort((a, b) => {
    if (a.type === 'final_exam' && b.type === 'certificate') return -1;
    if (a.type === 'certificate' && b.type === 'final_exam') return 1;
    return 0;
  });
  const milestoneCount = orderedMilestones.length;
  const wantsPresentation = MAX_PROJECT_PRESENTATION_SESSIONS > 0;
  const tailCount = milestoneCount + (wantsPresentation ? 1 : 0);

  // A chosen end date is a wall: closing meetings that do not fit before it
  // are left out (the schedule then reports it is incomplete), never placed
  // after it.
  let periodEnd = getMichaelClosingPeriodEnd(teachingEndDate, isLastTrack, minEndDate);
  if (hardEnd && isAfter(periodEnd, hardEnd)) periodEnd = hardEnd;
  let allMeetings = collectValidMeetingSlots(periodStart, periodEnd, timeSlots, holidayMap);
  let forward = allMeetings.filter(
    (slot) => slot.date > teachingEndDate && !usedDates.has(slot.date),
  );

  if (forward.length < tailCount && !hardEnd) {
    periodEnd = addDays(periodEnd, 365);
    allMeetings = collectValidMeetingSlots(periodStart, periodEnd, timeSlots, holidayMap);
    forward = allMeetings.filter(
      (slot) => slot.date > teachingEndDate && !usedDates.has(slot.date),
    );
  }

  if (forward.length < tailCount) return null;

  const tailSlots = forward.slice(-tailCount);
  const buildingPool = forward.slice(0, forward.length - tailCount);
  const buildingSlotsCount = Math.min(
    MAX_PROJECT_BUILDING_SESSIONS,
    Math.max(1, buildingPool.length),
  );

  if (buildingPool.length > 0) {
    const buildingIndices = pickSpacedMeetingIndices(buildingPool.length, buildingSlotsCount);
    for (const index of buildingIndices) {
      const slot = buildingPool[index];
      sessions.push({
        date: slot.date,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        lessonItems: [{ title: PROJECT_BUILDING_TITLE, trackName }],
      });
    }
  }

  if (wantsPresentation) {
    const presentationSlot = tailSlots[tailSlots.length - tailCount];
    sessions.push({
      date: presentationSlot.date,
      dayOfWeek: presentationSlot.dayOfWeek,
      startTime: presentationSlot.startTime,
      endTime: presentationSlot.endTime,
      lessonItems: [{ title: PROJECT_PRESENTATION_TITLE, trackName }],
    });
  }

  const milestoneSlots = tailSlots.slice(-milestoneCount);
  orderedMilestones.forEach((item, index) => {
    const slot = milestoneSlots[index];
    if (!slot) return;

    sessions.push({
      date: slot.date,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      lessonItems: [queueItemToLessonItem(item)],
    });
  });

  const certSlot = milestoneSlots[milestoneCount - 1];
  return certSlot?.date ?? null;
}

function getWeekKey(date: Date): string {
  return format(addDays(date, -date.getDay()), 'yyyy-MM-dd');
}

function hasOtherTrackOnDate(
  sessions: ScheduledSession[],
  dateStr: string,
  trackName: string,
): boolean {
  return sessions.some(
    (session) =>
      session.date === dateStr && session.lessonItems[0]?.trackName !== trackName,
  );
}

function canScheduleTrackOnDate(
  date: Date,
  dateStr: string,
  trackName: string,
  sessions: ScheduledSession[],
  weekTrackMap: Map<string, string>,
  blockUntilAfterWeek: string | null,
  enforceSequentialTracks: boolean,
): boolean {
  if (!enforceSequentialTracks) return true;

  if (hasOtherTrackOnDate(sessions, dateStr, trackName)) {
    return false;
  }

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
  structuredTrackFlow?: boolean;
  holidayPolicy?: HolidayPolicy;
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
  // Fixed-period mode only: the most lessons placed in a single meeting.
  maxLessonsPerMeeting?: number;
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

// Every day in the period that has a chosen time slot but no lessons because
// of a holiday or a day off — the whole period, closing meetings included.
function listSkippedStudyDays(
  startDate: string,
  endDate: string,
  timeSlots: TimeSlot[],
  holidayMap: ReturnType<typeof getIsraeliHolidays>,
): { date: string; reason: string }[] {
  const skipped: { date: string; reason: string }[] = [];
  if (!startDate || !endDate) return skipped;
  const end = parseISO(endDate);
  for (let day = parseISO(startDate); !isAfter(day, end); day = addDays(day, 1)) {
    if (!timeSlots.some((s) => s.dayOfWeek === day.getDay())) continue;
    const { allowed, reason } = isStudyDay(day, holidayMap);
    if (!allowed && reason) skipped.push({ date: format(day, 'yyyy-MM-dd'), reason });
  }
  return skipped;
}

function sortScheduledSessions(sessions: ScheduledSession[]): ScheduledSession[] {
  return [...sessions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
  );
}

function bumpTrackMeeting(trackMeetingCounts: Map<string, number>, trackName: string): number {
  const next = (trackMeetingCounts.get(trackName) ?? 0) + 1;
  trackMeetingCounts.set(trackName, next);
  return next;
}

function wasLastTrackSessionPractice(
  sessions: ScheduledSession[],
  trackName: string,
): boolean {
  for (let i = sessions.length - 1; i >= 0; i -= 1) {
    const session = sessions[i];
    const name = session.lessonItems[0]?.trackName;
    if (name !== trackName) continue;
    return (
      session.lessonItems.length === 1 && isPracticeTitle(session.lessonItems[0].title)
    );
  }
  return false;
}

function shouldSchedulePracticeMeeting(
  sessions: ScheduledSession[],
  trackName: string,
  meetingNumber: number,
): boolean {
  if (meetingNumber % PRACTICE_EVERY_N_MEETINGS !== 0) return false;
  return !wasLastTrackSessionPractice(sessions, trackName);
}

function schedulePracticeSession(
  sessions: ScheduledSession[],
  dateStr: string,
  dayOfWeek: number,
  slot: TimeSlot,
  trackName: string,
  current: Date,
  weekTrackMap: Map<string, string>,
  enforceSequentialTracks: boolean,
): void {
  sessions.push({
    date: dateStr,
    dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    lessonItems: [{ title: PRACTICE_TITLE, trackName }],
  });
  markWeekTrack(current, trackName, weekTrackMap, enforceSequentialTracks);
}

function finalizeMichaelTrackSegment(
  sessions: ScheduledSession[],
  trackName: string,
  segmentDeferred: ScheduleQueueItem[],
  periodStart: Date,
  timeSlots: TimeSlot[],
  holidayMap: ReturnType<typeof getIsraeliHolidays>,
  isLastTrack: boolean,
  minEndDate: Date | null,
  hardEnd: Date | null,
): string | null {
  return scheduleMichaelTrackClosing(
    sessions,
    trackName,
    segmentDeferred,
    periodStart,
    timeSlots,
    holidayMap,
    isLastTrack,
    minEndDate,
    hardEnd,
  );
}

export function getMinimumPeriodEndDate(startDate: string, years: number): string {
  return format(addYears(parseISO(startDate), years), 'yyyy-MM-dd');
}

const MAX_SCHEDULE_DAYS = 365 * 4;

export function countPeriodCapacity(
  startDate: string,
  endDate: string,
  timeSlots: TimeSlot[],
  holidayPolicy: HolidayPolicy = DEFAULT_HOLIDAY_POLICY,
): { lessonCapacity: number; meetingCount: number } {
  if (!startDate || !endDate || !timeSlots.length) {
    return { lessonCapacity: 0, meetingCount: 0 };
  }

  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (isAfter(start, end)) {
    return { lessonCapacity: 0, meetingCount: 0 };
  }

  const holidayMap = getIsraeliHolidays(startDate, endDate, holidayPolicy);
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
  structuredTrackFlow = true,
  holidayPolicy = DEFAULT_HOLIDAY_POLICY,
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
  const useStructuredTrackFlow = structuredTrackFlow;

  if (totalScheduleItems === 0) {
    return { ...empty, endDate: startDate, totalLessons: 0, fitsCompletely: true };
  }

  if (totalLessons === 0) {
    return { ...empty, endDate: startDate, totalLessons: 0, fitsCompletely: true };
  }

  if (endDateMode === 'fixed') {
    if (!manualEndDate || manualEndDate < startDate) return { ...empty, totalLessons };
    return buildFixedPeriodSchedule(trackIds, startDate, manualEndDate, timeSlots, holidayPolicy);
  }

  const isManual = endDateMode === 'manual';
  if (isManual && !manualEndDate) {
    return { ...empty, totalLessons };
  }

  const manualEnd = isManual && manualEndDate ? parseISO(manualEndDate) : null;
  const minEndDate =
    !isManual && minimumPeriodYears > 0
      ? addYears(parseISO(startDate), minimumPeriodYears)
      : null;
  const closingMinEndDate = minEndDate ?? manualEnd;
  const searchEnd = isManual
    ? manualEndDate!
    : format(
        addYears(
          parseISO(startDate),
          Math.max(
            4,
            (minimumPeriodYears > 0 ? minimumPeriodYears : 0) +
              (enforceSequentialTracks ? trackIds.length * 2 : 0),
          ),
        ),
        'yyyy-MM-dd',
      );

  const holidayMap = getIsraeliHolidays(startDate, searchEnd, holidayPolicy);
  const { lessonCapacity: periodCapacity, meetingCount } = isManual
    ? countPeriodCapacity(startDate, manualEndDate!, timeSlots, holidayPolicy)
    : { lessonCapacity: 0, meetingCount: 0 };

  const sessions: ScheduledSession[] = [];
  const skippedDays: { date: string; reason: string }[] = [];
  const weekTrackMap = new Map<string, string>();
  const trackMeetingCounts = new Map<string, number>();
  const deferredMilestones: ScheduleQueueItem[] = [];
  let blockUntilAfterWeek: string | null = null;
  let queueIndex = 0;
  let current = parseISO(startDate);

  const useMultiTrackStructured =
    enforceSequentialTracks && useStructuredTrackFlow;

  const scheduleSegment = (
    segment: ScheduleQueueItem[],
    onSegmentComplete: (segmentDeferred: ScheduleQueueItem[]) => void,
  ): void => {
    let segmentIndex = 0;
    const segmentDeferred: ScheduleQueueItem[] = [];

    for (let day = 0; day < MAX_SCHEDULE_DAYS && segmentIndex < segment.length; day += 1) {
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
            if (segmentIndex >= segment.length) break;

            const currentItem = segment[segmentIndex];
            const trackName = currentItem.trackName;

            if (
              !canScheduleTrackOnDate(
                current,
                dateStr,
                trackName,
                sessions,
                weekTrackMap,
                blockUntilAfterWeek,
                enforceSequentialTracks,
              )
            ) {
              continue;
            }

            if (isMilestoneItem(currentItem)) {
              if (useStructuredTrackFlow) {
                segmentDeferred.push(currentItem);
                segmentIndex += 1;
                queueIndex += 1;
                continue;
              }

              bumpTrackMeeting(trackMeetingCounts, trackName);
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

              segmentIndex += 1;
              queueIndex += 1;
              continue;
            }

            if (useStructuredTrackFlow) {
              const meetingNumber = bumpTrackMeeting(trackMeetingCounts, trackName);
              if (shouldSchedulePracticeMeeting(sessions, trackName, meetingNumber)) {
                schedulePracticeSession(
                  sessions,
                  dateStr,
                  dayOfWeek,
                  slot,
                  trackName,
                  current,
                  weekTrackMap,
                  enforceSequentialTracks,
                );
                continue;
              }
            } else {
              bumpTrackMeeting(trackMeetingCounts, trackName);
            }

            const maxLessonsInSlot = getLessonCountForSlot(slot.startTime, slot.endTime);
            const lessonItems: { title: string; trackName: string }[] = [];

            for (let i = 0; i < maxLessonsInSlot && segmentIndex < segment.length; i += 1) {
              const item = segment[segmentIndex];
              if (isMilestoneItem(item)) break;
              if (lessonItems.length > 0 && lessonItems[0].trackName !== item.trackName) break;

              lessonItems.push(queueItemToLessonItem(item));
              segmentIndex += 1;
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
              markWeekTrack(
                current,
                lessonItems[0].trackName,
                weekTrackMap,
                enforceSequentialTracks,
              );
            }
          }
        }
      }

      current = addDays(current, 1);
    }

    onSegmentComplete(segmentDeferred);
  };

  if (useMultiTrackStructured) {
    const segments = splitQueueByTrack(scheduleQueue);
    const periodStart = parseISO(startDate);

    segments.forEach((segment, index) => {
      const isLastSegment = index === segments.length - 1;
      const trackName = segment[0].trackName;

      scheduleSegment(segment, (segmentDeferred) => {
        const certDate = finalizeMichaelTrackSegment(
          sessions,
          trackName,
          segmentDeferred,
          periodStart,
          timeSlots,
          holidayMap,
          isLastSegment,
          closingMinEndDate,
          manualEnd,
        );
        if (certDate) {
          blockUntilAfterWeek = getWeekKey(parseISO(certDate));
          current = addDays(parseISO(certDate), 1);
        }
      });
    });
  } else {
    const periodStart = parseISO(startDate);

    const shouldContinueScheduling = (): boolean => {
      if (isManual) return true;
      return queueIndex < totalScheduleItems;
    };

    for (let day = 0; day < MAX_SCHEDULE_DAYS; day += 1) {
      if (!shouldContinueScheduling()) break;
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
                dateStr,
                trackName,
                sessions,
                weekTrackMap,
                blockUntilAfterWeek,
                enforceSequentialTracks,
              )
            ) {
              continue;
            }

            if (isMilestoneItem(currentItem)) {
              if (useStructuredTrackFlow) {
                deferredMilestones.push(currentItem);
                queueIndex += 1;
                continue;
              }

              bumpTrackMeeting(trackMeetingCounts, trackName);
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

            if (useStructuredTrackFlow) {
              const meetingNumber = bumpTrackMeeting(trackMeetingCounts, trackName);
              if (shouldSchedulePracticeMeeting(sessions, trackName, meetingNumber)) {
                schedulePracticeSession(
                  sessions,
                  dateStr,
                  dayOfWeek,
                  slot,
                  trackName,
                  current,
                  weekTrackMap,
                  enforceSequentialTracks,
                );
                continue;
              }
            } else {
              bumpTrackMeeting(trackMeetingCounts, trackName);
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
              markWeekTrack(
                current,
                lessonItems[0].trackName,
                weekTrackMap,
                enforceSequentialTracks,
              );

              if (blockUntilAfterWeek && getWeekKey(current) > blockUntilAfterWeek) {
                blockUntilAfterWeek = null;
              }
            }
          }
        }
      }

      current = addDays(current, 1);
    }

    if (useStructuredTrackFlow && trackIds.length === 1) {
      const trackName = TRACKS.find((t) => t.id === trackIds[0])?.name;
      if (trackName) {
        finalizeMichaelTrackSegment(
          sessions,
          trackName,
          deferredMilestones,
          periodStart,
          timeSlots,
          holidayMap,
          true,
          closingMinEndDate,
          manualEnd,
        );
      }
    }
  }

  const finalSessions = sortScheduledSessions(sessions);

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
    skippedDays: listSkippedStudyDays(startDate, endDate, timeSlots, holidayMap),
    totalLessons,
    assignedLessons: queueIndex,
    fitsCompletely: queueIndex >= totalScheduleItems,
    periodCapacity: isManual ? periodCapacity : queueIndex,
    meetingCount: isManual ? meetingCount : finalSessions.length,
  };
}

// ---------------------------------------------------------------------------
// Fixed period: the dates are given and every lesson of every track goes in.
// The meetings in the period are shared between the tracks in proportion to
// their lessons, tracks run one after another, and inside a track the lessons
// are split as evenly as possible over its teaching meetings — so a meeting
// may hold more lessons than it has hours. Each track keeps the structure of
// the other modes: practice about every fourth meeting, project building,
// a project presentation, the final exam and the certificates.
// ---------------------------------------------------------------------------

const FIXED_PRACTICE_EVERY = PRACTICE_EVERY_N_MEETINGS;
const FIXED_MEETINGS_PER_BUILDING_SESSION = 10;
const FIXED_MIN_MEETINGS_PER_TRACK = 4;

function evenChunks<T>(items: T[], parts: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < parts; i += 1) {
    const from = Math.floor((i * items.length) / parts);
    const to = Math.floor(((i + 1) * items.length) / parts);
    chunks.push(items.slice(from, to));
  }
  return chunks;
}

// Shares `total` meetings between tracks by weight, each track getting at
// least `floor` where the total allows (largest-remainder rounding).
function shareMeetings(total: number, weights: number[]): number[] {
  const count = weights.length;
  if (total < count) return weights.map((_, i) => (i < total ? 1 : 0));

  const floor = Math.min(FIXED_MIN_MEETINGS_PER_TRACK, Math.floor(total / count));
  const shares = weights.map(() => floor);
  const rest = total - floor * count;
  const weightSum = weights.reduce((sum, w) => sum + w, 0) || count;
  const exact = weights.map((w) => (rest * (w || 1)) / weightSum);
  exact.forEach((value, i) => {
    shares[i] += Math.floor(value);
  });
  let left = total - shares.reduce((sum, s) => sum + s, 0);
  const byRemainder = exact
    .map((value, i) => ({ i, r: value - Math.floor(value) }))
    .sort((a, b) => b.r - a.r);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    shares[i] += 1;
    left -= 1;
  }
  return shares;
}

// Positions (0-based, within `length` teaching meetings) for `count` practice
// meetings, spread evenly and never the first meeting.
function spreadPositions(length: number, count: number): Set<number> {
  const picked = new Set<number>();
  for (let j = 1; j <= count; j += 1) {
    let position = Math.round((j * length) / (count + 1));
    position = Math.min(Math.max(position, 1), length - 1);
    while (picked.has(position) && position < length - 1) position += 1;
    while (picked.has(position) && position > 1) position -= 1;
    picked.add(position);
  }
  return picked;
}

function planTrackMeetings(
  slots: MeetingSlot[],
  lessons: string[],
  trackName: string,
): ScheduledSession[] {
  const item = (title: string): LessonItem => ({ title, trackName });
  const session = (slot: MeetingSlot, lessonItems: LessonItem[]): ScheduledSession => ({
    date: slot.date,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    lessonItems,
  });
  const lessonItems = lessons.map(item);
  const total = slots.length;
  if (total === 0) return [];
  if (total === 1) {
    return [session(slots[0], [...lessonItems, item(FINAL_EXAM_TITLE), item(CERTIFICATE_TITLE)])];
  }

  // The closing meetings, from the end of the track's share.
  let tail: LessonItem[][];
  if (total >= 4) tail = [[item(PROJECT_PRESENTATION_TITLE)], [item(FINAL_EXAM_TITLE)], [item(CERTIFICATE_TITLE)]];
  else if (total === 3) tail = [[item(FINAL_EXAM_TITLE)], [item(CERTIFICATE_TITLE)]];
  else tail = [[item(FINAL_EXAM_TITLE), item(CERTIFICATE_TITLE)]];

  const beforeTail = total - tail.length;
  const building = Math.min(
    MAX_PROJECT_BUILDING_SESSIONS,
    Math.floor(beforeTail / FIXED_MEETINGS_PER_BUILDING_SESSION),
  );
  const teaching = beforeTail - building;

  // Practice about every fourth meeting; when the track has more meetings
  // than lessons, every meeting without a lesson becomes practice.
  let practice = Math.floor(teaching / FIXED_PRACTICE_EVERY);
  if (lessonItems.length < teaching - practice) practice = teaching - lessonItems.length;
  practice = Math.max(0, Math.min(practice, teaching - 1));
  const practiceAt = spreadPositions(teaching, practice);
  const lessonChunks = evenChunks(lessonItems, teaching - practiceAt.size);

  const sessions: ScheduledSession[] = [];
  let chunk = 0;
  for (let i = 0; i < teaching; i += 1) {
    sessions.push(
      session(slots[i], practiceAt.has(i) ? [item(PRACTICE_TITLE)] : lessonChunks[chunk++]),
    );
  }
  for (let i = 0; i < building; i += 1) {
    sessions.push(session(slots[teaching + i], [item(PROJECT_BUILDING_TITLE)]));
  }
  tail.forEach((items, i) => sessions.push(session(slots[beforeTail + i], items)));
  return sessions;
}

function buildFixedPeriodSchedule(
  trackIds: string[],
  startDate: string,
  endDate: string,
  timeSlots: TimeSlot[],
  holidayPolicy: HolidayPolicy,
): ScheduleResult {
  const holidayMap = getIsraeliHolidays(startDate, endDate, holidayPolicy);
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const meetings = collectValidMeetingSlots(start, end, timeSlots, holidayMap);

  const skippedDays = listSkippedStudyDays(startDate, endDate, timeSlots, holidayMap);

  const tracks = trackIds
    .map((id) => TRACKS.find((t) => t.id === id))
    .filter((t): t is (typeof TRACKS)[number] => Boolean(t))
    .map((t) => ({ name: t.name, lessons: t.modules.flatMap((m) => m.lessons) }));
  const totalLessons = tracks.reduce((sum, t) => sum + t.lessons.length, 0);

  const shares = shareMeetings(
    meetings.length,
    tracks.map((t) => t.lessons.length),
  );
  const sessions: ScheduledSession[] = [];
  let assigned = 0;
  let offset = 0;
  tracks.forEach((track, i) => {
    const slots = meetings.slice(offset, offset + shares[i]);
    offset += shares[i];
    if (!slots.length) return;
    sessions.push(...planTrackMeetings(slots, track.lessons, track.name));
    assigned += track.lessons.length + 2;
  });

  const maxLessonsPerMeeting = sessions.reduce(
    (max, s) =>
      Math.max(
        max,
        s.lessonItems.filter(
          (it) => !isMilestoneTitle(it.title) && !isPracticeTitle(it.title) && !isSupplementaryTitle(it.title),
        ).length,
      ),
    0,
  );

  return {
    sessions,
    endDate,
    skippedDays,
    totalLessons,
    assignedLessons: assigned,
    fitsCompletely: assigned === totalLessons + tracks.length * 2,
    periodCapacity: meetings.length,
    meetingCount: meetings.length,
    maxLessonsPerMeeting,
  };
}

export function countScheduledLessons(sessions: ScheduledSession[]): number {
  return sessions.reduce((sum, session) => {
    const lessonCount = session.lessonItems.filter(
      (item) =>
        !isMilestoneTitle(item.title) &&
        !isPracticeTitle(item.title) &&
        !isSupplementaryTitle(item.title),
    ).length;
    return sum + lessonCount;
  }, 0);
}
