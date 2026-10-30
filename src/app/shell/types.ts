import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Small count on the item, for example open tickets assigned to me. */
  count?: number;
  /** Shows a dot on the icon when collapsed, for example new activity. */
  attention?: boolean;
}

export interface NewAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
}

export interface ShellUser {
  name: string;
  email: string;
  /** For example "Admin · Acme Support". */
  roleLine: string;
}

/**
 * Everything the shell shows comes from here. Each part appears only when a feature provides it,
 * so the app never shows a button that does nothing yet.
 */
export interface ShellConfig {
  /** Main navigation, top of the sidebar. */
  nav: NavItem[];
  /** Pinned to the bottom of the sidebar (Settings). */
  footerNav?: NavItem[];
  /** The top bar search (F10). */
  search?: { placeholder: string; onSearch: (query: string) => void };
  /** Trial pill and Upgrade link (F30). */
  trial?: { daysLeft: number; onUpgrade: () => void };
  /** The "New" split button and its menu; also the floating button on phones. */
  newActions?: NewAction[];
  /** The notification bell (F25), a feature component; also shown on phones. */
  notifications?: ReactNode;
  /** Help button. */
  onHelp?: () => void;
  /** Signed-in user and their menu (F2). */
  user?: ShellUser & {
    menu: { label: string; onSelect: () => void; icon?: LucideIcon; danger?: boolean }[];
  };
}
