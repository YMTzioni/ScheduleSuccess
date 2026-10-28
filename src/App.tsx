import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { StudentForm, ScheduleBuilder } from './components/Forms';
import { DocumentPreview } from './components/DocumentPreview';
import {
  buildSchedule,
  countScheduledLessons,
  type ScheduleResult,
} from './utils/scheduleGenerator';
import { getScheduleFitStatus } from './utils/scheduleRecommendations';
import { getTotalLessonCount } from './data/tracks';
import { getScheduleTemplate } from './utils/scheduleTemplates';
import {
  DEFAULT_HOLIDAY_POLICY,
  HOLIDAY_GROUPS,
  type HolidayPolicy,
} from './utils/holidays';
import type { EndDateMode, ScheduleTemplateId, TimeSlot } from './types';
import logoUrl from './assets/logo.png';
import './App.css';

const HOLIDAY_POLICY_KEY = 'scheduleSuccess.holidayPolicy.v1';

// The college's days-off choices are kept in this browser, so they do not
// have to be set again for every student.
function loadHolidayPolicy(): HolidayPolicy {
  try {
    const saved = JSON.parse(localStorage.getItem(HOLIDAY_POLICY_KEY) ?? 'null');
    if (!saved) return DEFAULT_HOLIDAY_POLICY;
    const off = { ...DEFAULT_HOLIDAY_POLICY.off };
    for (const group of HOLIDAY_GROUPS) {
      if (typeof saved.off?.[group.id] === 'boolean') off[group.id] = saved.off[group.id];
    }
    const extraDays = Array.isArray(saved.extraDays)
      ? saved.extraDays.filter((d: unknown) => typeof (d as { date?: unknown })?.date === 'string')
      : [];
    return { off, extraDays };
  } catch {
    return DEFAULT_HOLIDAY_POLICY;
  }
}

function formatSkippedDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

function App() {
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [trackIds, setTrackIds] = useState<string[]>([]);
  const [amountNis, setAmountNis] = useState(0);
  const [introNote, setIntroNote] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDateMode, setEndDateMode] = useState<EndDateMode>('auto');
  const [manualEndDate, setManualEndDate] = useState('');
  const [scheduleTemplateId, setScheduleTemplateId] = useState<ScheduleTemplateId>('custom');
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [showDocument, setShowDocument] = useState(false);
  const [holidayPolicy, setHolidayPolicy] = useState<HolidayPolicy>(loadHolidayPolicy);

  useEffect(() => {
    try {
      localStorage.setItem(HOLIDAY_POLICY_KEY, JSON.stringify(holidayPolicy));
    } catch {
      // storage unavailable — the choices still apply for this visit
    }
  }, [holidayPolicy]);

  const scheduleResult = useMemo((): ScheduleResult => {
    if (!startDate || !trackIds.length || !timeSlots.length) {
      return {
        sessions: [],
        endDate: '',
        skippedDays: [],
        totalLessons: 0,
        assignedLessons: 0,
        fitsCompletely: false,
        periodCapacity: 0,
        meetingCount: 0,
      };
    }
    return buildSchedule({
      trackIds,
      startDate,
      timeSlots,
      endDateMode,
      manualEndDate: endDateMode === 'auto' ? undefined : manualEndDate,
      minimumPeriodYears: getScheduleTemplate(scheduleTemplateId).periodYears,
      structuredTrackFlow: getScheduleTemplate(scheduleTemplateId).structuredTrackFlow,
      holidayPolicy,
    });
  }, [trackIds, startDate, timeSlots, endDateMode, manualEndDate, scheduleTemplateId, holidayPolicy]);

  const {
    sessions,
    endDate,
    skippedDays,
    assignedLessons,
    fitsCompletely,
  } = scheduleResult;

  const uniqueSkippedDays = useMemo(() => {
    const byDate = new Map<string, string>();
    for (const day of skippedDays) byDate.set(day.date, day.reason);
    return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, reason]) => ({ date, reason }));
  }, [skippedDays]);

  const scheduledLessons = useMemo(
    () => countScheduledLessons(sessions),
    [sessions],
  );

  const totalLessons = useMemo(
    () => (trackIds.length ? getTotalLessonCount(trackIds) : 0),
    [trackIds],
  );

  const scheduleFit = useMemo(
    () =>
      getScheduleFitStatus({
        trackIds,
        startDate,
        manualEndDate,
        timeSlots,
        endDateMode,
        assignedLessons,
      }),
    [trackIds, startDate, manualEndDate, timeSlots, endDateMode, assignedLessons],
  );

  const document = useMemo(
    () => ({
      fullName,
      idNumber,
      trackIds,
      amountNis,
      introNote,
      startDate,
      endDate,
      timeSlots,
      sessions,
      documentDate: format(new Date(), 'yyyy-MM-dd'),
      totalLessons,
    }),
    [fullName, idNumber, trackIds, amountNis, introNote, startDate, endDate, timeSlots, sessions, totalLessons],
  );

  const hasScheduleInput =
    startDate &&
    trackIds.length > 0 &&
    timeSlots.length > 0 &&
    (endDateMode === 'auto' || manualEndDate);

  const canPreview =
    fullName.trim() &&
    idNumber.length >= 5 &&
    trackIds.length > 0 &&
    amountNis > 0 &&
    hasScheduleInput &&
    sessions.length > 0;

  useEffect(() => {
    if (!canPreview) {
      setShowDocument(false);
    }
  }, [canPreview]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand">
            <img src={logoUrl} alt="מכללת סאקסס" className="brand-logo-img" />
            <div className="brand-text">
              <h1>מכללת סאקסס</h1>
              <p>מערכת הפקת מסמכים רשמיים</p>
            </div>
          </div>
          <div className="header-accent" aria-hidden="true" />
        </div>
      </header>

      <main className="app-main">
        <StudentForm
          fullName={fullName}
          idNumber={idNumber}
          trackIds={trackIds}
          amountNis={amountNis}
          introNote={introNote}
          onFullNameChange={setFullName}
          onIdNumberChange={setIdNumber}
          onTrackIdsChange={setTrackIds}
          onAmountChange={setAmountNis}
          onIntroNoteChange={setIntroNote}
        />

        <ScheduleBuilder
          startDate={startDate}
          endDateMode={endDateMode}
          manualEndDate={manualEndDate}
          calculatedEndDate={endDate}
          fixedPeriod={
            endDateMode === 'fixed' && sessions.length
              ? {
                  meetings: scheduleResult.meetingCount,
                  maxLessonsPerMeeting: scheduleResult.maxLessonsPerMeeting ?? 0,
                }
              : null
          }
          trackIds={trackIds}
          scheduleTemplateId={scheduleTemplateId}
          timeSlots={timeSlots}
          scheduleFit={scheduleFit}
          onStartDateChange={setStartDate}
          onEndDateModeChange={setEndDateMode}
          onManualEndDateChange={setManualEndDate}
          onScheduleTemplateIdChange={setScheduleTemplateId}
          onTimeSlotsChange={setTimeSlots}
          holidayPolicy={holidayPolicy}
          onHolidayPolicyChange={setHolidayPolicy}
        />

        {hasScheduleInput && sessions.length > 0 && (
          <div className="summary-bar">
            <span>
              תקופת לימודים: <strong dir="ltr">{startDate}</strong> –{' '}
              <strong dir="ltr">{endDate}</strong>
              {' · '}
              <strong>{sessions.length}</strong> מפגשים ·{' '}
              <strong>{scheduledLessons}</strong>/{totalLessons} שיעורים
              {endDateMode === 'fixed' && scheduleResult.maxLessonsPerMeeting ? (
                <>
                  {' · '}עד <strong>{scheduleResult.maxLessonsPerMeeting}</strong> שיעורים במפגש
                </>
              ) : null}
              {!fitsCompletely && endDateMode !== 'auto' && (
                <span className="summary-warning"> (לא הושלם)</span>
              )}
            </span>
            {uniqueSkippedDays.length > 0 && (
              <details className="skipped-days">
                <summary className="skipped-badge">
                  {uniqueSkippedDays.length} ימי לימוד דולגו (חגים) — הצג
                </summary>
                <ul>
                  {uniqueSkippedDays.map((day) => (
                    <li key={day.date}>
                      <span dir="ltr">{formatSkippedDate(day.date)}</span> — {day.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {canPreview && !showDocument && (
          <div className="create-document-card">
            <p>
              {fitsCompletely
                ? 'הכל מוכן. לחץ כדי ליצור את המסמך הרשמי להדפסה.'
                : 'ניתן ליצור מסמך עם השיעורים ששובצו. עדכן את הלוז כדי לכלול את כל המסלולים.'}
            </p>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="create-document-btn"
            onClick={() => setShowDocument(true)}
          >
              צור מסמך
            </button>
          </div>
        )}

        {canPreview && showDocument && <DocumentPreview document={document} />}

        {!canPreview && (
          <p className="empty-state">
            מלא את כל הפרטים כדי ליצור את המסמך הרשמי
          </p>
        )}
      </main>
    </div>
  );
}

export default App;
