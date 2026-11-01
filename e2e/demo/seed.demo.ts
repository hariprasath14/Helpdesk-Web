import { writeFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  csrfOf,
  E2E_PASSWORD,
  findEmailLink,
  joinAs,
  mailpitUrl,
  type MailpitEmail,
} from '../fixtures';

/**
 * Builds the sample workspace of the demo (src/demo) against the real local API, worker and
 * Mailpit, then saves what every screen reads into src/demo/snapshot.json. Run it with
 * `npm run demo:snapshot` (helpdesk-api's API and worker running) after an API change, so the demo
 * shows exactly what the real API returns. Uses one of the API's 5 sign-ups an hour.
 */

/** The domain of workspace addresses where the API runs (TICKET_EMAIL_DOMAIN). */
const ticketDomain = process.env.E2E_TICKET_EMAIL_DOMAIN ?? 'mail.helpdesk.local';
const SNAPSHOT = new URL('../../src/demo/snapshot.json', import.meta.url);

type Json = Record<string, unknown>;

/** The API as one signed-in person: JSON in, JSON out, failing loudly on any error. */
function apiAs(page: Page, origin: string, csrf: string) {
  const call = async (method: 'get' | 'post' | 'patch' | 'put', path: string, data?: Json) => {
    const response = await page.request[method](`${origin}/api/v1${path}`, {
      headers: { 'x-csrf-token': csrf },
      ...(data ? { data } : {}),
    });
    expect(response.ok(), `${method.toUpperCase()} ${path}: ${await response.text()}`).toBe(true);
    return response.status() === 204 ? {} : ((await response.json()) as Json);
  };
  return {
    get: (path: string) => call('get', path),
    post: (path: string, data: Json = {}) => call('post', path, data),
    patch: (path: string, data: Json) => call('patch', path, data),
    put: (path: string, data: Json) => call('put', path, data),
  };
}
type Api = ReturnType<typeof apiAs>;

/** A customer's email, dropped into Mailpit as a mail server would deliver it. */
async function sendEmail(
  request: APIRequestContext,
  email: { fromName: string; from: string; to: string; subject: string; text: string },
) {
  const response = await request.post(`${mailpitUrl}/api/v1/send`, {
    data: {
      From: { Email: email.from, Name: email.fromName },
      To: [{ Email: email.to }],
      Subject: email.subject,
      Text: email.text,
    },
  });
  expect(response.status(), await response.text()).toBe(200);
}

/** The ticket the worker made from an email, found by its subject. */
async function ticketBySubject(api: Api, subject: string): Promise<number> {
  let number: number | undefined;
  await expect
    .poll(
      async () => {
        const page = await api.get(`/tickets?q=${encodeURIComponent(subject)}`);
        const tickets = page.tickets as { number: number; subject: string }[];
        number = tickets.find((ticket) => ticket.subject === subject)?.number;
        return number;
      },
      { message: `ticket "${subject}"`, timeout: 60_000 },
    )
    .toBeDefined();
  return number ?? 0;
}

/** Waits until the worker has added the customer's emailed answer to the ticket. */
async function customerMessageArrived(api: Api, number: number) {
  await expect
    .poll(
      async () => {
        const conversation = await api.get(`/tickets/${number}/messages`);
        return (conversation.messages as { kind: string }[]).some(
          (message) => message.kind === 'customer',
        );
      },
      { message: `customer answer on ticket ${number}`, timeout: 60_000 },
    )
    .toBe(true);
}

/**
 * The customer answers the agent's reply email, so the answer threads onto the same ticket. The
 * sample customers are the same in every run, so only this run's workspace's email counts: its
 * reply address starts with the workspace address ("orbit-x1y2+3-…@").
 */
async function customerAnswers(
  request: APIRequestContext,
  workspaceAddress: string,
  customer: { name: string; email: string },
  subject: string,
  text: string,
) {
  let reply: MailpitEmail | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(`${mailpitUrl}/api/v1/search`, {
          params: { query: `to:"${customer.email}"` },
        });
        const { messages } = (await search.json()) as {
          messages: { ID: string; Subject: string }[];
        };
        for (const match of messages.filter((message) => message.Subject.includes(subject))) {
          const message = await request.get(`${mailpitUrl}/api/v1/message/${match.ID}`);
          const email = (await message.json()) as MailpitEmail;
          if (email.ReplyTo[0]?.Address.startsWith(`${workspaceAddress}+`)) reply = email;
        }
        return reply;
      },
      { message: `reply email to ${customer.email} about "${subject}"`, timeout: 30_000 },
    )
    .toBeDefined();
  if (!reply) throw new Error('no reply email');
  await sendEmail(request, {
    fromName: customer.name,
    from: customer.email,
    to: reply.ReplyTo[0]?.Address ?? '',
    subject: `Re: ${reply.Subject}`,
    text,
  });
}

test('builds the demo workspace and saves its snapshot', async ({ page, request, browser }) => {
  test.setTimeout(15 * 60_000);
  const stamp = Date.now().toString(36);
  const address = `orbit-${stamp}`;
  const ownerEmail = `priya.${stamp}@orbit-cycles.example`;

  // The owner: sign-up and the confirmation link.
  const signup = await request.post('/api/v1/signup', {
    data: {
      name: 'Priya Nair',
      email: ownerEmail,
      password: E2E_PASSWORD,
      companyName: 'Orbit Cycles',
      workspaceAddress: address,
      timezone: 'Asia/Kolkata',
      acceptTerms: true,
    },
  });
  expect(signup.status(), await signup.text()).toBe(202);
  const link = await findEmailLink(request, ownerEmail, '/verify-email');
  await page.goto(link);
  await expect(page.getByRole('heading', { name: /, Priya$/ })).toBeVisible();
  const origin = new URL(link).origin;
  const owner = apiAs(page, origin, await csrfOf(page, origin));
  const ownerId = ((await owner.get('/me')).user as { id: string }).id;

  // The team: three people join by invitation.
  const join = async (name: string, role: 'agent' | 'supervisor') => {
    const joined = await joinAs({ origin }, page, request, browser, { name, role });
    return {
      api: apiAs(joined.page, origin, await csrfOf(joined.page, origin)),
      userId: joined.userId,
    };
  };
  const arjun = await join('Arjun Mehta', 'agent');
  const neha = await join('Neha Iyer', 'agent');
  const kabir = await join('Kabir Singh', 'supervisor');

  const orders = (await owner.post('/teams', {
    name: 'Orders & Delivery',
    description: 'Order status, couriers and delivery dates',
    members: [{ userId: arjun.userId, isLead: true }, { userId: neha.userId }],
  })) as { id: string };
  const returns = (await owner.post('/teams', {
    name: 'Returns & Warranty',
    description: 'Returns, refunds, damage and warranty claims',
    members: [{ userId: kabir.userId, isLead: true }, { userId: neha.userId }],
  })) as { id: string };

  // Settings an admin sets up in the first week.
  await owner.put('/workspace/business-hours', {
    timeZone: 'Asia/Kolkata',
    alwaysOpen: false,
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(
      (day) => ({ day, open: day !== 'sunday', start: '09:00', end: '18:00' }),
    ),
  });
  await owner.post('/workspace/holidays', { date: '2026-11-08', name: 'Diwali' });
  await owner.post('/workspace/holidays', { date: '2026-12-25', name: 'Christmas' });
  await owner.patch('/workspace/email', { senderName: 'Orbit Cycles Support' });
  await owner.patch('/workspace/web-form', {
    enabled: true,
    title: 'Contact Orbit Cycles support',
    intro: 'Tell us about your order or your bike. We reply within one working day.',
  });

  const orderField = (await owner.post('/custom-fields', {
    recordType: 'ticket',
    label: 'Order number',
    helpText: 'From the order confirmation email, for example OC-10482',
    type: 'text',
  })) as { fields: { label: string; key: string }[] };
  const orderKey = orderField.fields.find((field) => field.label === 'Order number')?.key ?? '';
  await owner.post('/custom-fields', {
    recordType: 'ticket',
    label: 'Bike model',
    type: 'dropdown',
    choices: [
      { label: 'Roadster 2' },
      { label: 'Trail X' },
      { label: 'City Glide' },
      { label: 'Kids 16' },
    ],
  });
  await owner.post('/custom-fields', {
    recordType: 'contact',
    label: 'Loyalty tier',
    type: 'dropdown',
    choices: [{ label: 'Silver' }, { label: 'Gold' }, { label: 'Platinum' }],
  });

  await owner.post('/canned-responses', {
    title: 'Order status update',
    body: 'Hi {{contact.first_name}},\n\nThanks for your patience. Your order is with our courier and should reach you within 2 working days. We will share the tracking link as soon as it is updated.\n\n{{agent.first_name}}, {{workspace.name}}',
    shared: true,
  });
  await owner.post('/canned-responses', {
    title: 'Return label sent',
    body: 'Hi {{contact.first_name}},\n\nWe have emailed you a prepaid return label for ticket #{{ticket.number}}. Pack the item in its original box and our courier will collect it within 3 working days.\n\n{{agent.first_name}}',
    shared: true,
  });
  await owner.post('/canned-responses', {
    title: 'Warranty claim received',
    body: 'Hi {{contact.first_name}},\n\nWe have registered your warranty claim. Please send two photos of the part and your order number, and our service team will confirm the replacement within 2 working days.\n\n{{agent.first_name}}',
    shared: true,
  });

  // Companies and their people.
  const company = async (name: string, domain: string, phone: string) =>
    (
      (await owner.post('/companies', {
        name,
        domains: [domain],
        phone,
        website: `https://${domain}`,
      })) as { id: string }
    ).id;
  const pedal = await company('Pedal Partners', 'pedalpartners.example', '+91 80 4123 9900');
  const green = await company('GreenCommute', 'greencommute.example', '+91 22 6612 4400');
  const metro = await company('Metro Rentals', 'metro-rentals.example', '+91 44 2811 7700');

  const contacts: Record<string, string> = {};
  for (const [name, email, companyId, jobTitle, phone] of [
    [
      'Lakshmi Menon',
      'lakshmi@pedalpartners.example',
      pedal,
      'Procurement lead',
      '+91 98450 11223',
    ],
    ['Aditya Verma', 'aditya@greencommute.example', green, 'Fleet manager', null],
    ['Deepak Joshi', 'deepak@metro-rentals.example', metro, 'Accounts', '+91 99400 33112'],
    ['Rohan Das', 'rohan.das@mail.example', null, null, '+91 90031 22871'],
    ['Fatima Shaikh', 'fatima.s@mail.example', null, null, null],
    ['Vikram Rao', 'vikram.rao@mail.example', null, null, '+91 98860 44120'],
    ['Ananya Gupta', 'ananya.g@mail.example', null, null, null],
    ['Meera Krishnan', 'meera.k@mail.example', null, null, '+91 94440 55128'],
    ['Kavya Reddy', 'kavya.reddy@mail.example', null, null, null],
    ['Rahul Nair', 'rahul.nair@mail.example', null, null, null],
    ['Sneha Bhat', 'sneha.bhat@mail.example', null, null, null],
    ['Imran Khan', 'imran.khan@mail.example', null, null, '+91 97390 66541'],
  ] as const) {
    const created = (await owner.post('/contacts', {
      name,
      email,
      companyId,
      jobTitle,
      phone,
    })) as { id: string };
    contacts[name] = created.id;
  }

  // Automation: routing, damage triage and closing resolved tickets.
  await owner.post('/rules', {
    name: 'Route returns and refunds to Returns & Warranty',
    event: 'ticket_created',
    conditions: {
      match: 'any',
      items: [
        {
          field: 'subject_or_description',
          operator: 'contains_any',
          value: ['return', 'refund', 'warranty'],
        },
      ],
    },
    actions: [{ type: 'set_team', value: returns.id }],
  });
  await owner.post('/rules', {
    name: 'Damaged on arrival: high priority',
    event: 'ticket_created',
    conditions: {
      match: 'any',
      items: [
        { field: 'subject_or_description', operator: 'contains_any', value: ['damaged', 'broken'] },
      ],
    },
    actions: [
      { type: 'set_priority', value: 'high' },
      { type: 'add_tags', value: ['damage'] },
    ],
  });
  await owner.post('/rules', {
    name: 'Close resolved tickets after 3 days',
    event: 'time',
    conditions: {
      match: 'all',
      items: [
        { field: 'status', operator: 'is_any', value: ['resolved'] },
        { field: 'hours_in_status', operator: 'at_least', value: '72' },
      ],
    },
    actions: [{ type: 'set_status', value: 'closed' }],
  });
  const hours = (reply: number, resolve: number) => ({
    reply: { amount: reply, unit: 'hours' },
    resolve: { amount: resolve, unit: 'hours' },
    hours: 'calendar',
  });
  await owner.post('/sla-policies', {
    name: 'Business customers',
    conditions: {
      match: 'any',
      items: [{ field: 'company', operator: 'is_any', value: [pedal, green, metro] }],
    },
    targets: { urgent: hours(1, 4), high: hours(2, 8), medium: hours(4, 24), low: hours(8, 48) },
    escalation: { warnMinutes: 30, reassign: 'team_lead', reassignUserId: null },
  });

  await owner.post('/ticket-views', {
    name: 'Damaged deliveries',
    filters: { tag: ['damage'], status: ['open', 'pending', 'waiting_on_customer'] },
    sort: 'priority',
    shared: true,
  });
  await owner.post('/ticket-views', {
    name: 'Business customers',
    filters: { q: 'Pedal Partners' },
    sort: 'updated',
    shared: false,
  });

  // Tickets: by email (the worker turns them into tickets), by the web form, and by agents.
  const workspaceEmail = `${address}@${ticketDomain}`;
  const byEmail = async (name: string, email: string, subject: string, text: string) => {
    await sendEmail(request, { fromName: name, from: email, to: workspaceEmail, subject, text });
    return ticketBySubject(owner, subject);
  };
  const byWebForm = async (name: string, email: string, subject: string, description: string) => {
    const response = await request.post(`${origin}/api/v1/web-form/requests`, {
      data: { name, email, subject, description },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return ticketBySubject(owner, subject);
  };
  const byAgent = async (data: Json) =>
    ((await owner.post('/tickets', data)) as { number: number }).number;
  const update = (number: number, data: Json) => owner.patch(`/tickets/${number}`, data);
  const write = (api: Api, number: number, data: Json) =>
    api.post(`/tickets/${number}/messages`, data);

  const t1 = await byEmail(
    'Lakshmi Menon',
    'lakshmi@pedalpartners.example',
    'Bulk order PP-2291: 3 bikes missing from delivery',
    'Hi team,\n\nWe received 9 of the 12 Roadster 2 bikes from order PP-2291 today. The delivery note lists all 12. Can you check with the courier?\n\nLakshmi',
  );
  await update(t1, {
    teamId: orders.id,
    assigneeUserId: arjun.userId,
    priority: 'high',
    customFields: { [orderKey]: 'PP-2291' },
  });
  await write(arjun.api, t1, {
    kind: 'reply',
    body: 'Hi Lakshmi,\n\nSorry about this. The courier split the order into two boxes and the second one is at their Bengaluru hub. I have asked them to deliver it tomorrow before noon.\n\nArjun',
  });
  await customerAnswers(
    request,
    address,
    { name: 'Lakshmi Menon', email: 'lakshmi@pedalpartners.example' },
    'Bulk order PP-2291',
    'Thanks Arjun. Please make sure they call our warehouse before arriving, the gate closes at 1 pm.',
  );
  await write(arjun.api, t1, {
    kind: 'note',
    body: '@Kabir Singh the courier says the second box has a torn corner. Can we pre-approve a replacement if a bike is damaged?',
    mentions: [kabir.userId],
  });

  const t2 = await byWebForm(
    'Rohan Das',
    'rohan.das@mail.example',
    'Front brake squeaking after first ride',
    'My new City Glide makes a loud squeak when I brake. Is this normal for new brakes?',
  );
  await update(t2, { teamId: orders.id, assigneeUserId: neha.userId, type: 'question' });
  await write(neha.api, t2, {
    kind: 'reply',
    body: 'Hi Rohan,\n\nNew disc brakes often squeak for the first 30 to 50 stops while the pads bed in. Could you try ten firm stops from about 20 km/h and tell us if it continues?\n\nNeha',
    status: 'waiting_on_customer',
  });

  const t3 = await byEmail(
    'Fatima Shaikh',
    'fatima.s@mail.example',
    'Refund for returned helmet not received',
    'I returned the Aero helmet two weeks ago and still have not received my refund. The courier confirmed pickup on 14 October.',
  );
  await update(t3, { assigneeUserId: kabir.userId });
  await write(kabir.api, t3, {
    kind: 'reply',
    body: 'Hi Fatima,\n\nThe helmet reached our warehouse on 18 October and your refund of Rs 3,499 was issued today. It usually takes 5 to 7 working days to show in your account.\n\nKabir',
  });
  await customerAnswers(
    request,
    address,
    { name: 'Fatima Shaikh', email: 'fatima.s@mail.example' },
    'Refund for returned helmet',
    'Got it, thank you for checking.',
  );
  await customerMessageArrived(owner, t3);
  await update(t3, { status: 'resolved' });

  const t4 = await byAgent({
    subject: 'Upgrade to Trail X before delivery',
    description:
      'Customer called: wants to switch the Roadster 2 on order OC-10517 to a Trail X and pay the difference.',
    contactId: contacts['Vikram Rao'],
    type: 'question',
    priority: 'low',
    teamId: orders.id,
    assigneeUserId: arjun.userId,
    customFields: { [orderKey]: 'OC-10517' },
  });
  await write(arjun.api, t4, {
    kind: 'reply',
    body: 'Hi Vikram,\n\nDone: your order now has the Trail X. We have sent a payment link for the difference of Rs 8,000. Delivery stays on Friday.\n\nArjun',
    status: 'resolved',
  });

  const t5 = await byEmail(
    'Ananya Gupta',
    'ananya.g@mail.example',
    'Bike arrived damaged: bent derailleur hanger',
    'The Trail X arrived today and the rear derailleur hanger is bent. The gears skip on every ride. Photos attached to my next mail.',
  );
  await update(t5, { teamId: returns.id, customFields: { [orderKey]: 'OC-10544' } });

  const t6 = await byWebForm(
    'Kavya Reddy',
    'kavya.reddy@mail.example',
    'App shows the wrong delivery date',
    'The order page in your app says 2 November but the confirmation email said 30 October. Which one is right?',
  );
  await update(t6, { teamId: orders.id, type: 'incident' });

  const t7 = await byEmail(
    'Deepak Joshi',
    'deepak@metro-rentals.example',
    'Invoice for October fleet service',
    'Hello,\n\nPlease share the GST invoice for the October service visit for our 25 rental bikes. Our accounts team closes the month on Tuesday.\n\nDeepak',
  );
  await update(t7, { assigneeUserId: ownerId, type: 'question' });

  const t8 = await byAgent({
    subject: 'Warranty claim: cracked frame on City Glide',
    description:
      'Customer reports a hairline crack near the bottom bracket after 4 months. Photos received over WhatsApp.',
    contactId: contacts['Meera Krishnan'],
    priority: 'urgent',
    type: 'problem',
    teamId: returns.id,
    assigneeUserId: neha.userId,
    tags: ['warranty', 'frame'],
  });
  await write(neha.api, t8, {
    kind: 'note',
    body: '@Priya Nair this is the second City Glide frame this month from the same batch. Should we raise it with the factory?',
    mentions: [ownerId],
  });
  await write(owner, t8, {
    kind: 'note',
    body: 'Yes, please collect the batch numbers. I will raise it with the factory on Monday.',
  });

  const t9 = await byEmail(
    'Aditya Verma',
    'aditya@greencommute.example',
    'Corporate leasing for 40 e-bikes',
    'We are planning a cycle-to-work programme for 40 employees from January. Do you offer leasing with servicing included?',
  );
  await update(t9, { assigneeUserId: ownerId, type: 'feature_request', tags: ['sales'] });
  await write(owner, t9, {
    kind: 'reply',
    body: 'Hi Aditya,\n\nYes, we do. I will send a proposal for 40 City Glide e-bikes with quarterly servicing by Thursday. Could you confirm the office locations?\n\nPriya',
    status: 'pending',
  });

  const t10 = await byEmail(
    'Rahul Nair',
    'rahul.nair@mail.example',
    'Tracking link not working',
    'The tracking link in my shipping email says "shipment not found". Order OC-10560.',
  );
  await update(t10, {
    teamId: orders.id,
    assigneeUserId: arjun.userId,
    type: 'problem',
    customFields: { [orderKey]: 'OC-10560' },
  });
  await write(arjun.api, t10, {
    kind: 'reply',
    body: 'Hi Rahul,\n\nThe courier updates the link a few hours after pickup. It should work by this evening; I will check again tomorrow morning.\n\nArjun',
    status: 'pending',
  });

  const t11 = await byAgent({
    subject: 'Feature request: EMI option at checkout',
    description: 'Asked on chat whether we can offer 6-month EMI on bikes above Rs 30,000.',
    contactId: contacts['Sneha Bhat'],
    type: 'feature_request',
    priority: 'low',
    tags: ['checkout', 'payments'],
  });
  expect(t11).toBeGreaterThan(0);

  const t12 = await byEmail(
    'Imran Khan',
    'imran.khan@mail.example',
    'Wrong frame size delivered, need a return',
    'I ordered a Roadster 2 in size M but received size L. I would like to return it for the correct size.',
  );
  await update(t12, { assigneeUserId: kabir.userId, customFields: { [orderKey]: 'OC-10571' } });
  await write(kabir.api, t12, {
    kind: 'reply',
    body: 'Hi Imran,\n\nSorry for the mix-up. We have emailed you a prepaid return label and reserved a size M for you. Could you confirm a pickup date?\n\nKabir',
    status: 'waiting_on_customer',
  });

  const t13 = await byWebForm(
    'Suresh Pillai',
    'suresh.pillai@mail.example',
    'Do you deliver to Coimbatore?',
    'I want to order a Kids 16 for my son. Do you deliver to Coimbatore, and how long does it take?',
  );
  await update(t13, { teamId: orders.id, assigneeUserId: neha.userId, type: 'question' });
  await write(neha.api, t13, {
    kind: 'reply',
    body: 'Hi Suresh,\n\nYes, we deliver to Coimbatore in 3 to 4 working days, fully assembled. Delivery is free above Rs 10,000.\n\nNeha',
    status: 'resolved',
  });
  await update(t13, { status: 'closed' });

  const t14 = await byWebForm(
    'Pooja Sharma',
    'pooja.sharma@mail.example',
    'Gift card not applied at checkout',
    'My gift card code GIFT-7781 says "already used" but I have never used it.',
  );
  await update(t14, { type: 'problem', priority: 'high' });

  const t15 = await byEmail(
    'Lakshmi Menon',
    'lakshmi@pedalpartners.example',
    'Service schedule for Q1',
    'Could you share the service visit dates for January to March for our 60 bikes?',
  );
  await update(t15, { teamId: orders.id, assigneeUserId: arjun.userId, priority: 'low' });
  await write(arjun.api, t15, {
    kind: 'reply',
    body: 'Hi Lakshmi,\n\nThe visits are on 12 January, 9 February and 9 March, from 10 am. The technician will bring spare tubes and brake pads.\n\nArjun',
    status: 'resolved',
  });

  // Let the worker finish (notifications, rule effects), then save what each screen reads.
  await page.waitForTimeout(12_000);
  const numbers = (
    (await owner.get('/tickets?limit=100&sort=created')).tickets as {
      number: number;
    }[]
  ).map((ticket) => ticket.number);
  const tickets: Json[] = [];
  const conversations: Record<number, Json> = {};
  const activity: Record<number, Json> = {};
  for (const number of numbers) {
    tickets.push(await owner.get(`/tickets/${number}`));
    conversations[number] = await owner.get(`/tickets/${number}/messages`);
    activity[number] = await owner.get(`/tickets/${number}/activity`);
  }
  const contactIds = ((await owner.get('/contacts?limit=100')).contacts as { id: string }[]).map(
    (contact) => contact.id,
  );
  const companyIds = ((await owner.get('/companies?limit=100')).companies as { id: string }[]).map(
    (row) => row.id,
  );
  const snapshot = {
    takenAt: new Date().toISOString(),
    me: await owner.get('/me'),
    members: await owner.get('/members'),
    people: await owner.get('/people'),
    teams: await owner.get('/teams'),
    views: await owner.get('/ticket-views'),
    tags: await owner.get('/tickets/tags'),
    customFields: {
      ticket: await owner.get('/custom-fields?recordType=ticket'),
      contact: await owner.get('/custom-fields?recordType=contact'),
      company: await owner.get('/custom-fields?recordType=company'),
    },
    contacts: await Promise.all(contactIds.map((id) => owner.get(`/contacts/${id}`))),
    companies: await Promise.all(companyIds.map((id) => owner.get(`/companies/${id}`))),
    tickets,
    conversations,
    activity,
    cannedResponses: await owner.get('/canned-responses'),
    rules: await owner.get('/rules'),
    slaPolicies: await owner.get('/sla-policies'),
    businessHours: await owner.get('/workspace/business-hours'),
    emailSettings: await owner.get('/workspace/email'),
    webFormSettings: await owner.get('/workspace/web-form'),
    security: await owner.get('/workspace/security'),
    audit: await owner.get('/audit-log?limit=100'),
    notifications: await owner.get('/notifications?limit=50'),
    emailChoices: await owner.get('/notifications/email'),
    home: await owner.get('/home'),
  };
  // Tidy names in place of the run's unique ones: the workspace address, each member's email.
  let text = JSON.stringify(snapshot, null, 2)
    .replaceAll(address, 'orbit')
    .replaceAll(ticketDomain, 'mail.orbit-cycles.example');
  for (const member of (snapshot.members.members ?? []) as { name: string; email: string }[]) {
    const first = member.name.split(' ')[0]?.toLowerCase() ?? 'agent';
    text = text.replaceAll(member.email, `${first}@orbit-cycles.example`);
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a fixed path in this repo
  writeFileSync(SNAPSHOT, `${text}\n`);
});
