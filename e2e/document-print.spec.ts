import { test, expect } from '@playwright/test';
import {
  A4_HEIGHT_PX,
  createMultiPageDocument,
  getTableColumnWidths,
} from './helpers';

test.describe('מסמך הדפסה', () => {
  test.beforeEach(async ({ page }) => {
    await createMultiPageDocument(page);
  });

  test('נוצרים מספר עמודים עם מספיק תוכן בכל עמוד', async ({ page }) => {
    const pages = page.locator('[data-testid^="pdf-page-"]');
    const pageCount = await pages.count();

    expect(pageCount).toBeGreaterThan(1);
    expect(pageCount).toBeLessThan(12);

    for (let i = 0; i < pageCount; i += 1) {
      const pdfPage = page.getByTestId(`pdf-page-${i}`);
      const box = await pdfPage.boundingBox();
      expect(box).not.toBeNull();

      const fillRatio = box!.height / A4_HEIGHT_PX;
      const minFill = i === 0 ? 0.25 : 0.38;
      const maxHeight = i === 0 ? A4_HEIGHT_PX * 1.15 : A4_HEIGHT_PX * 1.06;

      expect(fillRatio).toBeGreaterThan(minFill);
      expect(box!.height).toBeLessThan(maxHeight);
    }
  });

  test('דפי המשך ללא כותרת המשך ועם מבנה אחיד', async ({ page }) => {
    await expect(page.getByText('מערכת שעות (המשך)')).toHaveCount(0);

    const pages = page.locator('[data-testid^="pdf-page-"]');
    const pageCount = await pages.count();

    await expect(page.getByText('מערכת שעות:')).toHaveCount(1);

    for (let i = 1; i < pageCount; i += 1) {
      const continuationPage = page.getByTestId(`pdf-page-${i}`);
      await expect(continuationPage.locator('.doc-header-compact')).toBeVisible();
      await expect(continuationPage.locator('.schedule-print-table thead')).toBeVisible();
      await expect(continuationPage.locator('.schedule-title')).toHaveCount(0);
    }

    await expect(page.locator('.pdf-page-footer')).toHaveCount(0);
  });

  test('רוחב עמודות הטבלה זהה בין כל הדפים', async ({ page }) => {
    const tables = page.locator('[data-testid="schedule-print-table"]');
    const tableCount = await tables.count();
    expect(tableCount).toBeGreaterThan(1);

    const firstWidths = await getTableColumnWidths(page, 0);

    for (let i = 1; i < tableCount; i += 1) {
      const widths = await getTableColumnWidths(page, i);
      expect(widths).toHaveLength(firstWidths.length);

      for (let col = 0; col < firstWidths.length; col += 1) {
        expect(Math.abs(widths[col] - firstWidths[col])).toBeLessThan(4);
      }
    }
  });

  test('עמוד ראשון כולל פרטי סטודנט ומערכת שעות', async ({ page }) => {
    const firstPage = page.getByTestId('pdf-page-0');

    await expect(firstPage.locator('.doc-student-banner')).toBeVisible();
    await expect(firstPage.getByText('מערכת שעות:')).toBeVisible();
    await expect(firstPage.locator('.doc-header-print:not(.doc-header-compact)')).toBeVisible();
  });

  test('צילום מסך לעמוד ראשון ודף המשך', async ({ page }) => {
    await expect(page.getByTestId('pdf-page-0')).toHaveScreenshot('pdf-page-first.png', {
      maxDiffPixelRatio: 0.02,
    });

    const pageCount = await page.locator('[data-testid^="pdf-page-"]').count();
    if (pageCount > 1) {
      await expect(page.getByTestId('pdf-page-1')).toHaveScreenshot('pdf-page-continuation.png', {
        maxDiffPixelRatio: 0.02,
      });
    }
  });
});
