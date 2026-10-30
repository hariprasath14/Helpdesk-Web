import { Navigate, type RouteObject } from 'react-router';
import type { AppConfig } from '../config';
import { LegalPage } from '../features/auth/LegalPage';
import { NotFoundPage, RouteErrorPage } from '../features/system/pages';
import { HomePage } from '../features/home/HomePage';
import type { HostKind } from './host';
import { MainLayout, PreviewLayout } from './MainLayout';

const lazyPage =
  <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const legal: RouteObject[] = [
  { path: 'terms', element: <LegalPage title="Terms of Service" /> },
  { path: 'privacy', element: <LegalPage title="Privacy Policy" /> },
];

/**
 * The main address (helpdesk.example.com): sign-up and its emails, "find your workspace" sign-in, legal
 * pages, design preview.
 */
function mainRoutes(config: Pick<AppConfig, 'designPreview'>): RouteObject[] {
  const preview: RouteObject[] = config.designPreview
    ? [
        {
          element: <PreviewLayout />,
          children: [
            {
              path: 'design',
              lazy: lazyPage(
                () => import('../features/design-preview/DesignPreviewPage'),
                'DesignPreviewPage',
              ),
            },
          ],
        },
        {
          // The sample sidebar links (contacts, settings) stay inside the preview.
          path: 'design/shell/*',
          lazy: lazyPage(
            () => import('../features/design-preview/ShellPreviewPage'),
            'ShellPreviewPage',
          ),
        },
      ]
    : [];
  return [
    { index: true, element: <Navigate to="/signup" replace /> },
    { path: 'signup', lazy: lazyPage(() => import('../features/auth/SignUpPage'), 'SignUpPage') },
    {
      path: 'signup/check-email',
      lazy: lazyPage(() => import('../features/auth/CheckEmailPage'), 'CheckEmailPage'),
    },
    {
      path: 'login',
      lazy: lazyPage(() => import('../features/auth/FindWorkspacePage'), 'FindWorkspacePage'),
    },
    ...legal,
    ...preview,
    { path: '*', element: <NotFoundPage /> },
  ];
}

/**
 * A workspace address (acme.helpdesk.example.com): login, password reset and email links, the public web
 * form, then the signed-in app.
 */
function workspaceRoutes(): RouteObject[] {
  return [
    { path: 'login', lazy: lazyPage(() => import('../features/auth/LoginPage'), 'LoginPage') },
    {
      path: 'forgot-password',
      lazy: lazyPage(() => import('../features/auth/ForgotPasswordPage'), 'ForgotPasswordPage'),
    },
    {
      path: 'reset-password',
      lazy: lazyPage(() => import('../features/auth/ResetPasswordPage'), 'ResetPasswordPage'),
    },
    {
      path: 'invite',
      lazy: lazyPage(() => import('../features/members/AcceptInvitePage'), 'AcceptInvitePage'),
    },
    {
      path: 'verify-email',
      lazy: lazyPage(() => import('../features/auth/VerifyEmailPage'), 'VerifyEmailPage'),
    },
    ...legal,
    // The public "Contact support" page (F16): no sign-in, and it may be embedded in other sites.
    {
      path: 'support',
      lazy: lazyPage(() => import('../features/web-form/WebFormPage'), 'WebFormPage'),
    },
    {
      element: <MainLayout />,
      children: [
        { index: true, element: <HomePage /> },
        {
          path: 'account',
          lazy: lazyPage(() => import('../features/account/AccountPage'), 'AccountPage'),
        },
        {
          path: 'tickets',
          lazy: lazyPage(() => import('../features/tickets/TicketsPage'), 'TicketsPage'),
        },
        {
          path: 'tickets/new',
          lazy: lazyPage(() => import('../features/tickets/NewTicketPage'), 'NewTicketPage'),
        },
        {
          path: 'tickets/:number',
          lazy: lazyPage(() => import('../features/tickets/TicketPage'), 'TicketPage'),
        },
        {
          path: 'contacts',
          lazy: lazyPage(() => import('../features/contacts/ContactsPage'), 'ContactsPage'),
        },
        {
          path: 'contacts/:contactId',
          lazy: lazyPage(() => import('../features/contacts/ContactPage'), 'ContactPage'),
        },
        {
          path: 'companies',
          lazy: lazyPage(() => import('../features/contacts/CompaniesPage'), 'CompaniesPage'),
        },
        {
          path: 'companies/:companyId',
          lazy: lazyPage(() => import('../features/contacts/CompanyPage'), 'CompanyPage'),
        },
        {
          path: 'settings',
          lazy: lazyPage(() => import('../features/settings/SettingsLayout'), 'SettingsLayout'),
          children: [
            {
              index: true,
              lazy: lazyPage(
                () => import('../features/settings/SettingsLayout'),
                'SettingsOverview',
              ),
            },
            {
              path: 'members',
              lazy: lazyPage(() => import('../features/members/MembersPage'), 'MembersPage'),
            },
            {
              path: 'teams',
              lazy: lazyPage(() => import('../features/teams/TeamsPage'), 'TeamsPage'),
            },
            {
              path: 'fields',
              lazy: lazyPage(
                () => import('../features/custom-fields/CustomFieldsPage'),
                'CustomFieldsPage',
              ),
            },
            {
              path: 'rules',
              lazy: lazyPage(() => import('../features/rules/RulesPage'), 'RulesPage'),
            },
            {
              path: 'slas',
              lazy: lazyPage(() => import('../features/sla/SlaPoliciesPage'), 'SlaPoliciesPage'),
            },
            {
              path: 'business-hours',
              lazy: lazyPage(
                () => import('../features/business-hours/BusinessHoursPage'),
                'BusinessHoursPage',
              ),
            },
            {
              path: 'canned-responses',
              lazy: lazyPage(
                () => import('../features/canned-responses/CannedResponsesPage'),
                'CannedResponsesPage',
              ),
            },
            {
              path: 'email',
              lazy: lazyPage(
                () => import('../features/settings/EmailSettingsPage'),
                'EmailSettingsPage',
              ),
            },
            {
              path: 'web-form',
              lazy: lazyPage(
                () => import('../features/settings/WebFormSettingsPage'),
                'WebFormSettingsPage',
              ),
            },
            {
              path: 'security',
              lazy: lazyPage(
                () => import('../features/settings/SecuritySettingsPage'),
                'SecuritySettingsPage',
              ),
            },
            {
              path: 'audit-log',
              lazy: lazyPage(() => import('../features/audit/AuditLogPage'), 'AuditLogPage'),
            },
          ],
        },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}

/**
 * All routes. Which set applies depends on the address (see host.ts). Pages that are not needed at
 * start load on demand (`lazy`), so the first download stays small.
 */
export function createRoutes(
  config: Pick<AppConfig, 'designPreview'>,
  host: HostKind,
): RouteObject[] {
  return [
    {
      path: '/',
      errorElement: <RouteErrorPage />,
      children: host.kind === 'workspace' ? workspaceRoutes() : mainRoutes(config),
    },
  ];
}
