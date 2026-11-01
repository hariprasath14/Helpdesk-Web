import type {
  AuditPage,
  BusinessHours,
  CannedResponseList,
  Company,
  Contact,
  CustomFieldList,
  EmailSettings,
  Me,
  MembersList,
  NotificationEmailChoices,
  NotificationPage,
  PeopleList,
  RuleList,
  SavedViewList,
  SlaPolicyList,
  TagSuggestions,
  TeamList,
  Ticket,
  TicketActivityList,
  TicketConversation,
  WebFormSettings,
  WorkspaceSecurity,
} from '../api/generated/model';
import snapshotJson from './snapshot.json';

/**
 * What the real API returned for the sample workspace, saved by `npm run demo:snapshot`
 * (e2e/demo/seed.demo.ts). snapshot.test.ts checks it against the API contract.
 */
export interface DemoSnapshot {
  takenAt: string;
  me: Me;
  members: MembersList;
  people: PeopleList;
  teams: TeamList;
  views: SavedViewList;
  tags: TagSuggestions;
  customFields: Record<'ticket' | 'contact' | 'company', CustomFieldList>;
  contacts: Contact[];
  companies: Company[];
  tickets: Ticket[];
  conversations: Record<string, TicketConversation>;
  activity: Record<string, TicketActivityList>;
  cannedResponses: CannedResponseList;
  rules: RuleList;
  slaPolicies: SlaPolicyList;
  businessHours: BusinessHours;
  emailSettings: EmailSettings;
  webFormSettings: WebFormSettings;
  security: WorkspaceSecurity;
  audit: AuditPage;
  notifications: NotificationPage;
  emailChoices: NotificationEmailChoices;
}

export const snapshot = snapshotJson as unknown as DemoSnapshot;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * How old each sample ticket looks, in hours, by ticket number. The seed makes them all within a
 * minute or two; spreading them over a week makes the list, SLA timers and history believable.
 */
const TICKET_AGE_HOURS: Record<number, number> = {
  1: 26,
  2: 30,
  3: 70,
  4: 96,
  5: 3,
  6: 5,
  7: 20,
  8: 2,
  9: 44,
  10: 22,
  11: 50,
  12: 26,
  13: 120,
  14: 0.7,
  15: 8,
};
/** Workspace history (members joining, settings, audit log) spreads over this long. */
const HISTORY_SPAN = 7 * DAY;

/** Date-times as the API writes them: 2026-11-01T09:07:47.676Z */
const ISO_DATE_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

/** A copy of `value` with every date-time string passed through `move`. */
function moveDates<T>(value: T, move: (time: number) => number): T {
  return JSON.parse(JSON.stringify(value), (_key, item: unknown) =>
    typeof item === 'string' && ISO_DATE_TIME.test(item)
      ? new Date(move(Date.parse(item))).toISOString()
      : item,
  ) as T;
}

/** Deadlines keep their distance from when the ticket was created; events are spread out. */
function moveTicket(
  ticket: Ticket,
  conversation: TicketConversation,
  activity: TicketActivityList,
  now: number,
  takenAt: number,
) {
  const created = Date.parse(ticket.createdAt);
  const age = (TICKET_AGE_HOURS[ticket.number] ?? 12) * HOUR;
  const newCreated = now - age;
  // What had happened by the snapshot lands within the first 60% of the ticket's age, in its real
  // order; later times are deadlines, which keep their distance from the ticket's creation.
  const stretch = (0.6 * age) / Math.max(takenAt - created, 1);
  const deadline = (time: number) => newCreated + (time - created);
  const event = (time: number) =>
    time > takenAt ? deadline(time) : newCreated + Math.max(time - created, 0) * stretch;
  const deadlineOf = (dueAt: string) => new Date(deadline(Date.parse(dueAt))).toISOString();

  const moved = moveDates(ticket, event);
  const { due, sla } = ticket;
  moved.due = due ? { ...due, at: deadlineOf(due.at) } : null;
  if (moved.sla && sla) {
    for (const target of ['reply', 'resolve'] as const) {
      const original = sla[target];
      const copy = moved.sla[target];
      if (original && copy) copy.dueAt = deadlineOf(original.dueAt);
    }
  }
  return {
    ticket: moved,
    conversation: moveDates(conversation, event),
    activity: moveDates(activity, event),
  };
}

/** The sample workspace as of `now`: a fresh copy, with dates moved to look current. */
export function freshDemoData(now = Date.now()) {
  const takenAt = Date.parse(snapshot.takenAt);
  const earliest = Math.min(
    ...snapshot.audit.entries.map((entry) => Date.parse(entry.occurredAt)),
    takenAt - 1,
  );
  // Workspace history: the seed's few minutes become the last week.
  const history = (time: number) =>
    now - Math.max(takenAt - time, 0) * (HISTORY_SPAN / Math.max(takenAt - earliest, 1));

  const tickets = new Map<number, Ticket>();
  const conversations = new Map<number, TicketConversation>();
  const activity = new Map<number, TicketActivityList>();
  for (const ticket of snapshot.tickets) {
    const moved = moveTicket(
      ticket,
      snapshot.conversations[ticket.number] ?? { messages: [], descriptionFiles: [] },
      snapshot.activity[ticket.number] ?? { activity: [] },
      now,
      takenAt,
    );
    tickets.set(ticket.number, moved.ticket);
    conversations.set(ticket.number, moved.conversation);
    activity.set(ticket.number, moved.activity);
  }

  return {
    me: moveDates(snapshot.me, history),
    members: moveDates(snapshot.members, history),
    people: moveDates(snapshot.people, history),
    teams: moveDates(snapshot.teams, history),
    views: moveDates(snapshot.views, history),
    tags: moveDates(snapshot.tags, history),
    customFields: moveDates(snapshot.customFields, history),
    contacts: new Map(
      moveDates(snapshot.contacts, history).map((contact) => [contact.id, contact]),
    ),
    companies: new Map(
      moveDates(snapshot.companies, history).map((company) => [company.id, company]),
    ),
    tickets,
    conversations,
    activity,
    cannedResponses: moveDates(snapshot.cannedResponses, history),
    rules: moveDates(snapshot.rules, history),
    slaPolicies: moveDates(snapshot.slaPolicies, history),
    businessHours: moveDates(snapshot.businessHours, history),
    emailSettings: moveDates(snapshot.emailSettings, history),
    webFormSettings: moveDates(snapshot.webFormSettings, history),
    security: moveDates(snapshot.security, history),
    audit: moveDates(snapshot.audit, history),
    // A notification came with the latest change on its ticket.
    notifications: {
      ...snapshot.notifications,
      notifications: snapshot.notifications.notifications.map((notification) => ({
        ...notification,
        createdAt: notification.ticket
          ? (tickets.get(notification.ticket.number)?.updatedAt ?? notification.createdAt)
          : new Date(history(Date.parse(notification.createdAt))).toISOString(),
      })),
    },
    emailChoices: snapshot.emailChoices,
  };
}

export type DemoData = ReturnType<typeof freshDemoData>;
