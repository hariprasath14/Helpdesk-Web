import {
  Building,
  Building2,
  House,
  LogOut,
  Palette,
  Settings,
  Ticket,
  UserRound,
  UsersRound,
} from 'lucide-react';
import type { Me } from '../api/generated/model';
import { SETTINGS_PAGES } from '../features/settings/settings-pages';
import type { ShellConfig } from './shell/types';

const ROLE_NAMES: Record<Me['role'], string> = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  agent: 'Agent',
};

export interface UserMenuActions {
  openAccount: () => void;
  findWorkspaces: () => void;
  signOut: () => void;
  newTicket: () => void;
  newContact: () => void;
  newCompany: () => void;
  searchTickets: (query: string) => void;
}

/**
 * The real app's shell for the signed-in member. Each feature adds its parts as it is built:
 * navigation items, notifications (F25), trial and Upgrade (F30).
 */
export function workspaceShellConfig(me: Me, actions: UserMenuActions): ShellConfig {
  return {
    nav: [
      { label: 'Home', to: '/', icon: House },
      { label: 'Tickets', to: '/tickets', icon: Ticket },
      { label: 'Contacts', to: '/contacts', icon: UsersRound },
      { label: 'Companies', to: '/companies', icon: Building },
    ],
    newActions: [
      { label: 'Ticket', icon: Ticket, onSelect: actions.newTicket },
      { label: 'Contact', icon: UsersRound, onSelect: actions.newContact },
      { label: 'Company', icon: Building, onSelect: actions.newCompany },
    ],
    search: { placeholder: 'Search tickets', onSearch: actions.searchTickets },
    // Shown when at least one settings page is open to this person (agents: Canned responses).
    ...(SETTINGS_PAGES.some((page) => me.permissions.includes(page.permission))
      ? { footerNav: [{ label: 'Settings', to: '/settings', icon: Settings }] }
      : {}),
    user: {
      name: me.user.name,
      email: me.user.email,
      roleLine: `${ROLE_NAMES[me.role]} · ${me.workspace.name}`,
      menu: [
        { label: 'Your account', icon: UserRound, onSelect: actions.openAccount },
        { label: 'Find your other workspaces', icon: Building2, onSelect: actions.findWorkspaces },
        { label: 'Sign out', icon: LogOut, onSelect: actions.signOut },
      ],
    },
  };
}

/** The shell around the design preview on the main address (local and dev only). */
export const previewShellConfig: ShellConfig = {
  nav: [{ label: 'Design preview', to: '/design', icon: Palette }],
};
