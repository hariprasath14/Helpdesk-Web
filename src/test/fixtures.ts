import { HttpResponse } from 'msw';
import type { Me } from '../api/generated/model';

/** renderRoute's `host` for a workspace address (acme.helpdesk.test in tests). */
export const WORKSPACE = { kind: 'workspace', subdomain: 'acme' } as const;

/** A signed-in owner, as GET /api/v1/me returns it. */
export const me: Me = {
  user: { id: 'u1', name: 'Ravi Shankar', email: 'ravi@acme.test', theme: null },
  workspace: { id: 'w1', name: 'Acme Support', subdomain: 'acme', timezone: 'Asia/Kolkata' },
  role: 'admin',
  isOwner: true,
  permissions: [
    'tickets.work',
    'tickets.assign_any',
    'tickets.merge',
    'tickets.delete',
    'contacts.edit',
    'contacts.delete',
    'canned_responses.manage_shared',
    'views.manage_shared',
    'members.view',
    'members.manage',
    'teams.manage',
    'settings.manage',
    'audit_log.view',
  ],
  twoFactor: { enabled: false, recoveryCodesLeft: 0, required: false, setupRequired: false },
  csrfToken: 'csrf-token-1',
};

/** The API's standard error body. */
export const apiError = (status: number, code: string, message: string, details?: unknown) =>
  HttpResponse.json({ error: { code, message, details } }, { status });

/** GET /me for a request with no session. */
export const signedOut = () => apiError(401, 'UNAUTHORIZED', 'You need to sign in.');
