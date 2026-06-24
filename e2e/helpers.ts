import type { Page } from '@playwright/test';

/** גובה A4 בערך ב-96dpi */
export const A4_HEIGHT_PX = 1123;

export async function fillStudentForm(page: Page) {
  await page.getByLabel('שם מלא').fill('בדיקה אוטומטית');
  await page.getByLabel('תעודת זהות').fill('123456789');
  await page.getByLabel('סכום עסקה (₪)').fill('15000');
}

export async function addTrack(page: Page, trackName: string) {
  await page.getByRole('button', { name: new RegExp(`\\+ .*${trackName}`) }).click();
}

export async function addWeeklySlots(page: Page) {
  const slotForm = page.locator('.slot-form');
  const endTime = slotForm.locator('input[type="time"]').nth(1);

  await endTime.fill('13:00');
  await page.getByRole('button', { name: '+ הוסף' }).click();

  await slotForm.locator('select').first().selectOption('3');
  await endTime.fill('13:00');
  await page.getByRole('button', { name: '+ הוסף' }).click();
}

export async function createMultiPageDocument(page: Page) {
  await page.goto('/');

  await fillStudentForm(page);
  await addTrack(page, 'AI Pro');
  await page.getByLabel('תאריך התחלה').fill('2026-01-05');
  await addWeeklySlots(page);

  await page.getByTestId('create-document-btn').click();
  await page.getByTestId('pdf-page-0').waitFor({ state: 'visible' });
}

export async function getTableColumnWidths(page: Page, tableIndex: number) {
  return page
    .locator('[data-testid="schedule-print-table"]')
    .nth(tableIndex)
    .locator('thead th')
    .evaluateAll((ths) => ths.map((th) => th.getBoundingClientRect().width));
}
