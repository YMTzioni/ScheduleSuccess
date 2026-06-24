import type { ScheduledSession } from '../types';
import { formatDayLetter } from '../types';

interface PrintScheduleTableProps {
  sessions: ScheduledSession[];
  showHeader: boolean;
  pageIndex: number;
  formatDateShort: (dateStr: string) => string;
  formatTimeRange: (start: string, end: string) => string;
  formatSessionTracks: (session: { lessonItems: { trackName: string }[] }) => string;
}

export function PrintScheduleTable({
  sessions,
  showHeader,
  pageIndex,
  formatDateShort,
  formatTimeRange,
  formatSessionTracks,
}: PrintScheduleTableProps) {
  return (
    <div className="schedule-table-wrap">
      <table className="schedule-print-table" data-testid="schedule-print-table">
        <colgroup>
          <col className="col-date" />
          <col className="col-day" />
          <col className="col-time" />
          <col className="col-track" />
          <col className="col-lesson" />
        </colgroup>
        {showHeader && (
          <thead>
            <tr>
              <th>תאריך</th>
              <th>יום</th>
              <th>שעות</th>
              <th>מסלול</th>
              <th>נושא שיעור</th>
            </tr>
          </thead>
        )}
        <tbody>
          {sessions.map((session, i) => (
            <tr key={`${pageIndex}-${session.date}-${session.startTime}-${i}`}>
              <td className="cell-date" dir="ltr">
                {formatDateShort(session.date)}
              </td>
              <td className="cell-day">{formatDayLetter(session.dayOfWeek)}</td>
              <td className="cell-time" dir="ltr">
                {formatTimeRange(session.startTime, session.endTime)}
              </td>
              <td className="track-name-cell">{formatSessionTracks(session)}</td>
              <td className="lesson-cell">
                {session.lessonItems.length === 1 ? (
                  <span className="lesson-text">{session.lessonItems[0].title}</span>
                ) : (
                  <ul className="session-lessons-list">
                    {session.lessonItems.map((item, j) => (
                      <li key={`${pageIndex}-${i}-${j}`}>{item.title}</li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
