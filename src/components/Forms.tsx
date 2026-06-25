import { useEffect, useMemo, useState } from 'react';
import { TRACKS } from '../data/tracks';
import type { EndDateMode, ScheduleTemplateId, TimeSlot } from '../types';
import { DAY_NAMES } from '../types';
import {
  addHoursToTime,
  buildTimeSlotsFromDistribution,
  getDistributionOptions,
  getDistributionSummary,
  getPeriodStats,
  type DistributionOption,
} from '../utils/distributionPlanner';
import { getLessonCountForSlot } from '../utils/scheduleGenerator';
import type { ScheduleFitStatus } from '../utils/scheduleRecommendations';
import {
  getScheduleTemplate,
  getTemplateEndDate,
  SCHEDULE_TEMPLATES,
  slotMeetsMinHours,
} from '../utils/scheduleTemplates';

interface StudentFormProps {
  fullName: string;
  idNumber: string;
  trackIds: string[];
  amountNis: number;
  onFullNameChange: (v: string) => void;
  onIdNumberChange: (v: string) => void;
  onTrackIdsChange: (ids: string[]) => void;
  onAmountChange: (v: number) => void;
}

export function StudentForm({
  fullName,
  idNumber,
  trackIds,
  amountNis,
  onFullNameChange,
  onIdNumberChange,
  onTrackIdsChange,
  onAmountChange,
}: StudentFormProps) {
  const addTrack = (id: string) => {
    if (!trackIds.includes(id)) {
      onTrackIdsChange([...trackIds, id]);
    }
  };

  const removeTrack = (id: string) => {
    onTrackIdsChange(trackIds.filter((t) => t !== id));
  };

  const moveTrack = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= trackIds.length) return;
    const updated = [...trackIds];
    [updated[index], updated[next]] = [updated[next], updated[index]];
    onTrackIdsChange(updated);
  };

  const availableTracks = TRACKS.filter((t) => !trackIds.includes(t.id));

  return (
    <section className="card">
      <h2>פרטי סטודנט</h2>
      <div className="form-grid">
        <label>
          שם מלא
          <input
            type="text"
            value={fullName}
            onChange={(e) => onFullNameChange(e.target.value)}
            placeholder="ישראל ישראלי"
          />
        </label>
        <label>
          תעודת זהות
          <input
            type="text"
            value={idNumber}
            onChange={(e) => onIdNumberChange(e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="123456789"
            maxLength={9}
            dir="ltr"
          />
        </label>
        <label>
          סכום עסקה (₪)
          <input
            type="number"
            value={amountNis || ''}
            onChange={(e) => onAmountChange(Number(e.target.value))}
            placeholder="15000"
            min={0}
            dir="ltr"
          />
        </label>
      </div>

      <div className="tracks-section">
        <h3>מסלולי לימוד (לפי סדר)</h3>
        <p className="tracks-order-hint">
          הסטודנט ילמד את המסלולים לפי הסדר שתגדיר — קודם מסלול 1 במלואו, אחר כך מסלול 2, וכן הלאה.
        </p>

        {trackIds.length > 0 && (
          <ol className="track-order-list">
            {trackIds.map((id, index) => {
              const track = TRACKS.find((t) => t.id === id);
              if (!track) return null;
              const lessonCount = track.modules.reduce(
                (sum, m) => sum + m.lessons.length,
                0,
              );
              return (
                <li key={id} className="track-order-item">
                  <span className="track-order-name">
                    {track.name}
                    <small className="track-lesson-count"> ({lessonCount} שיעורים)</small>
                  </span>
                  <div className="track-order-actions">
                    <button
                      type="button"
                      className="btn-order"
                      onClick={() => moveTrack(index, -1)}
                      disabled={index === 0}
                      aria-label="הזז למעלה"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-order"
                      onClick={() => moveTrack(index, 1)}
                      disabled={index === trackIds.length - 1}
                      aria-label="הזז למטה"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn-remove"
                      onClick={() => removeTrack(id)}
                      aria-label="הסר מסלול"
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {availableTracks.length > 0 && (
          <div className="tracks-add-grid">
            {availableTracks.map((track) => {
              const lessonCount = track.modules.reduce(
                (sum, m) => sum + m.lessons.length,
                0,
              );
              return (
                <button
                  key={track.id}
                  type="button"
                  className="track-add-btn"
                  onClick={() => addTrack(track.id)}
                >
                  + {track.name}
                  <small> ({lessonCount})</small>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

interface ScheduleBuilderProps {
  startDate: string;
  endDateMode: EndDateMode;
  manualEndDate: string;
  calculatedEndDate: string;
  trackIds: string[];
  scheduleTemplateId: ScheduleTemplateId;
  timeSlots: TimeSlot[];
  scheduleFit: ScheduleFitStatus | null;
  onStartDateChange: (v: string) => void;
  onEndDateModeChange: (mode: EndDateMode) => void;
  onManualEndDateChange: (v: string) => void;
  onScheduleTemplateIdChange: (id: ScheduleTemplateId) => void;
  onTimeSlotsChange: (slots: TimeSlot[]) => void;
}

const DEFAULT_START = '09:00';
const DEFAULT_END = '12:00';
const MICHAEL_DEFAULT_END = '17:00';
const STUDY_DAYS = [0, 1, 2, 3, 4] as const;

function formatDateHeDisplay(dateStr: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export function ScheduleBuilder({
  startDate,
  endDateMode,
  manualEndDate,
  calculatedEndDate,
  trackIds,
  scheduleTemplateId,
  timeSlots,
  scheduleFit,
  onStartDateChange,
  onEndDateModeChange,
  onManualEndDateChange,
  onScheduleTemplateIdChange,
  onTimeSlotsChange,
}: ScheduleBuilderProps) {
  const activeTemplate = getScheduleTemplate(scheduleTemplateId);
  const isMichaelTemplate = scheduleTemplateId === 'michael';
  const minHoursPerSession = activeTemplate.minHoursPerSession;

  const [newDay, setNewDay] = useState(0);
  const [newStart, setNewStart] = useState(DEFAULT_START);
  const [newEnd, setNewEnd] = useState(isMichaelTemplate ? MICHAEL_DEFAULT_END : DEFAULT_END);

  const [sessionsPerWeek, setSessionsPerWeek] = useState(2);
  const [hoursPerSession, setHoursPerSession] = useState(4);
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 3]);
  const [distributionApplied, setDistributionApplied] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  const periodStats = useMemo(() => {
    if (endDateMode !== 'manual' || !startDate || !manualEndDate) return null;
    return getPeriodStats(trackIds, startDate, manualEndDate);
  }, [endDateMode, startDate, manualEndDate, trackIds]);

  const distributionOptions = useMemo(() => {
    if (!periodStats || !startDate || !manualEndDate) return [];
    return getDistributionOptions(trackIds, startDate, manualEndDate);
  }, [periodStats, trackIds, startDate, manualEndDate]);

  const distributionSummary = useMemo(() => {
    if (!periodStats || !distributionOptions.length) return null;
    return getDistributionSummary(periodStats, distributionOptions);
  }, [periodStats, distributionOptions]);

  const showManualPlanner =
    !isMichaelTemplate &&
    endDateMode === 'manual' &&
    startDate &&
    manualEndDate &&
    trackIds.length > 0 &&
    periodStats;

  useEffect(() => {
    if (isMichaelTemplate) return;
    if (endDateMode === 'auto') {
      setDistributionApplied(false);
      setSelectedOptionId(null);
    }
  }, [endDateMode, isMichaelTemplate]);

  useEffect(() => {
    if (isMichaelTemplate && startDate) {
      const template = getScheduleTemplate('michael');
      onEndDateModeChange('auto');
      onManualEndDateChange('');
      setSessionsPerWeek(template.sessionsPerWeek);
      setHoursPerSession(template.hoursPerSession);
      setNewEnd(MICHAEL_DEFAULT_END);
      return;
    }

    setDistributionApplied(false);
    setSelectedOptionId(null);
    onTimeSlotsChange([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset slots when period inputs change
  }, [isMichaelTemplate, startDate, trackIds.join(',')]);

  useEffect(() => {
    if (!isMichaelTemplate || !startDate) return;
    if (selectedDays.length === activeTemplate.sessionsPerWeek) {
      applyMichaelDays(selectedDays);
    } else {
      onTimeSlotsChange([]);
      setDistributionApplied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply michael slots when days or start time change
  }, [isMichaelTemplate, startDate, selectedDays.join(','), newStart]);

  useEffect(() => {
    if (isMichaelTemplate || distributionOptions.length === 0) return;
    const best = distributionOptions[0];
    setSelectedOptionId(best.id);
    setSessionsPerWeek(best.sessionsPerWeek);
    setHoursPerSession(best.hoursPerSession);
    setSelectedDays(best.recommendedDays);
  }, [distributionOptions, isMichaelTemplate]);

  const handleTemplateChange = (id: ScheduleTemplateId) => {
    onScheduleTemplateIdChange(id);
    if (id === 'michael') {
      setSelectedDays([0, 3]);
      setNewStart(DEFAULT_START);
      setNewEnd(MICHAEL_DEFAULT_END);
    }
    if (id === 'custom') {
      setDistributionApplied(false);
      setSelectedOptionId(null);
      onTimeSlotsChange([]);
      onEndDateModeChange('auto');
      onManualEndDateChange('');
      setNewEnd(DEFAULT_END);
    }
  };

  const selectDistributionOption = (option: DistributionOption) => {
    setSelectedOptionId(option.id);
    setSessionsPerWeek(option.sessionsPerWeek);
    setHoursPerSession(option.hoursPerSession);
    setSelectedDays(option.recommendedDays);
  };

  const toggleDay = (day: number) => {
    setSelectedOptionId(null);
    setSelectedDays((prev) => {
      if (prev.includes(day)) {
        return prev.filter((d) => d !== day);
      }
      if (isMichaelTemplate && prev.length >= activeTemplate.sessionsPerWeek) {
        return prev;
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  };

  const applyMichaelDays = (days: number[]) => {
    if (days.length !== activeTemplate.sessionsPerWeek) return;
    const slots = buildTimeSlotsFromDistribution(
      days,
      activeTemplate.hoursPerSession,
      newStart,
    );
    onTimeSlotsChange(slots);
    setDistributionApplied(true);
  };

  const applyDistribution = () => {
    if (selectedDays.length === 0) return;
    if (isMichaelTemplate && selectedDays.length !== 2) return;
    const slots = buildTimeSlotsFromDistribution(selectedDays, hoursPerSession, DEFAULT_START);
    onTimeSlotsChange(slots);
    setDistributionApplied(true);
  };

  const handleModeChange = (mode: EndDateMode) => {
    if (isMichaelTemplate) return;
    onEndDateModeChange(mode);
    onTimeSlotsChange([]);
    setDistributionApplied(false);
    setSelectedOptionId(null);
  };

  const addSlot = () => {
    const slot = { dayOfWeek: newDay, startTime: newStart, endTime: newEnd };
    if (!slotMeetsMinHours(slot, minHoursPerSession)) return;

    const exists = timeSlots.some(
      (s) =>
        s.dayOfWeek === newDay &&
        s.startTime === newStart &&
        s.endTime === newEnd,
    );
    if (exists) return;

    if (isMichaelTemplate && timeSlots.length >= 2) return;

    onTimeSlotsChange([...timeSlots, slot]);
    if (!isMichaelTemplate) {
      setDistributionApplied(false);
    }
  };

  const removeSlot = (index: number) => {
    if (isMichaelTemplate) return;
    onTimeSlotsChange(timeSlots.filter((_, i) => i !== index));
    setDistributionApplied(false);
  };

  const handleStartTimeChange = (value: string) => {
    setNewStart(value);
    if (isMichaelTemplate) {
      setNewEnd(addHoursToTime(value, minHoursPerSession));
    }
  };

  const handleEndTimeChange = (value: string) => {
    const minEnd = addHoursToTime(newStart, minHoursPerSession);
    if (isMichaelTemplate && parseMinutes(value) < parseMinutes(minEnd)) {
      setNewEnd(minEnd);
      return;
    }
    setNewEnd(value);
  };

  function parseMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  const newSlotHours = getLessonCountForSlot(newStart, newEnd);
  const showSlotBuilder = endDateMode === 'auto' || distributionApplied;

  return (
    <section className="card">
      <h2>מערכת שעות לימוד</h2>

      <div className="schedule-template-picker">
        <h3>תבנית מערכת שעות</h3>
        <div className="mode-toggle">
          {SCHEDULE_TEMPLATES.map((template) => (
            <label
              key={template.id}
              className={`mode-option ${scheduleTemplateId === template.id ? 'active' : ''}`}
            >
              <input
                type="radio"
                name="scheduleTemplate"
                value={template.id}
                checked={scheduleTemplateId === template.id}
                onChange={() => handleTemplateChange(template.id)}
              />
              <span className="mode-title">{template.name}</span>
              <span className="mode-desc">{template.description}</span>
            </label>
          ))}
        </div>
      </div>

      {isMichaelTemplate && startDate && (
        <div className="recommendation-panel recommendation-ok template-michael-panel">
          <strong>תבנית מיכאל פעילה</strong>
          <ul>
            <li>תרגול — כל מפגש רביעי, ללא שני מפגשי תרגול רצופים</li>
            <li>השלמת מסלול: בניית פרויקטים (עד 5) + הצגת פרויקטים (מפגש 1)</li>
            <li>סיום כל מסלול: מבחן סיום ואחריו חלוקת תעודות</li>
            <li>תאריך סיום מחושב אוטומטית — מינימום שנה שלמה מתאריך ההתחלה</li>
            {trackIds.length > 1 && (
              <li>מסלולים לפי סדר — מסלול אחד בכל שבוע, ללא ערבוב וללא התנגשות בתאריכים</li>
            )}
            <li>
              2 ימי לימוד בשבוע
              {selectedDays.length === 2
                ? `: ${selectedDays.map((d) => DAY_NAMES[d]).join(' ו')}`
                : ' — בחר ימים למטה'}
            </li>
            <li>
              8 שעות לימוד בכל יום
              {selectedDays.length === 2 ? (
                <>
                  {' '}
                  (<span dir="ltr">{newStart}–{newEnd}</span>)
                </>
              ) : (
                ' — בחר שעת התחלה למטה'
              )}
            </li>
            {calculatedEndDate && (
              <li>
                תאריך סיום משוער: <span dir="ltr">{formatDateHeDisplay(calculatedEndDate)}</span>
              </li>
            )}
            {startDate && !calculatedEndDate && (
              <li>
                תאריך סיום מינימלי:{' '}
                <span dir="ltr">{formatDateHeDisplay(getTemplateEndDate(startDate, activeTemplate.periodYears))}</span>
              </li>
            )}
          </ul>
        </div>
      )}

      {isMichaelTemplate && startDate && (
        <div className="distribution-days michael-days-picker">
          <h4>ימי לימוד בשבוע (בחר 2)</h4>
          <div className="day-picker">
            {STUDY_DAYS.map((day) => (
              <label
                key={day}
                className={`day-chip ${selectedDays.includes(day) ? 'selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedDays.includes(day)}
                  onChange={() => toggleDay(day)}
                />
                {DAY_NAMES[day]}
              </label>
            ))}
          </div>
          {selectedDays.length < 2 && (
            <p className="slot-min-hours-hint">יש לבחור בדיוק 2 ימי לימוד בשבוע</p>
          )}

          <div className="michael-time-picker">
            <label>
              שעת התחלה
              <input
                type="time"
                value={newStart}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                dir="ltr"
              />
            </label>
            <p className="michael-time-summary" dir="ltr">
              סיום: {newEnd} ({activeTemplate.hoursPerSession} שעות)
            </p>
          </div>
        </div>
      )}

      {!isMichaelTemplate && (
      <div className="end-date-mode">
        <h3>תאריך סיום</h3>
        <div className="mode-toggle">
          <label className={`mode-option ${endDateMode === 'auto' ? 'active' : ''}`}>
            <input
              type="radio"
              name="endDateMode"
              value="auto"
              checked={endDateMode === 'auto'}
              onChange={() => handleModeChange('auto')}
            />
            <span className="mode-title">אוטומטי</span>
            <span className="mode-desc">המערכת תחשב תאריך סיום לפי כמות השיעורים</span>
          </label>
          <label className={`mode-option ${endDateMode === 'manual' ? 'active' : ''}`}>
            <input
              type="radio"
              name="endDateMode"
              value="manual"
              checked={endDateMode === 'manual'}
              onChange={() => handleModeChange('manual')}
            />
            <span className="mode-title">ידני</span>
            <span className="mode-desc">בחר תאריך סיום וחלוקת לימודים מומלצת</span>
          </label>
        </div>
      </div>
      )}

      <div className="form-grid">
        <label>
          תאריך התחלה
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            dir="ltr"
          />
        </label>
        {isMichaelTemplate ? (
          <label>
            תאריך סיום (מחושב)
            <input
              type="text"
              value={formatDateHeDisplay(calculatedEndDate)}
              readOnly
              className="readonly-field"
              dir="ltr"
              placeholder="יוצג לאחר בחירת מסלולים וימי לימוד"
            />
          </label>
        ) : endDateMode === 'auto' ? (
          <label>
            תאריך סיום (מחושב)
            <input
              type="text"
              value={formatDateHeDisplay(calculatedEndDate)}
              readOnly
              className="readonly-field"
              dir="ltr"
              placeholder="יוצג לאחר בחירת מסלולים וימי לימוד"
            />
          </label>
        ) : (
          <label>
            תאריך סיום
            <input
              type="date"
              value={manualEndDate}
              onChange={(e) => onManualEndDateChange(e.target.value)}
              min={startDate}
              dir="ltr"
            />
          </label>
        )}
      </div>

      {showManualPlanner && distributionSummary && (
        <div className={`recommendation-panel recommendation-${distributionSummary.status}`}>
          <strong>{distributionSummary.title}</strong>
          <ul>
            {distributionSummary.messages.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {showManualPlanner && (
        <div className="distribution-planner">
          <h3>בחר חלוקת לימודים</h3>
          <p className="distribution-intro">
            נדרשים <strong>{periodStats.totalLessons}</strong> שיעורים ב-
            <strong>{periodStats.weeks}</strong> שבועות
            (~<strong>{periodStats.lessonsPerWeekNeeded}</strong> שיעורים בשבוע)
          </p>

          <div className="distribution-options">
            {distributionOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`distribution-option ${selectedOptionId === option.id ? 'selected' : ''} ${option.fits ? 'fits' : 'tight'}`}
                onClick={() => selectDistributionOption(option)}
              >
                <span className="dist-label">{option.label}</span>
                <span className="dist-desc">{option.description}</span>
                {option.fits && <span className="dist-badge">מתאים</span>}
              </button>
            ))}
          </div>

          <div className="distribution-custom">
            <h4>או הגדר חלוקה מותאמת</h4>
            <div className="dist-custom-grid">
              <label>
                פעמים בשבוע
                <select
                  value={sessionsPerWeek}
                  onChange={(e) => {
                    setSelectedOptionId(null);
                    const n = Number(e.target.value);
                    setSessionsPerWeek(n);
                    const patterns: Record<number, number[]> = {
                      1: [0],
                      2: [0, 3],
                      3: [0, 2, 4],
                      4: [0, 1, 3, 4],
                      5: [0, 1, 2, 3, 4],
                    };
                    setSelectedDays(patterns[n] ?? [0, 3]);
                  }}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                שעות למפגש
                <select
                  value={hoursPerSession}
                  onChange={(e) => {
                    setSelectedOptionId(null);
                    setHoursPerSession(Number(e.target.value));
                  }}
                >
                  {Array.from({ length: 7 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="distribution-days">
            <h4>ימי לימוד בשבוע</h4>
            <div className="day-picker">
              {STUDY_DAYS.map((day) => (
                <label key={day} className={`day-chip ${selectedDays.includes(day) ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectedDays.includes(day)}
                    onChange={() => toggleDay(day)}
                  />
                  {DAY_NAMES[day]}
                </label>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary apply-distribution-btn"
            onClick={applyDistribution}
            disabled={selectedDays.length === 0}
          >
            החל חלוקה — {selectedDays.length} ימים × {hoursPerSession} שעות
          </button>
        </div>
      )}

      {scheduleFit && distributionApplied && (
        <div className={`recommendation-panel recommendation-${scheduleFit.status}`}>
          <strong>{scheduleFit.title}</strong>
          <ul>
            {scheduleFit.messages.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {(endDateMode === 'auto' || distributionApplied) && showSlotBuilder && (
        <>
          <div className="slot-builder">
            <h3>
              {isMichaelTemplate
                ? 'ימים ושעות לימוד (תבנית מיכאל)'
                : endDateMode === 'manual'
                  ? 'עדכון ימים ושעות (אופציונלי)'
                  : 'הוספת יום ושעות לימוד'}
            </h3>
            {!isMichaelTemplate && (
            <div className="slot-form">
              <label>
                יום
                <select value={newDay} onChange={(e) => setNewDay(Number(e.target.value))}>
                  {DAY_NAMES.map((name, i) => (
                    <option key={i} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                משעה
                <input
                  type="time"
                  value={newStart}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  dir="ltr"
                />
              </label>
              <label>
                עד שעה
                <input
                  type="time"
                  value={newEnd}
                  onChange={(e) => handleEndTimeChange(e.target.value)}
                  min={isMichaelTemplate ? addHoursToTime(newStart, minHoursPerSession) : undefined}
                  dir="ltr"
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addSlot}
                disabled={
                  isMichaelTemplate &&
                  (!slotMeetsMinHours(
                    { dayOfWeek: newDay, startTime: newStart, endTime: newEnd },
                    minHoursPerSession,
                  ) ||
                    timeSlots.length >= 2)
                }
              >
                + הוסף
              </button>
            </div>
            )}
            {isMichaelTemplate && newSlotHours < minHoursPerSession && (
              <p className="slot-min-hours-hint">
                בתבנית מיכאל נדרשות לפחות {minHoursPerSession} שעות לימוד ביום.
              </p>
            )}
          </div>

          {timeSlots.length > 0 && (
            <div className="slots-list">
              <h3>ימים ושעות שנבחרו</h3>
              <ul>
                {timeSlots.map((slot, i) => (
                  <li key={i}>
                    <span>
                      יום {DAY_NAMES[slot.dayOfWeek]} · {slot.startTime}–{slot.endTime}
                    </span>
                    <button
                      type="button"
                      className="btn-remove"
                      onClick={() => removeSlot(i)}
                      disabled={isMichaelTemplate}
                      aria-label="הסר"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="hint">
        {isMichaelTemplate
          ? `תבנית מיכאל: שנה לפחות מתאריך ההתחלה. כל מפגש רביעי תרגול. בכל מסלול: שיעורים, השלמות, מבחן סיום וחלוקת תעודות בסוף.${
              trackIds.length > 1
                ? ' מסלולים מרובים נלמדים לפי הסדר — מסלול אחד בכל שבוע, ללא למידה במקביל.'
                : ''
            }`
          : endDateMode === 'auto'
            ? 'המערכת תחשב אוטומטית את תאריך הסיום לפי מספר השיעורים, ימי הלימוד והשעות, תוך דילוג על שבתות וחגים.'
            : 'במצב ידני: קודם בחר תאריכים וחלוקה, ואז המערכת תבנה את ימי הלימוד עבורך.'}
      </p>
    </section>
  );
}
