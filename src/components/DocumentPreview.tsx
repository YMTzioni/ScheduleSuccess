import { useMemo, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import type { StudentDocument } from '../types';
import { TRACKS } from '../data/tracks';
import { buildPdfPages } from '../utils/pdfPages';
import { exportPagesToPdf } from '../utils/pdfExport';
import { PrintScheduleTable } from './PrintScheduleTable';
import logoUrl from '../assets/logo.png';
import signatureUrl from '../assets/signature.png';

interface DocumentPreviewProps {
  document: StudentDocument;
}

function formatDateShort(dateStr: string): string {
  return format(parseISO(dateStr), 'dd/MM/yyyy');
}

function formatDateHe(dateStr: string): string {
  return format(parseISO(dateStr), 'd בMMMM yyyy', { locale: he });
}

function formatTimeRange(start: string, end: string): string {
  return `${start.slice(0, 5)}-${end.slice(0, 5)}`;
}

function formatSessionTracks(session: { lessonItems: { trackName: string }[] }): string {
  const tracks = [...new Set(session.lessonItems.map((l) => l.trackName))];
  return tracks.join(' / ');
}

function formatTrackDisplayName(track: (typeof TRACKS)[number]): string {
  return track.name;
}

function formatTracksTitle(tracks: (typeof TRACKS)[number][]): string {
  const names = tracks.map(formatTrackDisplayName);
  if (names.length === 1) {
    return `מסלול לימודים - ${names[0]}`;
  }
  return `מסלול לימודים משולב - ${names.join(', ')}`;
}

export function DocumentPreview({ document }: DocumentPreviewProps) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const selectedTracks = document.trackIds
    .map((id) => TRACKS.find((t) => t.id === id))
    .filter((t): t is (typeof TRACKS)[number] => Boolean(t));

  const tracksTitle = formatTracksTitle(selectedTracks);

  const pdfPages = useMemo(() => {
    const totalDescriptionChars = selectedTracks.reduce(
      (sum, track) => sum + track.description.length,
      0,
    );
    return buildPdfPages(document.sessions, {
      trackCount: selectedTracks.length,
      totalDescriptionChars,
    });
  }, [document.sessions, document.trackIds]);

  const exportPdf = async () => {
    if (!pagesRef.current) return;

    const pageElements = Array.from(
      pagesRef.current.querySelectorAll<HTMLElement>('.pdf-page'),
    );

    const fileName = `${document.fullName || 'סטודנט'}_מערכת_שעות.pdf`;
    await exportPagesToPdf(pageElements, fileName);
  };

  if (!document.fullName && !document.sessions.length) {
    return null;
  }

  return (
    <section className="card preview-section">
      <div className="preview-header">
        <h2>תצוגה מקדימה – מסמך להדפסה (A4)</h2>
        <div className="preview-actions">
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            הדפסה
          </button>
          <button type="button" className="btn btn-primary" onClick={exportPdf}>
            הורד PDF
          </button>
        </div>
      </div>

      <div className="pdf-pages-container" ref={pagesRef} data-testid="pdf-pages-container">
        {pdfPages.map((page, pageIndex) => (
          <div
            key={pageIndex}
            className={`pdf-page${page.showCompactHeader ? ' pdf-page-continuation' : ''}`}
            dir="rtl"
            data-testid={`pdf-page-${pageIndex}`}
          >
            <div className="pdf-page-accent" aria-hidden="true" />

            <div className="pdf-page-body">
            {page.showHeader && (
              <header className="doc-header-print">
                <img src={logoUrl} alt="מכללת סאקסס" className="doc-logo-img" />
              </header>
            )}

            {page.showCompactHeader && (
              <header className="doc-header-print doc-header-compact">
                <img src={logoUrl} alt="מכללת סאקסס" className="doc-logo-img" />
              </header>
            )}

            {page.showStudent && (
              <div className="doc-student-banner">
                <div className="student-field">
                  <span className="field-label">שם הסטודנט:</span>
                  <span className="field-value">{document.fullName}</span>
                </div>
                <div className="student-field">
                  <span className="field-label">תעודת זהות:</span>
                  <span className="field-value" dir="ltr">
                    {document.idNumber}
                  </span>
                </div>
                <div className="student-field">
                  <span className="field-label">סכום עסקה:</span>
                  <span className="field-value">
                    {document.amountNis.toLocaleString('he-IL')} ₪
                  </span>
                </div>
                <div className="student-field">
                  <span className="field-label">תאריך הנפקה:</span>
                  <span className="field-value">
                    {formatDateHe(document.documentDate)}
                  </span>
                </div>
              </div>
            )}

            {page.showTracks && (
              <section className="doc-tracks-intro">
                <h2 className="tracks-title">{tracksTitle}</h2>
                <div className="track-list">
                  {selectedTracks.map((track) => (
                    <div key={track.id} className="track-description-block">
                      <h3>{track.name}</h3>
                      <p>{track.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {(page.showScheduleTitle || page.sessions.length > 0) && (
              <section
                className={`doc-schedule-section${page.showCompactHeader ? ' doc-schedule-continuation' : ''}`}
              >
                {page.showScheduleTitle && (
                  <h2 className="schedule-title">מערכת שעות:</h2>
                )}

                {page.sessions.length === 0 ? (
                  page.showScheduleTitle && <p>לא הוגדרו שיעורים בתקופה זו.</p>
                ) : (
                  <PrintScheduleTable
                    sessions={page.sessions}
                    showHeader={page.showTableHeader}
                    pageIndex={pageIndex}
                    formatDateShort={formatDateShort}
                    formatTimeRange={formatTimeRange}
                    formatSessionTracks={formatSessionTracks}
                  />
                )}
              </section>
            )}

            {page.showSignature && (
              <footer className="doc-signature-footer">
                <img
                  src={signatureUrl}
                  alt="חתימת מכללת סאקסס"
                  className="signature-img"
                />
                <p className="signature-caption">מכללת סאקסס</p>
              </footer>
            )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
