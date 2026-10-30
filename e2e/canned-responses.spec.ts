import { expect, test } from '@playwright/test';
import { expectAccessible, expectFitsPhone, openComposer, signUpAndConfirm } from './fixtures';

/**
 * Canned responses against the real API: an admin saves "Password reset steps" with a placeholder
 * in Settings, then drops it into a reply on a ticket, filled in with the requester's first name.
 */
test.describe('canned responses', () => {
  test('an admin saves a canned response and uses it in a reply', async ({
    page,
    request,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);

    await page.goto(`${owner.origin}/settings/canned-responses`);
    await expect(page.getByText('No canned responses yet')).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('button', { name: 'New canned response' }).click();
    const drawer = page.getByRole('dialog', { name: 'New canned response' });
    await drawer.getByLabel(/^Title/).fill('Password reset steps');
    await drawer.getByLabel(/^Text/).fill('Hi ');
    await drawer
      .getByLabel('Insert a placeholder')
      .selectOption({ label: "Requester's first name" });
    await drawer.getByLabel(/^Text/).press('End');
    await drawer
      .getByLabel(/^Text/)
      .pressSequentially(', open Settings and choose Reset password.');
    await drawer.getByRole('checkbox', { name: /Share with everyone/ }).check();
    await expectAccessible(page);
    await drawer.getByRole('button', { name: 'Add canned response' }).click();
    await expect(
      page.getByText('Canned response Password reset steps added.', { exact: true }),
    ).toBeVisible();
    const list = page.getByRole('list', { name: 'Canned responses' });
    await expect(list).toContainText('Hi {{contact.first_name}}, open Settings');
    await expect(list).toContainText('Shared');
    await expectFitsPhone(page);

    const me = await page.request.get(`${owner.origin}/api/v1/me`);
    const { csrfToken } = (await me.json()) as { csrfToken: string };
    const created = await page.request.post(`${owner.origin}/api/v1/tickets`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        subject: 'Locked out',
        contact: { name: 'Neha Iyer', email: `neha.${owner.address}@acme-e2e.com` },
      },
    });
    expect(created.status(), await created.text()).toBe(200);
    const { number } = (await created.json()) as { number: number };

    await page.goto(`${owner.origin}/tickets/${String(number)}`);
    const composer = await openComposer(page);
    await composer.getByRole('button', { name: 'Canned response' }).click();
    const picker = page.getByRole('dialog', { name: 'Canned responses' });
    await picker.getByLabel('Search canned responses').fill('reset');
    await expectAccessible(page);
    await picker.getByRole('button', { name: /Password reset steps/ }).click();
    await expect(composer.getByLabel('Message')).toHaveValue(
      'Hi Neha, open Settings and choose Reset password.',
    );
  });
});
