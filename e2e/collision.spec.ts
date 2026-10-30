import { expect, test } from '@playwright/test';
import { csrfOf, expectAccessible, joinAs, openComposer, signUpAndConfirm } from './fixtures';

/**
 * Collision detection against the real API, with two people on one ticket: each sees the other,
 * the owner sees the agent replying, and after the agent's reply the owner is warned before
 * sending theirs (and can send anyway). When the agent leaves, they drop off.
 */
test.describe('collision detection', () => {
  test('two people on one ticket see each other and avoid replying twice', async ({
    page,
    request,
    browser,
  }, testInfo) => {
    // One real sign-up per run: the API allows 5 sign-ups an hour from one network.
    test.skip(testInfo.project.name !== 'desktop', 'runs once, on desktop');
    const owner = await signUpAndConfirm(page, request);
    const agent = await joinAs(owner, page, request, browser, { name: 'Neha Iyer' });
    const created = await page.request.post(`${owner.origin}/api/v1/tickets`, {
      headers: { 'x-csrf-token': await csrfOf(page, owner.origin) },
      data: {
        subject: 'Payslip missing',
        contact: { name: 'Arjun Mehta', email: `arjun.${owner.address}@acme-e2e.com` },
      },
    });
    expect(created.status(), await created.text()).toBe(200);
    const { number } = (await created.json()) as { number: number };
    const path = `${owner.origin}/tickets/${String(number)}`;

    await page.goto(path);
    await agent.page.goto(path);
    await expect(page.getByText('Also viewing: Neha Iyer')).toBeVisible();
    await expect(agent.page.getByText('Also viewing: Asha Rao')).toBeVisible();

    const theirs = await openComposer(agent.page);
    await theirs.getByLabel('Message').fill('We have fixed your payslip.');
    await expect(page.getByText('Neha Iyer is replying…')).toBeVisible();
    await expectAccessible(page);

    const mine = await openComposer(page);
    await mine.getByLabel('Message').fill('Looking into it now.');
    await theirs.getByRole('button', { name: 'Send reply' }).click();
    await expect(
      agent.page.getByText('Reply added. It is being emailed.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Neha Iyer is replying…')).toBeHidden();

    await mine.getByRole('button', { name: 'Send reply' }).click();
    const warning = mine.getByRole('alert');
    await expect(warning).toContainText(/Neha Iyer replied .*\. Check it before you send yours\./);
    await expectAccessible(page);
    await warning.getByRole('button', { name: 'Send anyway' }).click();
    await expect(
      page.getByText('Reply added. It is being emailed.', { exact: true }),
    ).toBeVisible();

    await agent.context.close();
    await expect(page.getByText('Also viewing: Neha Iyer')).toBeHidden();
  });
});
