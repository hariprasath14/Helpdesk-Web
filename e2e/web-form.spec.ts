import { expect, test } from '@playwright/test';
import { expectAccessible, expectFitsPhone, findEmail, signUpAndConfirm } from './fixtures';

/**
 * The web form against the real API, worker and Mailpit: an admin turns it on, a customer (no
 * sign-in) sends a request, gets the "request received" email, and the team sees the ticket.
 */
test.describe('web form', () => {
  test('an admin turns the form on and a customer sends a request through it', async ({
    page,
    browser,
    request,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    test.setTimeout(90_000);
    const owner = await signUpAndConfirm(page, request);

    await page.goto(`${owner.origin}/settings/web-form`);
    await page.getByRole('switch', { name: /Show the web form/ }).click();
    await expect(page.getByText('Web form saved.', { exact: true })).toBeVisible();
    const text = page.getByRole('region', { name: 'Text' });
    await text.getByLabel(/^Introduction/).fill('We answer within one working day.');
    await text.getByRole('button', { name: 'Save text' }).click();
    await expect(page.getByText('Web form text saved.', { exact: true })).toBeVisible();
    const share = page.getByRole('region', { name: 'Share it' });
    await expect(share.getByLabel('Embed code')).toHaveValue(/<iframe src="http.*\/support"/);
    await expectAccessible(page);
    await expectFitsPhone(page);

    // A customer, not signed in.
    const visitor = await browser.newContext();
    const form = await visitor.newPage();
    await form.goto(`${owner.origin}/support`);
    await expect(form.getByRole('heading', { name: 'Contact support' })).toBeVisible();
    await expect(form.getByText('We answer within one working day.')).toBeVisible();
    await expectAccessible(form);
    await expectFitsPhone(form);
    const customer = `ravi.${owner.address}@acme-e2e.com`;
    await form.getByLabel(/^Your name/).fill('Ravi Kumar');
    await form.getByLabel(/^Email/).fill(customer);
    await form.getByLabel(/^Subject/).fill('Leave balance looks wrong');
    await form.getByLabel(/^How can we help/).fill('It shows 0 days since the update.');
    await form.getByRole('button', { name: 'Send request' }).click();
    await expect(form.getByText('Request sent')).toBeVisible();
    await visitor.close();

    await findEmail(
      request,
      customer,
      'Leave balance looks wrong [#1]',
      'Your ticket number is #1',
    );
    await page.goto(`${owner.origin}/tickets/1`);
    await expect(page.getByText(/raised by Ravi Kumar through the web form/)).toBeVisible();
    await expect(page.getByRole('article', { name: 'Ravi Kumar raised the ticket' })).toContainText(
      'It shows 0 days since the update.',
    );
  });
});
