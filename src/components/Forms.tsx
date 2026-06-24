import { useEffect, useMemo, useState } from 'react';
import { TRACKS } from '../data/tracks';
import type { EndDateMode, TimeSlot } from '../types';
import { DAY_NAMES } from '../types';
import {
  buildTimeSlotsFromDistribution,
  getDistributionOptions,
  getDistributionSummary,
  getPeriodStats,
  type DistributionOption,
} from '../utils/distributionPlanner';
import type { ScheduleFitStatus } from '../utils/scheduleRecommendations';

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
  timeSlots: TimeSlot[];
  scheduleFit: ScheduleFitStatus | null;
  onStartDateChange: (v: string) => void;
  onEndDateModeChange: (mode: EndDateMode) => void;
  onManualEndDateChange: (v: string) => void;
  onTimeSlotsChange: (slots: TimeSlot[]) => void;
}

const DEFAULT_START = '09:00';
const DEFAULT_END = '12:00';
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
  timeSlots,
  scheduleFit,
  onStartDateChange,
  onEndDateModeChange,
  onManualEndDateChange,
  onTimeSlotsChange,
}: ScheduleBuilderProps) {
  const [newDay, setNewDay] = useState(0);
  const [newStart, setNewStart] = useState(DEFAULT_START);
  const [newEnd, setNewEnd] = useState(DEFAULT_END);

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
    endDateMode === 'manual' && startDate && manualEndDate && trackIds.length > 0 && periodStats;

  useEffect(() => {
    if (endDateMode === 'auto') {
      setDistributionApplied(false);
      setSelectedOptionId(null);
    }
  }, [endDateMode]);

  useEffect(() => {
    setDistributionApplied(false);
    setSelectedOptionId(null);
    onTimeSlotsChange([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset slots when period inputs change
  }, [manualEndDate, startDate, trackIds.join(',')]);

  useEffect(() => {
    if (distributionOptions.length > 0) {
      const best = distributionOptions[0];
      setSelectedOptionId(best.id);
      setSessionsPerWeek(best.sessionsPerWeek);
      setHoursPerSession(best.hoursPerSession);
      setSelectedDays(best.recommendedDays);
    }
  }, [distributionOptions]);

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
      return [...prev, day].sort((a, b) => a - b);
    });
  };

  const applyDistribution = () => {
    if (selectedDays.length === 0) return;
    const slots = buildTimeSlotsFromDistribution(selectedDays, hoursPerSession, DEFAULT_START);
    onTimeSlotsChange(slots);
    setDistributionApplied(true);
  };

  const handleModeChange = (mode: EndDateMode) => {
    onEndDateModeChange(mode);
    onTimeSlotsChange([]);
    setDistributionApplied(false);
    setSelectedOptionId(null);
  };

  const addSlot = () => {
    const exists = timeSlots.some(
      (s) =>
        s.dayOfWeek === newDay &&
        s.startTime === newStart &&
        s.endTime === newEnd,
    );
    if (exists) return;

    onTimeSlotsChange([
      ...timeSlots,
      { dayOfWeek: newDay, startTime: newStart, endTime: newEnd },
    ]);
    setDistributionApplied(false);
  };

  const removeSlot = (index: number) => {
    onTimeSlotsChange(timeSlots.filter((_, i) => i !== index));
    setDistributionApplied(false);
  };

  return (
    <section className="card">
      <h2>מערכת שעות לימוד</h2>

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
        {endDateMode === 'auto' ? (
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
                  {[2, 3, 4, 5, 6, 7, 8].map((n) => (
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

      {(endDateMode === 'auto' || distributionApplied) && (
        <>
          <div className="slot-builder">
            <h3>{endDateMode === 'manual' ? 'עדכון ימים ושעות (אופציונלי)' : 'הוספת יום ושעות לימוד'}</h3>
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
                  onChange={(e) => setNewStart(e.target.value)}
                  dir="ltr"
                />
              </label>
              <label>
                עד שעה
                <input
                  type="time"
                  value={newEnd}
                  onChange={(e) => setNewEnd(e.target.value)}
                  dir="ltr"
                />
              </label>
              <button type="button" className="btn btn-secondary" onClick={addSlot}>
                + הוסף
              </button>
            </div>
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
        {endDateMode === 'auto'
          ? 'המערכת תחשב אוטומטית את תאריך הסיום לפי מספר השיעורים, ימי הלימוד והשעות, תוך דילוג על שבתות וחגים.'
          : 'במצב ידני: קודם בחר תאריכים וחלוקה, ואז המערכת תבנה את ימי הלימוד עבורך.'}
      </p>
    </section>
  );
}
