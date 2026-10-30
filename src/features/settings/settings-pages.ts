import {
  CalendarClock,
  FileText,
  ListPlus,
  Mail,
  MessageSquareText,
  ScrollText,
  ShieldCheck,
  Timer,
  Users,
  UsersRound,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { MePermissionsItem } from '../../api/generated/model';

export interface SettingsPage {
  label: string;
  to: string;
  permission: MePermissionsItem;
  icon: LucideIcon;
  /** One line on the settings overview. */
  description: string;
}

/** Settings pages in their menu groups (Step 5b), and who sees them. */
export const SETTINGS_GROUPS: { label: string; pages: SettingsPage[] }[] = [
  {
    label: 'Team',
    pages: [
      {
        label: 'Members',
        to: '/settings/members',
        permission: 'members.view',
        icon: Users,
        description: 'Invite people, change roles and deactivate.',
      },
      {
        label: 'Teams',
        to: '/settings/teams',
        permission: 'members.view',
        icon: UsersRound,
        description: 'Group people and choose team leads.',
      },
    ],
  },
  {
    label: 'Tickets',
    pages: [
      {
        label: 'Fields',
        to: '/settings/fields',
        permission: 'settings.manage',
        icon: ListPlus,
        description: 'Your own fields on tickets, contacts and companies.',
      },
      {
        label: 'Canned responses',
        to: '/settings/canned-responses',
        permission: 'tickets.work',
        icon: MessageSquareText,
        description: 'Saved replies with placeholders, personal or shared.',
      },
    ],
  },
  {
    label: 'Automation',
    pages: [
      {
        label: 'Rules',
        to: '/settings/rules',
        permission: 'settings.manage',
        icon: Workflow,
        description: 'Route, assign and follow up on tickets automatically.',
      },
      {
        label: 'SLAs',
        to: '/settings/slas',
        permission: 'settings.manage',
        icon: Timer,
        description: 'Reply and resolve targets per priority, warnings and escalation.',
      },
      {
        label: 'Business hours',
        to: '/settings/business-hours',
        permission: 'settings.manage',
        icon: CalendarClock,
        description: 'Working days, time zone and holidays.',
      },
    ],
  },
  {
    label: 'Channels',
    pages: [
      {
        label: 'Email',
        to: '/settings/email',
        permission: 'settings.manage',
        icon: Mail,
        description: 'Your support address, sender name and customer emails.',
      },
      {
        label: 'Web form',
        to: '/settings/web-form',
        permission: 'settings.manage',
        icon: FileText,
        description: 'A public "Contact support" page.',
      },
    ],
  },
  {
    label: 'Workspace',
    pages: [
      {
        label: 'Security',
        to: '/settings/security',
        permission: 'settings.manage',
        icon: ShieldCheck,
        description: 'Require two-step verification for everyone.',
      },
      {
        label: 'Audit log',
        to: '/settings/audit-log',
        permission: 'audit_log.view',
        icon: ScrollText,
        description: 'Who changed what and when; filter and export.',
      },
    ],
  },
];

export const SETTINGS_PAGES: SettingsPage[] = SETTINGS_GROUPS.flatMap((group) => group.pages);
