import { beforeEach, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { GetApiV1MeResponse } from '../api/generated/zod/accounts/accounts.zod';
import { GetApiV1AuditLogResponse } from '../api/generated/zod/audit/audit.zod';
import { GetApiV1WorkspaceBusinessHoursResponse } from '../api/generated/zod/business-hours/business-hours.zod';
import { GetApiV1CannedResponsesResponse } from '../api/generated/zod/canned-responses/canned-responses.zod';
import {
  GetApiV1CompaniesCompanyIdResponse,
  GetApiV1CompaniesResponse,
  GetApiV1ContactsContactIdResponse,
  GetApiV1ContactsResponse,
} from '../api/generated/zod/contacts/contacts.zod';
import { GetApiV1CustomFieldsResponse } from '../api/generated/zod/custom-fields/custom-fields.zod';
import { GetApiV1WorkspaceEmailResponse } from '../api/generated/zod/email/email.zod';
import { GetApiV1HomeResponse } from '../api/generated/zod/home/home.zod';
import {
  GetApiV1MembersResponse,
  GetApiV1PeopleResponse,
} from '../api/generated/zod/members/members.zod';
import {
  GetApiV1NotificationsEmailResponse,
  GetApiV1NotificationsResponse,
} from '../api/generated/zod/notifications/notifications.zod';
import { GetApiV1RulesResponse } from '../api/generated/zod/rules/rules.zod';
import { GetApiV1SlaPoliciesResponse } from '../api/generated/zod/sla/sla.zod';
import { GetApiV1TeamsResponse } from '../api/generated/zod/teams/teams.zod';
import {
  GetApiV1TicketsNumberActivityResponse,
  GetApiV1TicketsNumberMessagesResponse,
  GetApiV1TicketsNumberResponse,
  GetApiV1TicketsResponse,
  GetApiV1TicketsTagsResponse,
  GetApiV1TicketViewsResponse,
} from '../api/generated/zod/tickets/tickets.zod';
import { GetApiV1WorkspaceSecurityResponse } from '../api/generated/zod/two-factor/two-factor.zod';
import { GetApiV1WorkspaceWebFormResponse } from '../api/generated/zod/web-form/web-form.zod';
import type {
  Contact,
  NotificationUnread,
  SavedView,
  Ticket,
  TicketActivityList,
  TicketConversation,
  TicketPage,
} from '../api/generated/model';
import { apiUrl, server } from '../test/server';
import { freshDemoData, snapshot, type DemoData } from './data';
import { createDemoHandlers } from './handlers';
import { homeOf, listTickets, readTicketQuery, withLiveSla } from './store';

const HOUR = 3_600_000;
let data: DemoData;

beforeEach(() => {
  data = freshDemoData();
  server.use(...createDemoHandlers(data, apiUrl('')));
});

// The caller names the answer's shape, as with response.json<T>().
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
async function call<T>(method: string, path: string, body?: unknown) {
  const response = await fetch(apiUrl(`/api/v1${path}`), {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    body: (response.status === 204 ? undefined : await response.json()) as T,
  };
}
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
const get = <T>(path: string) => call<T>('GET', path);

describe('the demo API', () => {
  it('answers every screen with what the real API contract allows', async () => {
    const first = snapshot.tickets[0];
    const contact = snapshot.contacts[0];
    const company = snapshot.companies[0];
    if (!first || !contact || !company) throw new Error('empty snapshot');
    const screens: [string, z.ZodType][] = [
      ['/me', GetApiV1MeResponse],
      ['/members', GetApiV1MembersResponse],
      ['/people', GetApiV1PeopleResponse],
      ['/teams', GetApiV1TeamsResponse],
      ['/ticket-views', GetApiV1TicketViewsResponse],
      ['/tickets/tags', GetApiV1TicketsTagsResponse],
      ['/tickets?sort=priority', GetApiV1TicketsResponse],
      [`/tickets/${first.number}`, GetApiV1TicketsNumberResponse],
      [`/tickets/${first.number}/messages`, GetApiV1TicketsNumberMessagesResponse],
      [`/tickets/${first.number}/activity`, GetApiV1TicketsNumberActivityResponse],
      ['/custom-fields?recordType=ticket', GetApiV1CustomFieldsResponse],
      ['/custom-fields?recordType=contact', GetApiV1CustomFieldsResponse],
      ['/contacts?sort=updated', GetApiV1ContactsResponse],
      [`/contacts/${contact.id}`, GetApiV1ContactsContactIdResponse],
      ['/companies', GetApiV1CompaniesResponse],
      [`/companies/${company.id}`, GetApiV1CompaniesCompanyIdResponse],
      ['/canned-responses', GetApiV1CannedResponsesResponse],
      ['/rules', GetApiV1RulesResponse],
      ['/sla-policies', GetApiV1SlaPoliciesResponse],
      ['/workspace/business-hours', GetApiV1WorkspaceBusinessHoursResponse],
      ['/workspace/email', GetApiV1WorkspaceEmailResponse],
      ['/workspace/web-form', GetApiV1WorkspaceWebFormResponse],
      ['/workspace/security', GetApiV1WorkspaceSecurityResponse],
      ['/audit-log', GetApiV1AuditLogResponse],
      ['/notifications', GetApiV1NotificationsResponse],
      ['/notifications/email', GetApiV1NotificationsEmailResponse],
      ['/home', GetApiV1HomeResponse],
    ];
    for (const [path, schema] of screens) {
      const { status, body } = await get(path);
      expect(status, path).toBe(200);
      expect(schema.safeParse(body).error, path).toBeUndefined();
    }
    const health = await fetch(apiUrl('/health'));
    expect(await health.json()).toMatchObject({ status: 'ok' });
  });

  it('works on a ticket: edits, a reply, history and the list', async () => {
    const ticket = [...data.tickets.values()].find((row) => row.assignee === null);
    if (!ticket) throw new Error('no unassigned ticket');
    const me = data.me.user;
    const teamId = data.teams.teams[0]?.id;

    const edited = await call<Ticket>('PATCH', `/tickets/${ticket.number}`, {
      assigneeUserId: me.id,
      teamId,
      priority: 'urgent',
      type: 'incident',
      subject: 'Renamed in the demo',
      tags: ['VIP', 'vip', ' '],
      customFields: { order_number: 'OC-1' },
    });
    expect(edited.body).toMatchObject({
      assignee: { userId: me.id },
      priority: 'urgent',
      subject: 'Renamed in the demo',
      tags: ['vip'],
    });
    const history = await get<TicketActivityList>(`/tickets/${ticket.number}/activity`);
    expect(history.body.activity.at(-1)?.changes.map((change) => change.field)).toEqual([
      'subject',
      'priority',
      'type',
      'team',
      'assignee',
      'tags',
      'customFields.order_number',
    ]);

    const replied = await call<TicketConversation>('POST', `/tickets/${ticket.number}/messages`, {
      kind: 'reply',
      body: 'On its way.',
      status: 'pending',
      mentions: [me.id, 'nobody'],
    });
    const reply = replied.body.messages.at(-1);
    expect(reply).toMatchObject({ kind: 'reply', emailStatus: 'sent', author: { name: me.name } });
    expect(reply?.to).toEqual([ticket.contact.email]);
    const after = await get<Ticket>(`/tickets/${ticket.number}`);
    expect(after.body.status).toBe('pending');
    expect(after.body.firstResponseAt).not.toBeNull();

    const noted = await call<TicketConversation>('POST', `/tickets/${ticket.number}/messages`, {
      kind: 'note',
      body: 'Internal',
    });
    expect(noted.body.messages.at(-1)).toMatchObject({ kind: 'note', emailStatus: null });

    const mine = await get<TicketPage>('/tickets?assignee=me&q=Renamed');
    expect(mine.body.tickets.map((row) => row.number)).toEqual([ticket.number]);

    await call('PATCH', `/tickets/${ticket.number}`, { status: 'resolved' });
    expect(data.tickets.get(ticket.number)).toMatchObject({ status: 'resolved', due: null });
    await call('PATCH', `/tickets/${ticket.number}`, { status: 'closed' });
    expect(data.tickets.get(ticket.number)?.closedAt).not.toBeNull();
  });

  it('creates, trashes and restores tickets, with a new requester', async () => {
    const before = data.tickets.size;
    const created = await call<Ticket>('POST', '/tickets', {
      subject: 'Saddle too high',
      description: 'Called the shop',
      contact: { name: 'New Rider', email: 'new.rider@mail.example' },
      teamId: data.teams.teams[0]?.id,
      assigneeUserId: data.me.user.id,
      tags: ['Fit'],
    });
    expect(created.body).toMatchObject({
      number: before + 1,
      status: 'open',
      contact: { name: 'New Rider' },
      tags: ['fit'],
    });
    const known = snapshot.contacts[0];
    const second = await call<Ticket>('POST', '/tickets', { subject: 'Hi', contactId: known?.id });
    expect(second.body.contact.id).toBe(known?.id);
    expect((await call('POST', '/tickets', { subject: 'Nobody', contactId: 'x' })).status).toBe(
      404,
    );

    expect((await call('DELETE', `/tickets/${created.body.number}`)).status).toBe(204);
    const trash = await get<TicketPage>('/tickets?deleted=true');
    expect(trash.body.tickets.map((row) => row.number)).toEqual([created.body.number]);
    await call('POST', `/tickets/${created.body.number}/restore`);
    expect(data.tickets.get(created.body.number)?.deletedAt).toBeNull();

    for (const path of ['/tickets/999', '/tickets/999/restore']) {
      expect((await call(path.endsWith('restore') ? 'POST' : 'GET', path)).status).toBe(404);
    }
    expect((await call('PATCH', '/tickets/999', {})).status).toBe(404);
    expect((await call('DELETE', '/tickets/999')).status).toBe(404);
    expect((await call('POST', '/tickets/999/messages', { kind: 'note', body: 'x' })).status).toBe(
      404,
    );
  });

  it('keeps contacts, companies, views and canned responses in memory', async () => {
    const company = await call<{ id: string }>('POST', '/companies', { name: 'Spoke & Co' });
    const contact = await call<Contact>('POST', '/contacts', {
      name: 'Asha Kumar',
      email: 'asha@spoke.example',
      companyId: company.body.id,
    });
    expect(contact.body.company?.name).toBe('Spoke & Co');
    const patched = await call<Contact>('PATCH', `/contacts/${contact.body.id}`, {
      jobTitle: 'Buyer',
      companyId: null,
      customFields: { tier: 'gold' },
    });
    expect(patched.body).toMatchObject({ jobTitle: 'Buyer', company: null });
    const found = await get<{ contacts: { id: string }[] }>('/contacts?q=asha');
    expect(found.body.contacts.map((row) => row.id)).toEqual([contact.body.id]);
    await call('PATCH', `/companies/${company.body.id}`, { phone: '1', customFields: { a: 1 } });
    const companies = await get<{ companies: { name: string }[] }>('/companies?q=spoke');
    expect(companies.body.companies.map((row) => row.name)).toEqual(['Spoke & Co']);
    await call('DELETE', `/contacts/${contact.body.id}`);
    await call('DELETE', `/companies/${company.body.id}`);
    for (const path of [`/contacts/${contact.body.id}`, `/companies/${company.body.id}`]) {
      expect((await get(path)).status).toBe(404);
      expect((await call('PATCH', path, {})).status).toBe(404);
    }

    const view = await call<SavedView>('POST', '/ticket-views', { name: 'Mine' });
    await call('PATCH', `/ticket-views/${view.body.id}`, { name: 'Mine, renamed' });
    expect(data.views.views.find((row) => row.id === view.body.id)?.name).toBe('Mine, renamed');
    await call('DELETE', `/ticket-views/${view.body.id}`);
    expect((await call('PATCH', `/ticket-views/${view.body.id}`, {})).status).toBe(404);

    const response = await call<{ id: string }>('POST', '/canned-responses', {
      title: 'Thanks',
      body: 'Hi {{contact.first_name}}, ticket #{{ticket.number}}. {{unknown}} {{agent.name}}',
    });
    const ticket = snapshot.tickets[0];
    const filled = await get<{ body: string }>(
      `/canned-responses/${response.body.id}/filled?ticketNumber=${String(ticket?.number)}`,
    );
    const firstName = ticket?.contact.name.split(' ')[0] ?? '';
    expect(filled.body.body).toBe(
      `Hi ${firstName}, ticket #${String(ticket?.number)}. {{unknown}} ${data.me.user.name}`,
    );
    await call('PATCH', `/canned-responses/${response.body.id}`, { title: 'Thank you' });
    await call('DELETE', `/canned-responses/${response.body.id}`);
    expect((await get(`/canned-responses/${response.body.id}/filled`)).status).toBe(404);
    expect((await call('PATCH', `/canned-responses/${response.body.id}`, {})).status).toBe(404);
    expect((await get('/teams/none')).status).toBe(404);
    expect((await get(`/teams/${String(data.teams.teams[0]?.id)}`)).status).toBe(200);
  });

  it('saves settings, the profile and notifications, and refuses what it does not do', async () => {
    await call('PATCH', '/me', { name: 'Priya N', theme: 'indigo' });
    expect(data.me.user).toMatchObject({ name: 'Priya N', theme: 'indigo' });
    expect((await call('POST', '/auth/login', {})).status).toBe(200);
    expect((await call('POST', '/auth/logout')).status).toBe(204);
    expect((await call('POST', '/me/reauthenticate', {})).status).toBe(204);

    await call('PUT', '/workspace/business-hours', { alwaysOpen: true });
    expect(data.businessHours).toMatchObject({ alwaysOpen: true, saved: true });
    await call('PATCH', '/workspace/email', {
      senderName: 'Orbit help',
      customerNotifications: { resolved: false },
    });
    expect(data.emailSettings.senderName).toBe('Orbit help');
    await call('PATCH', '/workspace/web-form', { title: 'Ask us' });
    expect((await get<{ title: string }>('/web-form')).body.title).toBe('Ask us');
    expect((await get<{ url: string }>('/workspace/web-form')).body.url).toBe(
      `${window.location.origin}/support`,
    );
    await call('PATCH', '/workspace/security', { requireTwoFactor: true });
    expect(data.security.requireTwoFactor).toBe(true);
    await call('PATCH', '/notifications/email', { assigned: false });
    expect(data.emailChoices.assigned).toBe(false);

    const unread = await get<NotificationUnread>('/notifications/unread');
    const read = await call<NotificationUnread>('POST', '/notifications/read', {});
    expect(read.body.unread).toBeLessThanOrEqual(unread.body.unread);
    expect(read.body.unread).toBe(0);
    await call('POST', '/notifications/read', { ids: ['none'] });

    const refused = await call<{ error: { code: string } }>('POST', '/invitations', {});
    expect(refused).toMatchObject({ status: 403, body: { error: { code: 'DEMO' } } });
  });
});

describe('the demo data', () => {
  it('looks current: tickets spread over the past days, deadlines kept with their ticket', () => {
    const now = Date.parse('2027-03-01T10:00:00.000Z');
    const fresh = freshDemoData(now);
    const ages = [...fresh.tickets.values()].map((ticket) => now - Date.parse(ticket.createdAt));
    expect(Math.max(...ages)).toBe(120 * HOUR);
    expect(Math.min(...ages)).toBeLessThan(HOUR);
    for (const ticket of fresh.tickets.values()) {
      const messages = fresh.conversations.get(ticket.number)?.messages ?? [];
      for (const message of messages) expect(Date.parse(message.createdAt)).toBeLessThan(now);
      const original = snapshot.tickets.find((row) => row.number === ticket.number);
      if (original?.due && ticket.due) {
        const kept = Date.parse(original.due.at) - Date.parse(original.createdAt);
        expect(Date.parse(ticket.due.at) - Date.parse(ticket.createdAt)).toBe(kept);
      }
    }
    for (const entry of fresh.audit.entries) {
      expect(now - Date.parse(entry.occurredAt)).toBeLessThanOrEqual(7 * 24 * HOUR);
    }
  });

  it('filters, sorts and counts like the API', () => {
    const query = readTicketQuery(
      new URLSearchParams('status=open,pending&priority=high&type=none&teamId=none&tag=damage'),
    );
    expect(query).toMatchObject({ status: ['open', 'pending'], sort: 'updated' });
    expect(listTickets(data, query).every((ticket) => ticket.priority === 'high')).toBe(true);
    const contact = snapshot.tickets[0]?.contact.id ?? '';
    const company = snapshot.tickets.find((ticket) => ticket.company)?.company?.id ?? '';
    const byContact = listTickets(
      data,
      readTicketQuery(new URLSearchParams(`contactId=${contact}`)),
    );
    expect(byContact.every((ticket) => ticket.contact.id === contact)).toBe(true);
    const byCompany = listTickets(
      data,
      readTicketQuery(new URLSearchParams(`companyId=${company}`)),
    );
    expect(byCompany.length).toBeGreaterThan(0);
    expect(listTickets(data, readTicketQuery(new URLSearchParams('q=%235')))[0]?.number).toBe(5);

    for (const sort of ['created', 'oldest', 'priority', 'due', 'unknown']) {
      expect(listTickets(data, { sort })).toHaveLength(data.tickets.size);
    }
    const oldestFirst = listTickets(data, { sort: 'oldest' });
    expect(Date.parse(oldestFirst[0]?.createdAt ?? '')).toBeLessThan(
      Date.parse(oldestFirst.at(-1)?.createdAt ?? ''),
    );

    const later = Date.now() + 365 * 24 * HOUR;
    const overdue = listTickets(data, { overdue: true }, later);
    expect(overdue.length).toBe([...data.tickets.values()].filter((ticket) => ticket.due).length);
    const home = homeOf(data);
    expect(home.counts.mine).toBe(
      listTickets(data, { status: ['open', 'pending', 'waiting_on_customer'], assignee: ['me'] })
        .length,
    );
  });

  it('shows a running deadline that has passed as overdue', () => {
    const ticket = [...data.tickets.values()].find((row) => row.sla?.reply?.state === 'running');
    if (!ticket) throw new Error('no running deadline');
    const later = Date.now() + 365 * 24 * HOUR;
    expect(withLiveSla(ticket, later).sla?.reply?.state).toBe('overdue');
    const noSla = { ...ticket, sla: null };
    expect(withLiveSla(noSla, later)).toBe(noSla);
  });
});
