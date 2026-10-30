import { expect, test } from '@playwright/test';
import { expectAccessible } from './fixtures';

// The design preview is on locally and in dev (VITE_DESIGN_PREVIEW=true). These checks run every
// shared component and state through axe at desktop and phone width.

test.describe('design system', () => {
  test('every component passes accessibility checks, in both brand colours', async ({ page }) => {
    await page.goto('/design');
    await expect(page.getByRole('heading', { name: 'Design preview' })).toBeVisible();
    await expectAccessible(page);

    await page.getByText('Ocean Cyan').click();
    await expect(page.locator('html')).toHaveAttribute('data-brand', 'ocean-cyan');
    await page.waitForTimeout(300); // let colour transitions finish before measuring contrast
    await expectAccessible(page);
  });

  test('dialogs and drawers trap focus and close with Escape', async ({ page }) => {
    await page.goto('/design');

    await page.getByRole('button', { name: 'Confirm dialog' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete 3 tickets?' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expectAccessible(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Side drawer' }).click();
    const drawer = page.getByRole('dialog', { name: 'New ticket' });
    await expect(drawer).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  for (const state of ['content', 'loading', 'empty', 'error', 'no-access']) {
    test(`app shell, ${state} state`, async ({ page }) => {
      await page.goto(`/design/shell?state=${state}`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('All tickets');
      await expectAccessible(page);
    });
  }

  test('the sidebar collapses and the choice is remembered', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Phones use the slide-in menu instead');
    await page.goto('/design/shell');

    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
    await page.getByRole('link', { name: 'Contacts' }).hover();
    await expect(page.getByRole('tooltip')).toContainText('Contacts');
    await expectAccessible(page);
  });

  test('phones get a slide-in menu and a floating New button', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Desktop shows the sidebar');
    await page.goto('/design/shell');

    await page.getByRole('button', { name: 'Open menu' }).click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Ticket' })).toBeVisible();
  });
});
