import { expect, test } from '@playwright/test';
import {
  expectAccessible,
  expectFitsPhone,
  findEmail,
  openComposer,
  signUpAndConfirm,
} from './fixtures';

/**
 * The ticket conversation against the real API and file storage: a reply with a file and a new
 * status, a private note with an @mention, a forward, and downloading the file. The worker emails
 * the reply and the forward (F13). Locally the API, the worker and Mailpit must be running.
 */
test.describe('ticket conversation', () => {
  test('an agent replies with a file, adds a note and forwards the ticket', async ({
    page,
    request,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);
    // Addresses of this run only, so emails from earlier runs never match.
    const customer = `neha.${owner.address}@acme-e2e.com`;
    const vendor = `payroll.${owner.address}@vendor-e2e.com`;
    const me = await page.request.get(`${owner.origin}/api/v1/me`);
    const { csrfToken } = (await me.json()) as { csrfToken: string };
    const created = await page.request.post(`${owner.origin}/api/v1/tickets`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        subject: 'Payslip missing',
        description: 'October payslip is not in the portal.',
        contact: { name: 'Neha Iyer', email: customer },
      },
    });
    expect(created.status(), await created.text()).toBe(200);

    // Settings → Email: the workspace address, and a test email to the admin.
    await page.goto(`${owner.origin}/settings/email`);
    const addressSection = page.getByRole('region', { name: 'Workspace email address' });
    await expect(addressSection).toContainText(`${owner.address}@`);
    await expectAccessible(page);
    await addressSection.getByRole('button', { name: 'Send me a test email' }).click();
    await expect(
      page.getByText(`Test email sent to ${owner.email}.`, { exact: true }),
    ).toBeVisible();
    const testEmail = await findEmail(request, owner.email, 'Test email from E2E Support');
    expect(testEmail.From.Address.startsWith(`${owner.address}@`)).toBe(true);
    await expectFitsPhone(page);

    await page.goto(`${owner.origin}/tickets/1`);
    const conversation = page.getByRole('region', { name: 'Conversation' });
    await expect(
      conversation.getByRole('article', { name: 'Neha Iyer raised the ticket' }),
    ).toContainText('October payslip');
    const composer = await openComposer(page);

    // Reply with a file and a new status.
    await composer.getByLabel('Message').fill('Here is the payslip. Please check.');
    await composer.getByLabel('Attach files').setInputFiles({
      name: 'payslip-october.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Net pay: 42,000'),
    });
    await expect(composer.getByRole('list', { name: 'Files to send' })).toContainText('1 KB');
    await composer.getByLabel('Then set status').selectOption('Waiting on customer');
    await expectAccessible(page);
    await composer.getByRole('button', { name: 'Send reply' }).click();
    const reply = conversation.getByRole('article', { name: 'Asha Rao replied' });
    await expect(reply).toContainText('Here is the payslip.');
    await expect(reply).toContainText('Sending');
    // The worker emails it from the workspace address, threaded to the ticket, with the file.
    const email = await findEmail(request, customer, 'Re: Payslip missing [#1]');
    expect(email.From.Name).toBe('E2E Support');
    expect(email.From.Address.startsWith(`${owner.address}@`)).toBe(true);
    expect(email.ReplyTo[0]?.Address).toMatch(/^e2e-[a-z0-9]+\+1-[0-9a-f]{12}@/);
    expect(email.Text).toContain('Here is the payslip. Please check.');
    expect(email.Text).toContain('> October payslip is not in the portal.');
    expect(email.Attachments.map((file) => file.FileName)).toEqual(['payslip-october.txt']);
    await expect(reply).toContainText('Sent', { timeout: 15_000 });
    await expect(page.getByText('Waiting on customer').first()).toBeVisible();

    // The file downloads as sent.
    const link = reply.getByRole('link', { name: /payslip-october.txt/ });
    const href = (await link.getAttribute('href')) ?? '';
    const download = await page.request.get(new URL(href, owner.origin).href);
    expect(download.status()).toBe(200);
    expect(await download.text()).toBe('Net pay: 42,000');
    expect(download.headers()['content-disposition']).toContain('attachment');

    // A private note with an @mention.
    await composer.getByRole('tab', { name: 'Private note' }).click();
    await composer.getByRole('textbox', { name: 'Note' }).fill('Checked with payroll, @Ash');
    await composer.getByRole('option', { name: 'Asha Rao' }).click();
    await composer.getByRole('button', { name: 'Add note' }).click();
    const note = conversation.getByRole('article', { name: 'Asha Rao added a private note' });
    await expect(note.getByText('@Asha Rao')).toBeVisible();

    // A forward.
    await composer.getByRole('tab', { name: 'Forward' }).click();
    await composer.getByRole('textbox', { name: 'To', exact: true }).fill(vendor);
    await composer.getByRole('textbox', { name: 'Message' }).fill('Can you confirm the amount?');
    await composer.getByRole('button', { name: 'Forward' }).click();
    await expect(
      conversation.getByRole('article', {
        name: `Asha Rao forwarded the ticket to ${vendor}`,
      }),
    ).toBeVisible();
    const forward = await findEmail(request, vendor, 'Fwd: Payslip missing [#1]');
    expect(forward.Text).toContain('Can you confirm the amount?');
    expect(forward.Text).toContain('> Here is the payslip. Please check.');
    await expectAccessible(page);
    await expectFitsPhone(page);
  });
});
