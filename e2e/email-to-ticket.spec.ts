import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  expectAccessible,
  expectFitsPhone,
  findEmail,
  mailpitUrl,
  openComposer,
  signUpAndConfirm,
} from './fixtures';

/** The domain of workspace addresses where the API runs (TICKET_EMAIL_DOMAIN). */
const ticketDomain = process.env.E2E_TICKET_EMAIL_DOMAIN ?? 'mail.helpdesk.local';

/** A customer's email, dropped into Mailpit as a mail server would deliver it. */
async function customerEmail(
  request: APIRequestContext,
  email: {
    from: string;
    to: string;
    subject: string;
    text: string;
    files?: { name: string; content: string }[];
  },
) {
  const response = await request.post(`${mailpitUrl}/api/v1/send`, {
    data: {
      From: { Email: email.from, Name: 'Neha Iyer' },
      To: [{ Email: email.to }],
      Subject: email.subject,
      Text: email.text,
      Attachments: (email.files ?? []).map((file) => ({
        Filename: file.name,
        Content: Buffer.from(file.content).toString('base64'),
      })),
    },
  });
  expect(response.status(), await response.text()).toBe(200);
}

/**
 * Email-to-ticket against the real API, worker and Mailpit: a customer's email becomes a ticket
 * with its file and is acknowledged (F15), the agent replies, the customer's answer lands on the
 * same ticket, and resolving it tells the customer. Locally the worker must run with
 * INBOUND_EMAIL_DRIVER=mailpit.
 */
test.describe('email to ticket', () => {
  test('a customer emails the workspace, gets a reply, and answers on the same ticket', async ({
    page,
    request,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    test.setTimeout(120_000);
    const owner = await signUpAndConfirm(page, request);
    const customer = `neha.${owner.address}@acme-e2e.com`;
    await customerEmail(request, {
      from: customer,
      to: `${owner.address}@${ticketDomain}`,
      subject: 'Printer offline in Chennai branch',
      text: 'The attendance printer shows error P-404 since today.',
      files: [{ name: 'error-log.txt', content: 'P-404 at 09:12' }],
    });

    // The worker picks it up within a few seconds.
    await expect(async () => {
      await page.goto(`${owner.origin}/tickets`);
      await expect(page.getByRole('link', { name: /Printer offline/ })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 60_000 });
    await page.getByRole('link', { name: /Printer offline/ }).click();
    await expect(page.getByText(/raised by Neha Iyer by email/)).toBeVisible();
    const conversation = page.getByRole('region', { name: 'Conversation' });
    const description = conversation.getByRole('article', { name: 'Neha Iyer raised the ticket' });
    await expect(description).toContainText('error P-404');
    await expect(description.getByRole('link', { name: /error-log.txt/ })).toBeVisible();
    await expectAccessible(page);

    // The customer is told their request arrived, with the ticket number.
    const received = await findEmail(
      request,
      customer,
      'Re: Printer offline in Chennai branch [#1]',
      'Your ticket number is #1',
    );
    expect(received.From.Name).toBe('E2E Support');

    // The agent replies; the customer gets it with the signed reply address.
    const composer = await openComposer(page);
    await composer.getByLabel('Message').fill('Please restart the printer and tell us.');
    await composer.getByLabel('Then set status').selectOption('Waiting on customer');
    await composer.getByRole('button', { name: 'Send reply' }).click();
    const reply = await findEmail(
      request,
      customer,
      'Re: Printer offline in Chennai branch',
      'Please restart the printer',
    );
    const replyTo = reply.ReplyTo[0]?.Address ?? '';
    expect(replyTo.startsWith(`${owner.address}+1-`)).toBe(true);

    // The customer answers above the quoted email.
    await customerEmail(request, {
      from: customer,
      to: replyTo,
      subject: 'Re: Printer offline in Chennai branch [#1]',
      text: `Restarted, it works now.\n\nOn Tue, E2E Support wrote:\n> ${reply.Text.split('\n')[0] ?? ''}\n> Please restart the printer`,
    });
    const answer = conversation.getByRole('article', { name: 'Neha Iyer replied by email' });
    await expect(async () => {
      await page.reload();
      await expect(answer).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
    await expect(answer).toContainText('Restarted, it works now.');
    await expect(answer).not.toContainText('Please restart the printer');
    await expect(page.getByText('Open').first()).toBeVisible();
    await expectAccessible(page);
    await expectFitsPhone(page);

    // Words inside the ticket are searchable.
    await page.goto(`${owner.origin}/tickets`);
    await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('p-404');
    await expect(page.getByRole('link', { name: /Printer offline/ })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('restarted');
    await expect(page.getByRole('link', { name: /Printer offline/ })).toBeVisible();
    // Resolving it tells the customer.
    const me = await page.request.get(`${owner.origin}/api/v1/me`);
    const { csrfToken } = (await me.json()) as { csrfToken: string };
    const resolved = await page.request.patch(`${owner.origin}/api/v1/tickets/1`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { status: 'resolved' },
    });
    expect(resolved.status(), await resolved.text()).toBe(200);
    await findEmail(request, customer, 'Printer offline', 'as resolved');
  });
});
