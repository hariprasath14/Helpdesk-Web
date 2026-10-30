import { expect, test } from '@playwright/test';
import { expectAccessible } from './fixtures';
import { PRODUCT_NAME } from '../src/product';

test.describe('app smoke test', () => {
  test('sends the main address to sign-up', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL('/signup');
    await expect(
      page.getByRole('heading', { name: `Create your ${PRODUCT_NAME} workspace` }),
    ).toBeVisible();
    await expectAccessible(page);
  });

  test('reaches the real API through the same address', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.ok()).toBe(true);
  });

  test('shows a not-found page for unknown addresses', async ({ page }) => {
    await page.goto('/no/such/page');

    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Go to the home page' }).click();
    await expect(page).toHaveURL('/signup');
    await expectAccessible(page);
  });

  test('sends no console errors while loading', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('/signup');
    await expect(page.getByRole('button', { name: 'Create workspace' })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('loads the Satoshi font', async ({ page }) => {
    await page.goto('/signup');
    // This callback runs in the browser.
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('16px Satoshi');
    });
    expect(loaded).toBe(true);
  });
});
