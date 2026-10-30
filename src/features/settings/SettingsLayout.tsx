import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { Link, NavLink, Outlet, useMatch } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { NoAccessState } from '../../components/StateMessage';
import { cn } from '../../lib/cn';
import { can, useSession } from '../workspace/session-context';
import { SETTINGS_GROUPS, type SettingsPage } from './settings-pages';

/** The groups and pages this person can see; groups with none are left out. */
function useVisibleGroups() {
  const me = useSession();
  return SETTINGS_GROUPS.map((group) => ({
    label: group.label,
    pages: group.pages.filter((page) => can(me, page.permission)),
  })).filter((group) => group.pages.length > 0);
}

const menuLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm',
    isActive
      ? 'bg-brand-tint font-semibold text-brand-tint-text'
      : 'text-ink hover:bg-surface-sunken',
  );

/**
 * The settings area (Step 5b). From 1024px: a grouped menu with icons beside the page. Narrower
 * (phones, tablets): the overview is the menu, and each page starts with a link back to it.
 */
export function SettingsLayout() {
  const me = useSession();
  const groups = useVisibleGroups();
  const onOverview = useMatch('/settings') !== null;
  if (groups.length === 0) {
    return (
      <>
        <PageHeader title="Settings" />
        <NoAccessState
          area="settings"
          explanation={`Only admins and supervisors use settings. Ask an admin of ${me.workspace.name} if something needs changing.`}
        />
      </>
    );
  }
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">
      <nav
        aria-label="Settings"
        className="hidden lg:sticky lg:top-0 lg:block lg:w-52 lg:shrink-0 lg:self-start"
      >
        <NavLink to="/settings" end className={menuLink}>
          {({ isActive }) => (
            <>
              <LayoutGrid
                aria-hidden
                className={cn(
                  'size-4 shrink-0',
                  isActive ? 'text-brand-tint-text' : 'text-ink-muted',
                )}
              />
              All settings
            </>
          )}
        </NavLink>
        {groups.map((group) => (
          <div key={group.label}>
            <p
              id={`settings-menu-${group.label}`}
              className="px-2.5 pt-4 pb-1 text-[11px] font-semibold tracking-wide text-ink-subtle uppercase"
            >
              {group.label}
            </p>
            <ul aria-labelledby={`settings-menu-${group.label}`} className="flex flex-col gap-0.5">
              {group.pages.map((page) => (
                <li key={page.to}>
                  <NavLink to={page.to} className={menuLink}>
                    {({ isActive }) => (
                      <>
                        <page.icon
                          aria-hidden
                          className={cn(
                            'size-4 shrink-0',
                            isActive ? 'text-brand-tint-text' : 'text-ink-muted',
                          )}
                        />
                        {page.label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {!onOverview && (
          <Link
            to="/settings"
            className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-link hover:underline lg:hidden"
          >
            <ChevronLeft aria-hidden className="size-4" />
            All settings
          </Link>
        )}
        <Outlet />
      </div>
    </div>
  );
}

function OverviewTile({ page }: { page: SettingsPage }) {
  return (
    <Link
      to={page.to}
      className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 hover:border-brand-200 hover:bg-brand-tint/40"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-tint-text">
        <page.icon aria-hidden className="size-4.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-ink">{page.label}</span>
        <span className="text-xs text-ink-muted">{page.description}</span>
      </span>
      <ChevronRight aria-hidden className="mt-2.5 size-4 shrink-0 text-ink-subtle lg:hidden" />
    </Link>
  );
}

/** /settings: every settings page this person can open, in its group. */
export function SettingsOverview() {
  const me = useSession();
  const groups = useVisibleGroups();
  return (
    <>
      <PageHeader title="Settings" />
      <p className="-mt-2 mb-4 text-sm text-ink-muted">
        Everything set up for {me.workspace.name}. You see the pages your role can use.
      </p>
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.label} aria-labelledby={`settings-${group.label}`}>
            <h2
              id={`settings-${group.label}`}
              className="mb-2 text-[11px] font-semibold tracking-wide text-ink-subtle uppercase"
            >
              {group.label}
            </h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
              {group.pages.map((page) => (
                <li key={page.to} className="grid">
                  <OverviewTile page={page} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
