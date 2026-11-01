import { Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { Menu, MenuItem } from '../../components/Menu';
import { cn } from '../../lib/cn';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import type { ShellConfig } from './types';
import { useSidebarCollapsed } from './useSidebarCollapsed';

interface AppShellProps {
  config: ShellConfig;
  /** The page; usually the router's <Outlet />. */
  children: ReactNode;
}

/**
 * The frame around every signed-in page (Figma "App shell"): dark brand sidebar on the left, white top
 * bar, light grey page area with 24px gutters. On phones the sidebar becomes a slide-in menu and
 * "New" becomes a floating button.
 */
export function AppShell({ config, children }: AppShellProps) {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const newActions = config.newActions ?? [];
  // A ticket has its own reply bar at the bottom on phones, and New ticket its own buttons
  // (Step 5b), so no floating button there.
  const onTicket = /^\/tickets\/(\d+|new)$/.test(useLocation().pathname);
  const hasFab = newActions.length > 0 && !onTicket;

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-page">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-surface px-4 py-2 font-medium text-ink shadow-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Sidebar
        nav={config.nav}
        footerNav={config.footerNav ?? []}
        collapsed={collapsed}
        onToggle={toggleCollapsed}
      />
      <MobileNav
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        nav={config.nav}
        footerNav={config.footerNav ?? []}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          config={config}
          onOpenMobileNav={() => {
            setMobileNavOpen(true);
          }}
        />
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            // A column, so a page can fill it and scroll inside itself (the ticket list, Step 5b).
            // Relative, so screen-reader-only text (absolutely placed) scrolls with the page
            // instead of stretching the whole window and adding a second scrollbar.
            'relative flex flex-1 flex-col overflow-y-auto px-4 py-5 outline-none md:px-6',
            // Room under the last line on phones, so the floating New button never covers it.
            hasFab && 'max-md:pb-24',
          )}
        >
          {children}
        </main>
      </div>

      {hasFab && (
        <div className="fixed right-4 bottom-4 md:hidden">
          <Menu
            align="end"
            trigger={
              <button
                type="button"
                aria-label="New"
                className="flex size-14 items-center justify-center rounded-full bg-brand-button text-white shadow-lg hover:bg-brand-button-hover"
              >
                <Plus aria-hidden className="size-6" />
              </button>
            }
          >
            {newActions.map(({ label, icon: Icon, onSelect }) => (
              <MenuItem key={label} onSelect={onSelect} icon={<Icon />}>
                {label}
              </MenuItem>
            ))}
          </Menu>
        </div>
      )}
    </div>
  );
}
