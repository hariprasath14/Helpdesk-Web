import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings, Ticket, UserRound } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../components/Tooltip';
import { AppShell } from './AppShell';
import type { ShellConfig } from './types';

const minimal: ShellConfig = {
  nav: [
    { label: 'Tickets', to: '/tickets', icon: Ticket, count: 12 },
    { label: 'Contacts', to: '/contacts', icon: UserRound },
  ],
  footerNav: [{ label: 'Settings', to: '/settings', icon: Settings }],
};

function renderShell(config: ShellConfig = minimal, path = '/tickets') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <AppShell config={config}>
          <p>Page body</p>
        </AppShell>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  localStorage.clear();
});

describe('AppShell', () => {
  it('renders the page in the main area with a skip link to it', () => {
    renderShell();
    expect(screen.getByRole('main')).toHaveTextContent('Page body');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
  });

  it('marks the current page in the sidebar', () => {
    renderShell();
    const sidebar = screen.getAllByRole('navigation', { name: 'Main' })[0];
    if (!sidebar) throw new Error('sidebar missing');
    expect(within(sidebar).getByRole('link', { name: /Tickets/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(sidebar).getByRole('link', { name: 'Contacts' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('starts as icons on tablets, where expanding lasts for the visit only', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    try {
      renderShell();
      await userEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
      expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
      expect(localStorage.getItem('helpdesk.sidebarCollapsed')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('collapses to icons, remembers it, and keeps every link named', async () => {
    const { unmount } = renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    expect(localStorage.getItem('helpdesk.sidebarCollapsed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('link', { name: 'Contacts' })).toBeInTheDocument();

    unmount();
    renderShell();
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('still collapses when the browser blocks storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    setItem.mockRestore();
  });

  it('opens and closes the phone menu', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    const menu = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(menu).getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('link', { name: 'Settings' }));
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
  });

  it('shows no trial, search, New, notifications, help or user until a feature provides them', () => {
    renderShell();
    for (const name of [/Upgrade/, /^New$/, /Notifications/, /Help/, /account menu/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
  });

  it('shows every top bar part when provided, and they work', async () => {
    const calls = {
      search: vi.fn(),
      upgrade: vi.fn(),
      newTicket: vi.fn(),
      bell: vi.fn(),
      help: vi.fn(),
      logout: vi.fn(),
    };
    renderShell({
      ...minimal,
      search: { placeholder: 'Search tickets', onSearch: calls.search },
      trial: { daysLeft: 12, onUpgrade: calls.upgrade },
      newActions: [{ label: 'Ticket', icon: Ticket, onSelect: calls.newTicket }],
      notifications: (
        <button type="button" onClick={calls.bell}>
          Notifications, 3 unread
        </button>
      ),
      onHelp: calls.help,
      user: {
        name: 'Ravi Shankar',
        email: 'ravi@acme.com',
        roleLine: 'Admin · Acme Support',
        menu: [{ label: 'Log out', onSelect: calls.logout, danger: true }],
      },
    });

    await userEvent.type(screen.getByPlaceholderText('Search tickets'), '  #1042  {Enter}');
    expect(calls.search).toHaveBeenCalledWith('#1042');

    expect(screen.getByText('Trial · 12 days left')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(calls.upgrade).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole('button', { name: 'Notifications, 3 unread' }));
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(calls.bell).toHaveBeenCalledOnce();
    expect(calls.help).toHaveBeenCalledOnce();

    // The desktop New button comes first; the phone floating button is the second.
    const [desktopNew] = screen.getAllByRole('button', { name: /^New/ });
    if (!desktopNew) throw new Error('New button missing');
    await userEvent.click(desktopNew);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ticket' }));
    expect(calls.newTicket).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole('button', { name: /Ravi Shankar.*account menu/ }));
    expect(screen.getByRole('menu')).toHaveTextContent('ravi@acme.com');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(calls.logout).toHaveBeenCalledOnce();
  });

  it('leaves out the floating New button on a ticket, which has its own reply bar', () => {
    const newActions = [{ label: 'Ticket', icon: Ticket, onSelect: vi.fn() }];
    const { unmount } = renderShell({ ...minimal, newActions }, '/tickets');
    expect(screen.getAllByRole('button', { name: /^New/ })).toHaveLength(2);
    unmount();
    renderShell({ ...minimal, newActions }, '/tickets/42');
    expect(screen.getAllByRole('button', { name: /^New/ })).toHaveLength(1);
  });

  it('ignores an empty search', async () => {
    const onSearch = vi.fn();
    renderShell({ ...minimal, search: { placeholder: 'Search tickets', onSearch } });
    await userEvent.type(screen.getByPlaceholderText('Search tickets'), '   {Enter}');
    expect(onSearch).not.toHaveBeenCalled();
  });
});
