import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 12;
const CONTENT_WIDTH_MM = A4_WIDTH_MM - MARGIN_MM * 2;
const CONTENT_HEIGHT_MM = A4_HEIGHT_MM - MARGIN_MM * 2;

export async function exportPagesToPdf(
  pageElements: HTMLElement[],
  fileName: string,
): Promise<void> {
  if (!pageElements.length) return;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  for (let i = 0; i < pageElements.length; i += 1) {
    if (i > 0) {
      pdf.addPage();
    }

    const page = pageElements[i];
    const canvas = await html2canvas(page, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: page.offsetWidth,
      height: page.offsetHeight,
      windowWidth: page.offsetWidth,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgHeightMm = (canvas.height * CONTENT_WIDTH_MM) / canvas.width;
    const drawHeight = Math.min(imgHeightMm, CONTENT_HEIGHT_MM);
    const drawWidth =
      imgHeightMm > CONTENT_HEIGHT_MM
        ? (CONTENT_WIDTH_MM * CONTENT_HEIGHT_MM) / imgHeightMm
        : CONTENT_WIDTH_MM;
    const offsetX = MARGIN_MM + (CONTENT_WIDTH_MM - drawWidth) / 2;

    pdf.addImage(imgData, 'JPEG', offsetX, MARGIN_MM, drawWidth, drawHeight, undefined, 'FAST');
  }

  pdf.save(fileName);
}
