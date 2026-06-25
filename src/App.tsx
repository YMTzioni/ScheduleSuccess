import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { StudentForm, ScheduleBuilder } from './components/Forms';
import { DocumentPreview } from './components/DocumentPreview';
import { buildSchedule, countScheduledLessons } from './utils/scheduleGenerator';
import { getScheduleFitStatus } from './utils/scheduleRecommendations';
import { getTotalLessonCount } from './data/tracks';
import { getScheduleTemplate } from './utils/scheduleTemplates';
import type { EndDateMode, ScheduleTemplateId, TimeSlot } from './types';
import logoUrl from './assets/logo.png';
import './App.css';

function App() {
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [trackIds, setTrackIds] = useState<string[]>([]);
  const [amountNis, setAmountNis] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDateMode, setEndDateMode] = useState<EndDateMode>('auto');
  const [manualEndDate, setManualEndDate] = useState('');
  const [scheduleTemplateId, setScheduleTemplateId] = useState<ScheduleTemplateId>('custom');
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [showDocument, setShowDocument] = useState(false);

  const scheduleResult = useMemo(() => {
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
      manualEndDate: endDateMode === 'manual' ? manualEndDate : undefined,
      minimumPeriodYears: getScheduleTemplate(scheduleTemplateId).periodYears,
      structuredTrackFlow: getScheduleTemplate(scheduleTemplateId).structuredTrackFlow,
    });
  }, [trackIds, startDate, timeSlots, endDateMode, manualEndDate, scheduleTemplateId]);

  const {
    sessions,
    endDate,
    skippedDays,
    assignedLessons,
    fitsCompletely,
  } = scheduleResult;

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
      startDate,
      endDate,
      timeSlots,
      sessions,
      documentDate: format(new Date(), 'yyyy-MM-dd'),
      totalLessons,
    }),
    [fullName, idNumber, trackIds, amountNis, startDate, endDate, timeSlots, sessions, totalLessons],
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
          onFullNameChange={setFullName}
          onIdNumberChange={setIdNumber}
          onTrackIdsChange={setTrackIds}
          onAmountChange={setAmountNis}
        />

        <ScheduleBuilder
          startDate={startDate}
          endDateMode={endDateMode}
          manualEndDate={manualEndDate}
          calculatedEndDate={endDate}
          trackIds={trackIds}
          scheduleTemplateId={scheduleTemplateId}
          timeSlots={timeSlots}
          scheduleFit={scheduleFit}
          onStartDateChange={setStartDate}
          onEndDateModeChange={setEndDateMode}
          onManualEndDateChange={setManualEndDate}
          onScheduleTemplateIdChange={setScheduleTemplateId}
          onTimeSlotsChange={setTimeSlots}
        />

        {hasScheduleInput && sessions.length > 0 && (
          <div className="summary-bar">
            <span>
              תקופת לימודים: <strong dir="ltr">{startDate}</strong> –{' '}
              <strong dir="ltr">{endDate}</strong>
              {' · '}
              <strong>{sessions.length}</strong> מפגשים ·{' '}
              <strong>{scheduledLessons}</strong>/{totalLessons} שיעורים
              {!fitsCompletely && endDateMode === 'manual' && (
                <span className="summary-warning"> (לא הושלם)</span>
              )}
            </span>
            {skippedDays.length > 0 && (
              <span className="skipped-badge">
                {skippedDays.length} ימים דולגו (חגים/שבת)
              </span>
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
