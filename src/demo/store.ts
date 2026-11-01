import type {
  Home,
  PostMessageRequestInput,
  Ticket,
  TicketActivity,
  TicketMessage,
  TicketSummary,
  UpdateTicketRequestInput,
} from '../api/generated/model';
import type { DemoData } from './data';

/**
 * The demo's ticket rules, kept to what the screens show: the same filters, sorts and counts as
 * the API's ticket list (helpdesk-api src/modules/tickets/ticket-list.ts), and the changes a
 * visitor makes on a ticket. Everything lives in memory, so a reload starts the demo fresh.
 */

type Status = Ticket['status'];
const UNRESOLVED: readonly Status[] = ['open', 'pending', 'waiting_on_customer'];
const PRIORITY_RANK = { low: 1, medium: 2, high: 3, urgent: 4 } as const;

export const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

/** A running SLA deadline that has passed shows as overdue, as the API's clock would mark it. */
export function withLiveSla(ticket: Ticket, now = Date.now()): Ticket {
  if (!ticket.sla) return ticket;
  const live = (target: NonNullable<Ticket['sla']>['reply']) =>
    target?.state === 'running' && Date.parse(target.dueAt) < now
      ? { ...target, state: 'overdue' as const }
      : target;
  return {
    ...ticket,
    sla: { ...ticket.sla, reply: live(ticket.sla.reply), resolve: live(ticket.sla.resolve) },
  };
}

export function toSummary(ticket: Ticket): TicketSummary {
  const { id, number, subject, status, priority, type, contact, company, team, assignee } = ticket;
  const { tags, createdAt, updatedAt, deletedAt, due, mergedInto } = ticket;
  return {
    id,
    number,
    subject,
    status,
    priority,
    type,
    contact,
    company,
    team,
    assignee,
    tags,
    createdAt,
    updatedAt,
    deletedAt,
    due,
    mergedInto,
  };
}

/** The list's query, as the app sends it: comma-separated choices. */
export interface TicketQuery {
  status?: string[];
  priority?: string[];
  type?: string[];
  teamId?: string[];
  assignee?: string[];
  tag?: string[];
  q?: string;
  overdue?: boolean;
  contactId?: string;
  companyId?: string;
  deleted?: boolean;
  sort?: string;
}

export function readTicketQuery(params: URLSearchParams): TicketQuery {
  const list = (name: string) => params.get(name)?.split(',').filter(Boolean);
  const query: TicketQuery = {};
  for (const name of ['status', 'priority', 'type', 'teamId', 'assignee', 'tag'] as const) {
    const values = list(name);
    if (values?.length) query[name] = values;
  }
  const q = params.get('q')?.trim();
  if (q) query.q = q;
  if (params.get('overdue') === 'true') query.overdue = true;
  if (params.get('deleted') === 'true') query.deleted = true;
  const contactId = params.get('contactId');
  if (contactId) query.contactId = contactId;
  const companyId = params.get('companyId');
  if (companyId) query.companyId = companyId;
  query.sort = params.get('sort') ?? 'updated';
  return query;
}

/** `none` means "not set"; `me` is the signed-in person. */
function matchesChoice(values: string[] | undefined, actual: string | null, me: string) {
  if (!values) return true;
  return values.some((value) =>
    value === 'none' ? actual === null : (value === 'me' ? me : value) === actual,
  );
}

function matchesText(data: DemoData, ticket: Ticket, q: string) {
  const text = q.toLowerCase();
  const number = /^#?(\d{1,9})$/.exec(q)?.[1];
  if (number && Number(number) === ticket.number) return true;
  const messages = data.conversations.get(ticket.number)?.messages ?? [];
  return [
    ticket.subject,
    ticket.description,
    ticket.contact.name,
    ticket.contact.email ?? '',
    ...ticket.tags,
    ...messages.map((message) => message.body),
  ].some((value) => value.toLowerCase().includes(text));
}

export function listTickets(data: DemoData, query: TicketQuery, now = Date.now()): Ticket[] {
  const me = data.me.user.id;
  const rows = [...data.tickets.values()].map((ticket) => withLiveSla(ticket, now));
  const found = rows.filter(
    (ticket) =>
      (query.deleted ? ticket.deletedAt !== null : ticket.deletedAt === null) &&
      (!query.status || query.status.includes(ticket.status)) &&
      (!query.priority || query.priority.includes(ticket.priority)) &&
      matchesChoice(query.type, ticket.type, me) &&
      matchesChoice(query.teamId, ticket.team?.id ?? null, me) &&
      matchesChoice(query.assignee, ticket.assignee?.userId ?? null, me) &&
      (!query.tag || query.tag.some((tag) => ticket.tags.includes(tag.toLowerCase()))) &&
      (!query.overdue || (ticket.due !== null && Date.parse(ticket.due.at) < now)) &&
      (!query.contactId || ticket.contact.id === query.contactId) &&
      (!query.companyId || ticket.company?.id === query.companyId) &&
      (!query.q || matchesText(data, ticket, query.q)),
  );
  const time = (value: string) => Date.parse(value);
  const dueRank = (ticket: Ticket) => (ticket.due ? time(ticket.due.at) : Number.MAX_SAFE_INTEGER);
  const sorts: Record<string, (a: Ticket, b: Ticket) => number> = {
    updated: (a, b) => time(b.updatedAt) - time(a.updatedAt),
    created: (a, b) => time(b.createdAt) - time(a.createdAt),
    oldest: (a, b) => time(a.createdAt) - time(b.createdAt),
    priority: (a, b) =>
      PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
      time(b.updatedAt) - time(a.updatedAt),
    due: (a, b) => dueRank(a) - dueRank(b),
  };
  return found.sort(sorts[query.sort ?? 'updated'] ?? sorts.updated);
}

/** The home page's counts, with the same filters as the lists they open. */
export function homeOf(data: DemoData): Home {
  const count = (query: TicketQuery) => listTickets(data, query).length;
  return {
    counts: {
      mine: count({ status: [...UNRESOLVED], assignee: ['me'] }),
      overdue: count({ overdue: true }),
      unassigned: count({ status: [...UNRESOLVED], assignee: ['none'] }),
      waitingOnCustomer: count({ status: ['waiting_on_customer'], assignee: ['me'] }),
    },
    setup: { teamInvited: true, emailConnected: true, businessHoursSet: true },
  };
}

function actorOf(data: DemoData) {
  return { userId: data.me.user.id, name: data.me.user.name };
}

function recordActivity(
  data: DemoData,
  number: number,
  action: TicketActivity['action'],
  changes: TicketActivity['changes'],
) {
  const list = data.activity.get(number) ?? { activity: [] };
  list.activity.push({ id: newId(), at: nowIso(), actor: actorOf(data), action, changes });
  data.activity.set(number, list);
}

/** A status change, with the timestamps the API keeps for it. */
function setStatus(ticket: Ticket, status: Status) {
  ticket.status = status;
  ticket.resolvedAt =
    status === 'resolved' ? nowIso() : status === 'closed' ? ticket.resolvedAt : null;
  ticket.closedAt = status === 'closed' ? nowIso() : null;
  // Done or waiting on the customer: no deadline counts down.
  if (!UNRESOLVED.includes(status) || status === 'waiting_on_customer') ticket.due = null;
}

/** A ticket's edits from its page or the list's bulk actions, recorded in its history. */
export function updateTicket(data: DemoData, ticket: Ticket, changes: UpdateTicketRequestInput) {
  const recorded: TicketActivity['changes'] = [];
  const note = (field: string, from: unknown, to: unknown) => {
    if (JSON.stringify(from) !== JSON.stringify(to)) recorded.push({ field, from, to });
  };
  if (changes.subject !== undefined) {
    note('subject', ticket.subject, changes.subject);
    ticket.subject = changes.subject;
  }
  if (changes.status !== undefined) {
    note('status', ticket.status, changes.status);
    setStatus(ticket, changes.status);
  }
  if (changes.priority !== undefined) {
    note('priority', ticket.priority, changes.priority);
    ticket.priority = changes.priority;
  }
  if (changes.type !== undefined) {
    note('type', ticket.type, changes.type);
    ticket.type = changes.type;
  }
  if (changes.teamId !== undefined) {
    const team = data.teams.teams.find((row) => row.id === changes.teamId);
    const next = team ? { id: team.id, name: team.name } : null;
    note('team', ticket.team?.name ?? null, next?.name ?? null);
    ticket.team = next;
  }
  if (changes.assigneeUserId !== undefined) {
    const person = data.people.people.find((row) => row.userId === changes.assigneeUserId);
    const next = person ? { userId: person.userId, name: person.name } : null;
    note('assignee', ticket.assignee?.name ?? null, next?.name ?? null);
    ticket.assignee = next;
  }
  if (changes.contactId !== undefined) {
    const contact = data.contacts.get(changes.contactId);
    if (contact) {
      note('requester', ticket.contact.name, contact.name);
      ticket.contact = { id: contact.id, name: contact.name, email: contact.email };
      ticket.company = contact.company;
    }
  }
  if (changes.tags !== undefined) {
    const tags = [...new Set(changes.tags.map((tag) => tag.trim().toLowerCase()))].filter(Boolean);
    note('tags', ticket.tags, tags);
    ticket.tags = tags;
  }
  if (changes.customFields !== undefined) {
    for (const [key, value] of Object.entries(changes.customFields)) {
      note(`customFields.${key}`, ticket.customFields[key] ?? null, value);
    }
    ticket.customFields = { ...ticket.customFields, ...changes.customFields };
  }
  if (recorded.length > 0) {
    ticket.updatedAt = nowIso();
    recordActivity(data, ticket.number, 'updated', recorded);
  }
}

/** A reply, note or forward from the signed-in person; replies count as the first response. */
export function postMessage(data: DemoData, ticket: Ticket, input: PostMessageRequestInput) {
  const conversation = data.conversations.get(ticket.number) ?? {
    messages: [],
    descriptionFiles: [],
  };
  const people = data.people.people;
  const sentToCustomer = input.kind !== 'note';
  const message: TicketMessage = {
    id: newId(),
    kind: input.kind,
    body: input.body,
    bodyHtml: null,
    author: { type: 'member', ...actorOf(data) },
    to: input.kind === 'reply' ? [ticket.contact.email ?? ''].filter(Boolean) : (input.to ?? []),
    cc: input.cc ?? [],
    mentions: (input.mentions ?? []).flatMap((userId) => {
      const person = people.find((row) => row.userId === userId);
      return person ? [{ userId, name: person.name }] : [];
    }),
    emailStatus: sentToCustomer ? 'sent' : null,
    emailSentAt: sentToCustomer ? nowIso() : null,
    emailError: null,
    attachments: [],
    fromTicketNumber: null,
    createdAt: nowIso(),
  };
  conversation.messages.push(message);
  data.conversations.set(ticket.number, conversation);
  if (input.kind === 'reply') {
    ticket.firstResponseAt ??= message.createdAt;
    const reply = ticket.sla?.reply;
    if (reply && (reply.state === 'running' || reply.state === 'overdue')) {
      reply.state = reply.state === 'running' ? 'met' : 'missed';
      reply.doneAt = message.createdAt;
    }
  }
  if (input.status && input.status !== ticket.status) {
    recordActivity(data, ticket.number, 'updated', [
      { field: 'status', from: ticket.status, to: input.status },
    ]);
    setStatus(ticket, input.status);
  }
  ticket.updatedAt = message.createdAt;
}
