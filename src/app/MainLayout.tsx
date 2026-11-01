import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useGetApiV1Me } from '../api/generated/accounts/accounts';
import { ApiError } from '../api/http';
import { Spinner } from '../components/Spinner';
import { ErrorState } from '../components/StateMessage';
import { config } from '../config';
import { loginPath } from '../features/auth/next-path';
import { NewCompanyDrawer, NewContactDrawer } from '../features/contacts/NewRecordDrawers';
import { useSignOut } from '../features/auth/use-sign-out';
import { goTo } from '../lib/go-to';
import { TwoFactorRequiredPage } from '../features/two-factor/TwoFactorRequiredPage';
import { WorkspaceNotFoundPage } from '../features/workspace/pages';
import { SessionContext } from '../features/workspace/session-context';
import { useBrand } from './brand-context';
import { mainOrigin } from './host';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { LiveProvider } from './LiveProvider';
import { previewShellConfig, workspaceShellConfig } from './shell-config';
import { AppShell } from './shell/AppShell';

/**
 * Signed-in pages on a workspace address: checks the session (/me), then renders the app shell.
 * No sign-in → the login page, coming back here afterwards ("your session ended" when it ran out
 * while open); unknown or unconfirmed workspace → not-found page.
 */
export function MainLayout() {
  const me = useGetApiV1Me({ query: { retry: false, staleTime: 60_000 } });
  // The colour theme the person chose in Your account → Appearance, else this deployment's brand.
  const { setBrand } = useBrand();
  const theme = me.data?.user.theme ?? config.brand;
  useEffect(() => {
    setBrand(theme);
  }, [setBrand, theme]);
  const location = useLocation();
  const navigate = useNavigate();
  const signOut = useSignOut();
  // New → Contact or Company opens its drawer over whatever page is open.
  const [creating, setCreating] = useState<'contact' | 'company' | null>(null);

  if (me.isPending) {
    return (
      <div
        role="status"
        className="flex min-h-dvh items-center justify-center gap-2 text-ink-muted"
      >
        <Spinner className="size-5" /> Opening your workspace…
      </div>
    );
  }
  if (me.error instanceof ApiError && me.error.status === 401) {
    const here = `${location.pathname}${location.search}`;
    return <Navigate to={loginPath(here, me.data ? 'expired' : undefined)} replace />;
  }
  if (me.error instanceof ApiError && me.error.status === 404) return <WorkspaceNotFoundPage />;
  if (me.isError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <ErrorState
          what="your workspace"
          retrying={me.isFetching}
          onRetry={() => {
            void me.refetch();
          }}
        />
      </main>
    );
  }

  const { twoFactor } = me.data;
  if (twoFactor.setupRequired) return <TwoFactorRequiredPage me={me.data} />;

  return (
    <SessionContext value={me.data}>
      <LiveProvider>
        <AppShell
          config={{
            ...workspaceShellConfig(me.data, {
              openAccount: () => {
                void navigate('/account');
              },
              findWorkspaces: () => {
                goTo(`${mainOrigin(config.appDomain, window.location)}/login`);
              },
              signOut,
              newTicket: () => {
                void navigate('/tickets/new');
              },
              newContact: () => {
                setCreating('contact');
              },
              newCompany: () => {
                setCreating('company');
              },
              searchTickets: (query) => {
                void navigate(
                  `/tickets?${new URLSearchParams({ view: 'all', q: query }).toString()}`,
                );
              },
            }),
            notifications: <NotificationBell />,
          }}
        >
          {twoFactor.enabled && twoFactor.recoveryCodesLeft <= 2 && (
            <p
              role="status"
              className="mb-4 rounded-lg bg-warning-bg px-4 py-3 text-sm text-warning-text"
            >
              You have{' '}
              {twoFactor.recoveryCodesLeft === 1
                ? '1 recovery code'
                : `${String(twoFactor.recoveryCodesLeft)} recovery codes`}{' '}
              left.{' '}
              <Link to="/account?tab=security" className="font-medium underline">
                Create new ones
              </Link>
            </p>
          )}
          <Outlet />
          {creating === 'contact' && (
            <NewContactDrawer
              onClose={() => {
                setCreating(null);
              }}
            />
          )}
          {creating === 'company' && (
            <NewCompanyDrawer
              onClose={() => {
                setCreating(null);
              }}
            />
          )}
        </AppShell>
      </LiveProvider>
    </SessionContext>
  );
}

/** The design preview's shell on the main address (no sign-in involved). */
export function PreviewLayout() {
  return (
    <AppShell config={previewShellConfig}>
      <Outlet />
    </AppShell>
  );
}
