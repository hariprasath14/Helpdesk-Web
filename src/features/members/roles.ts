import type { Me } from '../../api/generated/model';

export const ROLE_NAMES: Record<Me['role'], string> = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  agent: 'Agent',
};

/** The three roles with what each can do, for choosing one. */
export const ROLE_OPTIONS: { value: Me['role']; label: string; description: string }[] = [
  {
    value: 'agent',
    label: 'Agent',
    description: 'Works tickets: replies, notes, status and priority, and takes tickets.',
  },
  {
    value: 'supervisor',
    label: 'Supervisor',
    description:
      'Everything an agent does, plus assigning to anyone, merging, contacts and shared canned replies. Sees the members list.',
  },
  {
    value: 'admin',
    label: 'Admin',
    description: 'Everything, including people, roles and workspace settings.',
  },
];
