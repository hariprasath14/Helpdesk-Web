import { createHmac } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * The 6-digit code an authenticator app shows for a setup key (RFC 6238: SHA-1, 30-second steps),
 * `stepsAhead` steps from now. Each code works once, so later sign-ins use later steps.
 */
export function authenticatorCode(setupKey: string, stepsAhead = 0): string {
  let bits = '';
  for (const char of setupKey.replace(/[\s=]/g, '').toUpperCase()) {
    bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  }
  const key = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < key.length; i += 1)
    key.writeUInt8(parseInt(bits.slice(i * 8, i * 8 + 8), 2), i);

  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + stepsAhead));
  const hash = createHmac('sha1', key).update(counter).digest();
  const offset = hash.readUInt8(hash.length - 1) & 0x0f;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

/**
 * Fails the test if the page has accessibility problems at WCAG 2.1 AA level (contrast, labels,
 * roles, keyboard). Call it on every screen after it has finished loading.
 */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const problems = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`,
  );
  expect(problems, 'accessibility problems').toEqual([]);
}

/** Fails if the page scrolls sideways (every screen must fit a phone). */
export async function expectNoSideScroll(page: Page) {
  // This callback runs in the browser.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/**
 * Settings → a settings page, through the overview's tiles (they show at every screen size; the
 * menu beside them only on wider screens). The tiles sit in one section per group.
 */
export async function openSettings(page: Page, label: string) {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('region')
    .getByRole('link')
    .filter({ has: page.getByText(label, { exact: true }) })
    .click();
}

/** Ticket list → a view: the views open from the page title, which names the current one. */
export async function chooseView(page: Page, name: string) {
  await page.getByRole('heading', { level: 1 }).getByRole('button').click();
  await page
    .getByRole('navigation', { name: 'Views' })
    .getByRole('button', { name, exact: true })
    .click();
}

/** A ticket's reply bar → the composer (Step 5b): Reply, Note or Forward. */
export async function openComposer(page: Page, start: 'Reply' | 'Note' | 'Forward' = 'Reply') {
  await page
    .getByRole('group', { name: 'Write on this ticket' })
    .getByRole('button', { name: start, exact: true })
    .click();
  return page.getByRole('region', { name: 'Write' });
}

/** Every screen must fit a phone: checks it at phone width, then goes back. */
export async function expectFitsPhone(page: Page) {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoSideScroll(page);
  await expectAccessible(page);
  if (size) await page.setViewportSize(size);
}

/** Where emails arrive locally (Mailpit). */
export const mailpitUrl = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';

/** The app's own domain under test ("localhost" locally, the dev domain on dev). */
export const appDomain = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:5173').hostname;

/**
 * The newest link to `pathname` (for example "/verify-email") in an email to `to`, read from
 * Mailpit's API. Waits up to 15 seconds for the email to arrive.
 */
export async function findEmailLink(
  request: APIRequestContext,
  to: string,
  pathname: string,
): Promise<string> {
  const linkTo = (text: string) =>
    text.match(/https?:\/\/\S+\?token=[\w-]+/g)?.find((url) => new URL(url).pathname === pathname);
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(`${mailpitUrl}/api/v1/search`, {
          params: { query: `to:"${to}"` },
        });
        const { messages } = (await search.json()) as { messages: { ID: string }[] };
        // Newest first: the latest email with this kind of link wins.
        for (const { ID } of messages.slice(0, 5)) {
          const message = await request.get(`${mailpitUrl}/api/v1/message/${ID}`);
          const { Text } = (await message.json()) as { Text: string };
          link = linkTo(Text);
          if (link) return link;
        }
        return undefined;
      },
      { message: `email to ${to} with a ${pathname} link`, timeout: 15_000 },
    )
    .toBeDefined();
  return link ?? '';
}

/** An email as Mailpit shows it. */
export interface MailpitEmail {
  Subject: string;
  From: { Name: string; Address: string };
  ReplyTo: { Address: string }[];
  Text: string;
  Attachments: { FileName: string }[];
}

/**
 * The newest email to `to` whose subject contains `subject` (and whose text contains `text`, when
 * given), read from Mailpit's API. Waits up to 30 seconds (the worker sends in the background).
 */
export async function findEmail(
  request: APIRequestContext,
  to: string,
  subject: string,
  text?: string,
): Promise<MailpitEmail> {
  let found: MailpitEmail | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(`${mailpitUrl}/api/v1/search`, {
          params: { query: `to:"${to}"` },
        });
        const { messages } = (await search.json()) as {
          messages: { ID: string; Subject: string }[];
        };
        for (const match of messages.filter((message) => message.Subject.includes(subject))) {
          const message = await request.get(`${mailpitUrl}/api/v1/message/${match.ID}`);
          const email = (await message.json()) as MailpitEmail;
          if (text === undefined || email.Text.includes(text)) {
            found = email;
            return found;
          }
        }
        return undefined;
      },
      { message: `email to ${to} about "${subject}"`, timeout: 30_000 },
    )
    .toBeDefined();
  if (!found) throw new Error('no email');
  return found;
}

export const E2E_PASSWORD = 'quiet-harbour-lantern-41';

/**
 * A confirmed workspace with its owner signed in, created through the real API and email
 * (sign-up, then the confirmation link). Counts toward the API's 5 sign-ups an hour.
 */
export async function signUpAndConfirm(page: Page, request: APIRequestContext) {
  const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;
  const owner = {
    name: 'Asha Rao',
    email: `e2e-${stamp}@example.test`,
    password: E2E_PASSWORD,
    companyName: 'E2E Support',
    address: `e2e-${stamp}`,
  };
  const response = await request.post('/api/v1/signup', {
    data: {
      name: owner.name,
      email: owner.email,
      password: owner.password,
      companyName: owner.companyName,
      workspaceAddress: owner.address,
      timezone: 'Asia/Kolkata',
      acceptTerms: true,
    },
  });
  expect(response.status(), await response.text()).toBe(202);
  const link = await findEmailLink(request, owner.email, '/verify-email');
  await page.goto(link);
  await expect(
    page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Asha$/ }),
  ).toBeVisible();
  return { ...owner, origin: new URL(link).origin };
}

/** The CSRF token of the page's session, for calling the API from a test. */
export async function csrfOf(page: Page, origin: string): Promise<string> {
  const me = await page.request.get(`${origin}/api/v1/me`);
  return ((await me.json()) as { csrfToken: string }).csrfToken;
}

/**
 * A second person in the owner's workspace, signed in in their own browser: invited through the
 * API, the invitation email read from Mailpit and accepted. Does not count as a sign-up.
 */
export async function joinAs(
  owner: { origin: string },
  ownerPage: Page,
  request: APIRequestContext,
  browser: Browser,
  person: { name: string; role?: 'admin' | 'supervisor' | 'agent' },
): Promise<{ page: Page; context: BrowserContext; email: string; userId: string }> {
  const email = `joined-${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}@example.test`;
  const invited = await ownerPage.request.post(`${owner.origin}/api/v1/invitations`, {
    headers: { 'x-csrf-token': await csrfOf(ownerPage, owner.origin) },
    data: { emails: [email], role: person.role ?? 'agent' },
  });
  expect(invited.status(), await invited.text()).toBe(200);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(await findEmailLink(request, email, '/invite'));
  await page.getByLabel('Full name').fill(person.name);
  await page.getByRole('textbox', { name: 'Choose a password', exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Join workspace' }).click();
  await expect(
    page.getByRole('heading', { name: /^Good (morning|afternoon|evening), / }),
  ).toBeVisible();
  const me = await page.request.get(`${owner.origin}/api/v1/me`);
  const { user } = (await me.json()) as { user: { id: string } };
  return { page, context, email, userId: user.id };
}
