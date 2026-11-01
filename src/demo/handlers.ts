import { http, HttpResponse, type JsonBodyType } from 'msw';
import type {
  CannedResponse,
  Company,
  Contact,
  CreateCannedResponseRequestInput,
  CreateCompanyRequestInput,
  CreateContactRequestInput,
  CreateSavedViewRequestInput,
  CreateTicketRequestInput,
  MarkNotificationsReadRequestInput,
  PostMessageRequestInput,
  SavedView,
  Ticket,
  UpdateBusinessHoursRequestInput,
  UpdateCannedResponseRequestInput,
  UpdateCompanyRequestInput,
  UpdateContactRequestInput,
  UpdateEmailSettingsRequestInput,
  UpdateNotificationEmailRequestInput,
  UpdateProfileRequestInput,
  UpdateSavedViewRequestInput,
  UpdateTicketRequestInput,
  UpdateWebFormSettingsRequestInput,
  UpdateWorkspaceSecurityRequestInput,
} from '../api/generated/model';
import { PRODUCT_NAME } from '../product';
import { freshDemoData, type DemoData } from './data';
import {
  homeOf,
  listTickets,
  newId,
  postMessage,
  readTicketQuery,
  toSummary,
  updateTicket,
  withLiveSla,
} from './store';

/**
 * The demo's stand-in for helpdesk-api: MSW answers the app's API calls in the browser from the
 * sample workspace (data.ts), so the demo needs no server. Reading works everywhere; the changes a
 * visitor is most likely to try (tickets, replies, contacts, settings) work in memory; the rest
 * (invitations, sign-in security, files) answer that the demo does not do them.
 */

const notInDemo = () =>
  HttpResponse.json(
    {
      error: {
        code: 'DEMO',
        message: `This isn't available in the ${PRODUCT_NAME} demo. Everything else works with sample data.`,
      },
    },
    { status: 403 },
  );
const notFound = () =>
  HttpResponse.json(
    { error: { code: 'NOT_FOUND', message: 'This was not found. It may have been deleted.' } },
    { status: 404 },
  );
const ok = (body: JsonBodyType) => HttpResponse.json(body);
const noContent = () => new HttpResponse(null, { status: 204 });
const nowIso = () => new Date().toISOString();

/** Fills a canned response's {{placeholders}} for a ticket, as the API does. */
function fill(data: DemoData, body: string, ticket: Ticket | undefined) {
  const first = (name: string) => name.trim().split(/\s+/)[0] ?? '';
  const values: Record<string, string> = {
    'contact.name': ticket?.contact.name ?? '',
    'contact.first_name': first(ticket?.contact.name ?? ''),
    'contact.email': ticket?.contact.email ?? '',
    'ticket.number': ticket ? String(ticket.number) : '',
    'ticket.subject': ticket?.subject ?? '',
    'agent.name': data.me.user.name,
    'agent.first_name': first(data.me.user.name),
    'workspace.name': data.me.workspace.name,
  };
  return body.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (match, key: string) => values[key] ?? match);
}

/** `base` is the API's address: empty in the demo (the page's own), the test API in tests. */
export function createDemoHandlers(data: DemoData = freshDemoData(), base = '') {
  const API = `${base}/api/v1`;
  const ticketOf = (number: unknown) => data.tickets.get(Number(number));
  const contactSummary = (contact: Contact) => {
    const { id, name, email, phone, jobTitle, company, updatedAt } = contact;
    return { id, name, email, phone, jobTitle, company, updatedAt };
  };
  const companySummary = (company: Company) => {
    const { id, name, domains, contactCount, updatedAt } = company;
    return { id, name, domains, contactCount, updatedAt };
  };
  const companyRef = (companyId: string | null | undefined) => {
    const company = companyId ? data.companies.get(companyId) : undefined;
    return company ? { id: company.id, name: company.name } : null;
  };

  return [
    http.get(`${base}/health`, () =>
      ok({
        status: 'ok',
        version: 'demo',
        uptimeSeconds: 1,
        checks: { databaseWriter: 'ok', databaseReader: 'ok' },
      }),
    ),

    // You, signing in and out. Any sign-in opens the demo workspace again.
    http.get(`${API}/me`, () => ok(data.me)),
    http.patch(`${API}/me`, async ({ request }) => {
      const changes = (await request.json()) as UpdateProfileRequestInput;
      if (changes.name !== undefined) data.me.user.name = changes.name;
      if (changes.theme !== undefined) data.me.user.theme = changes.theme;
      return ok(data.me);
    }),
    http.post(`${API}/auth/login`, () => ok(data.me)),
    http.post(`${API}/auth/logout`, noContent),
    http.post(`${API}/me/reauthenticate`, noContent),

    // Home and notifications.
    http.get(`${API}/home`, () => ok(homeOf(data))),
    http.get(`${API}/notifications`, () => ok(data.notifications)),
    http.get(`${API}/notifications/unread`, () => ok({ unread: data.notifications.unread })),
    http.post(`${API}/notifications/read`, async ({ request }) => {
      const { ids } = (await request.json()) as MarkNotificationsReadRequestInput;
      for (const notification of data.notifications.notifications) {
        if (!ids || ids.includes(notification.id)) notification.read = true;
      }
      data.notifications.unread = data.notifications.notifications.filter(
        (notification) => !notification.read,
      ).length;
      return ok({ unread: data.notifications.unread });
    }),
    http.get(`${API}/notifications/email`, () => ok(data.emailChoices)),
    http.patch(`${API}/notifications/email`, async ({ request }) => {
      Object.assign(
        data.emailChoices,
        (await request.json()) as UpdateNotificationEmailRequestInput,
      );
      return ok(data.emailChoices);
    }),

    // Tickets.
    http.get(`${API}/tickets`, ({ request }) => {
      const tickets = listTickets(data, readTicketQuery(new URL(request.url).searchParams));
      return ok({ tickets: tickets.map(toSummary), nextCursor: null, total: tickets.length });
    }),
    http.get(`${API}/tickets/tags`, () => {
      const tags = new Set(data.tags.tags);
      for (const ticket of data.tickets.values()) for (const tag of ticket.tags) tags.add(tag);
      return ok({ tags: [...tags].sort() });
    }),
    http.post(`${API}/tickets`, async ({ request }) => {
      const input = (await request.json()) as CreateTicketRequestInput;
      let contact = input.contactId ? data.contacts.get(input.contactId) : undefined;
      if (!contact && input.contact) {
        contact = {
          id: newId(),
          name: input.contact.name,
          email: input.contact.email ?? null,
          phone: input.contact.phone ?? null,
          jobTitle: null,
          company: null,
          otherEmails: [],
          note: null,
          customFields: {},
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        data.contacts.set(contact.id, contact);
      }
      if (!contact) return notFound();
      const number = Math.max(0, ...data.tickets.keys()) + 1;
      const team = data.teams.teams.find((row) => row.id === input.teamId);
      const person = data.people.people.find((row) => row.userId === input.assigneeUserId);
      const ticket: Ticket = {
        id: newId(),
        number,
        subject: input.subject,
        status: input.status ?? 'open',
        priority: input.priority ?? 'medium',
        type: input.type ?? null,
        contact: { id: contact.id, name: contact.name, email: contact.email },
        company: contact.company,
        team: team ? { id: team.id, name: team.name } : null,
        assignee: person ? { userId: person.userId, name: person.name } : null,
        tags: (input.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        deletedAt: null,
        due: null,
        mergedInto: null,
        description: input.description ?? '',
        source: 'agent',
        customFields: input.customFields ?? {},
        createdBy: { userId: data.me.user.id, name: data.me.user.name },
        resolvedAt: null,
        closedAt: null,
        firstResponseAt: null,
        sla: null,
        ccEmails: [],
      };
      data.tickets.set(number, ticket);
      data.conversations.set(number, { messages: [], descriptionFiles: [] });
      data.activity.set(number, {
        activity: [
          {
            id: newId(),
            at: ticket.createdAt,
            actor: { userId: data.me.user.id, name: data.me.user.name },
            action: 'created',
            changes: [],
          },
        ],
      });
      return ok(ticket);
    }),
    http.get(`${API}/tickets/:number`, ({ params }) => {
      const ticket = ticketOf(params.number);
      return ticket ? ok(withLiveSla(ticket)) : notFound();
    }),
    http.patch(`${API}/tickets/:number`, async ({ params, request }) => {
      const ticket = ticketOf(params.number);
      if (!ticket) return notFound();
      updateTicket(data, ticket, (await request.json()) as UpdateTicketRequestInput);
      return ok(withLiveSla(ticket));
    }),
    http.delete(`${API}/tickets/:number`, ({ params }) => {
      const ticket = ticketOf(params.number);
      if (!ticket) return notFound();
      ticket.deletedAt = nowIso();
      return noContent();
    }),
    http.post(`${API}/tickets/:number/restore`, ({ params }) => {
      const ticket = ticketOf(params.number);
      if (!ticket) return notFound();
      ticket.deletedAt = null;
      return ok(withLiveSla(ticket));
    }),
    http.get(`${API}/tickets/:number/activity`, ({ params }) =>
      ok(data.activity.get(Number(params.number)) ?? { activity: [] }),
    ),
    http.get(`${API}/tickets/:number/messages`, ({ params }) =>
      ok(data.conversations.get(Number(params.number)) ?? { messages: [], descriptionFiles: [] }),
    ),
    http.post(`${API}/tickets/:number/messages`, async ({ params, request }) => {
      const ticket = ticketOf(params.number);
      if (!ticket) return notFound();
      postMessage(data, ticket, (await request.json()) as PostMessageRequestInput);
      return ok(data.conversations.get(ticket.number) ?? { messages: [], descriptionFiles: [] });
    }),

    // Saved views.
    http.get(`${API}/ticket-views`, () => ok(data.views)),
    http.post(`${API}/ticket-views`, async ({ request }) => {
      const input = (await request.json()) as CreateSavedViewRequestInput;
      const view: SavedView = {
        id: newId(),
        name: input.name,
        filters: input.filters ?? {},
        sort: input.sort ?? 'updated',
        shared: input.shared ?? false,
        mine: true,
        ownerName: data.me.user.name,
        canEdit: true,
      };
      data.views.views.push(view);
      return ok(view);
    }),
    http.patch(`${API}/ticket-views/:id`, async ({ params, request }) => {
      const view = data.views.views.find((row) => row.id === params.id);
      if (!view) return notFound();
      Object.assign(view, (await request.json()) as UpdateSavedViewRequestInput);
      return ok(view);
    }),
    http.delete(`${API}/ticket-views/:id`, ({ params }) => {
      data.views.views = data.views.views.filter((row) => row.id !== params.id);
      return noContent();
    }),

    // Contacts and companies.
    http.get(`${API}/contacts`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const q = params.get('q')?.trim().toLowerCase();
      const companyId = params.get('companyId');
      const contacts = [...data.contacts.values()]
        .filter(
          (contact) =>
            (!q ||
              [contact.name, contact.email ?? '', contact.phone ?? ''].some((value) =>
                value.toLowerCase().includes(q),
              )) &&
            (!companyId || contact.company?.id === companyId),
        )
        .sort((a, b) =>
          params.get('sort') === 'updated'
            ? Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
            : a.name.localeCompare(b.name),
        );
      return ok({
        contacts: contacts.map(contactSummary),
        nextCursor: null,
        total: contacts.length,
      });
    }),
    http.get(`${API}/contacts/:id`, ({ params }) => {
      const contact = data.contacts.get(String(params.id));
      return contact ? ok(contact) : notFound();
    }),
    http.post(`${API}/contacts`, async ({ request }) => {
      const input = (await request.json()) as CreateContactRequestInput;
      const contact: Contact = {
        id: newId(),
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        jobTitle: input.jobTitle ?? null,
        company: companyRef(input.companyId),
        otherEmails: input.otherEmails ?? [],
        note: input.note ?? null,
        customFields: input.customFields ?? {},
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      data.contacts.set(contact.id, contact);
      return ok(contact);
    }),
    http.patch(`${API}/contacts/:id`, async ({ params, request }) => {
      const contact = data.contacts.get(String(params.id));
      if (!contact) return notFound();
      const { companyId, customFields, ...rest } =
        (await request.json()) as UpdateContactRequestInput;
      Object.assign(contact, rest, { updatedAt: nowIso() });
      if (companyId !== undefined) contact.company = companyRef(companyId);
      if (customFields) contact.customFields = { ...contact.customFields, ...customFields };
      return ok(contact);
    }),
    http.delete(`${API}/contacts/:id`, ({ params }) => {
      data.contacts.delete(String(params.id));
      return noContent();
    }),
    http.get(`${API}/companies`, ({ request }) => {
      const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase();
      const companies = [...data.companies.values()]
        .filter(
          (company) =>
            !q ||
            [company.name, ...company.domains].some((value) => value.toLowerCase().includes(q)),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      return ok({
        companies: companies.map(companySummary),
        nextCursor: null,
        total: companies.length,
      });
    }),
    http.get(`${API}/companies/:id`, ({ params }) => {
      const company = data.companies.get(String(params.id));
      return company ? ok(company) : notFound();
    }),
    http.post(`${API}/companies`, async ({ request }) => {
      const input = (await request.json()) as CreateCompanyRequestInput;
      const company: Company = {
        id: newId(),
        name: input.name,
        domains: input.domains ?? [],
        contactCount: 0,
        phone: input.phone ?? null,
        website: input.website ?? null,
        note: input.note ?? null,
        customFields: input.customFields ?? {},
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      data.companies.set(company.id, company);
      return ok(company);
    }),
    http.patch(`${API}/companies/:id`, async ({ params, request }) => {
      const company = data.companies.get(String(params.id));
      if (!company) return notFound();
      const { customFields, ...rest } = (await request.json()) as UpdateCompanyRequestInput;
      Object.assign(company, rest, { updatedAt: nowIso() });
      if (customFields) company.customFields = { ...company.customFields, ...customFields };
      return ok(company);
    }),
    http.delete(`${API}/companies/:id`, ({ params }) => {
      data.companies.delete(String(params.id));
      return noContent();
    }),

    // People and teams: shown as they are; inviting and changing access is not in the demo.
    http.get(`${API}/members`, () => ok(data.members)),
    http.get(`${API}/people`, () => ok(data.people)),
    http.get(`${API}/teams`, () => ok(data.teams)),
    http.get(`${API}/teams/:id`, ({ params }) => {
      const team = data.teams.teams.find((row) => row.id === params.id);
      return team ? ok(team) : notFound();
    }),

    // Settings.
    http.get(`${API}/custom-fields`, ({ request }) => {
      const type = new URL(request.url).searchParams.get('recordType');
      return ok(
        type === 'contact' || type === 'company'
          ? data.customFields[type]
          : data.customFields.ticket,
      );
    }),
    http.get(`${API}/canned-responses`, () => ok(data.cannedResponses)),
    http.get(`${API}/canned-responses/:id/filled`, ({ params, request }) => {
      const response = data.cannedResponses.cannedResponses.find((row) => row.id === params.id);
      if (!response) return notFound();
      const ticket = ticketOf(new URL(request.url).searchParams.get('ticketNumber'));
      return ok({ body: fill(data, response.body, ticket) });
    }),
    http.post(`${API}/canned-responses`, async ({ request }) => {
      const input = (await request.json()) as CreateCannedResponseRequestInput;
      const response: CannedResponse = {
        id: newId(),
        title: input.title,
        body: input.body,
        shared: input.shared ?? false,
        mine: true,
        authorName: data.me.user.name,
        canEdit: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      data.cannedResponses.cannedResponses.push(response);
      return ok(response);
    }),
    http.patch(`${API}/canned-responses/:id`, async ({ params, request }) => {
      const response = data.cannedResponses.cannedResponses.find((row) => row.id === params.id);
      if (!response) return notFound();
      Object.assign(response, (await request.json()) as UpdateCannedResponseRequestInput, {
        updatedAt: nowIso(),
      });
      return ok(response);
    }),
    http.delete(`${API}/canned-responses/:id`, ({ params }) => {
      data.cannedResponses.cannedResponses = data.cannedResponses.cannedResponses.filter(
        (row) => row.id !== params.id,
      );
      return noContent();
    }),
    http.get(`${API}/rules`, () => ok(data.rules)),
    http.get(`${API}/sla-policies`, () => ok(data.slaPolicies)),
    http.get(`${API}/workspace/business-hours`, () => ok(data.businessHours)),
    http.put(`${API}/workspace/business-hours`, async ({ request }) => {
      Object.assign(data.businessHours, (await request.json()) as UpdateBusinessHoursRequestInput, {
        saved: true,
      });
      return ok(data.businessHours);
    }),
    http.get(`${API}/workspace/email`, () => ok(data.emailSettings)),
    http.patch(`${API}/workspace/email`, async ({ request }) => {
      const { senderName, customerNotifications } =
        (await request.json()) as UpdateEmailSettingsRequestInput;
      if (senderName !== undefined) data.emailSettings.senderName = senderName;
      Object.assign(data.emailSettings.customerNotifications, customerNotifications);
      return ok(data.emailSettings);
    }),
    // The form's link is the demo's own /support page, wherever the demo is hosted.
    http.get(`${API}/workspace/web-form`, () =>
      ok({ ...data.webFormSettings, url: `${window.location.origin}/support` }),
    ),
    http.patch(`${API}/workspace/web-form`, async ({ request }) => {
      Object.assign(
        data.webFormSettings,
        (await request.json()) as UpdateWebFormSettingsRequestInput,
      );
      return ok(data.webFormSettings);
    }),
    http.get(`${API}/web-form`, () =>
      ok({ ...data.webFormSettings, workspaceName: data.me.workspace.name }),
    ),
    http.get(`${API}/workspace/security`, () => ok(data.security)),
    http.patch(`${API}/workspace/security`, async ({ request }) => {
      Object.assign(data.security, (await request.json()) as UpdateWorkspaceSecurityRequestInput);
      return ok(data.security);
    }),
    http.get(`${API}/audit-log`, () => ok(data.audit)),

    // Anything else that changes data (invitations, passwords, two-step setup, files, merging,
    // rules and SLA edits, custom fields) says it is not in the demo.
    http.all(`${API}/*`, notInDemo),
  ];
}
