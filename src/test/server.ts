import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { HealthResponse, Home, NotificationEmailChoices } from '../api/generated/model';
import { config } from '../config';

/** Builds a full API URL for MSW handlers, matching what apiFetch calls. */
export const apiUrl = (path: string) => `${config.apiUrl}${path}`;

export const healthyResponse: HealthResponse = {
  status: 'ok',
  version: 'test',
  uptimeSeconds: 1,
  checks: { databaseWriter: 'ok', databaseReader: 'ok' },
};

/** Notification email choices as a member starts with them (F25). */
export const defaultEmailChoices: NotificationEmailChoices = {
  assigned: true,
  mention: true,
  sla_warning: true,
  sla_breach: true,
  customer_reply: false,
};

/** The home page's counts (F29) as a new workspace starts: nothing yet, nothing set up. */
export const emptyHome: Home = {
  counts: { mine: 0, overdue: 0, unassigned: 0, waitingOnCustomer: 0 },
  setup: { teamInvited: false, emailConnected: false, businessHoursSet: false },
};

/**
 * Default handlers: a healthy API, an empty notification center (the bell is on every signed-in
 * page) and an empty home page. Tests override them with `server.use(...)`.
 */
export const server = setupServer(
  http.get(apiUrl('/health'), () => HttpResponse.json(healthyResponse)),
  http.get(apiUrl('/api/v1/notifications/unread'), () => HttpResponse.json({ unread: 0 })),
  http.get(apiUrl('/api/v1/notifications'), () =>
    HttpResponse.json({ notifications: [], unread: 0, nextCursor: null }),
  ),
  http.get(apiUrl('/api/v1/notifications/email'), () => HttpResponse.json(defaultEmailChoices)),
  http.get(apiUrl('/api/v1/home'), () => HttpResponse.json(emptyHome)),
  // The ticket page's requester card lists their other open tickets (Step 5b).
  http.get(apiUrl('/api/v1/tickets'), () =>
    HttpResponse.json({ tickets: [], nextCursor: null, total: 0 }),
  ),
);
