import { createContext, use } from 'react';
import type { Me, MePermissionsItem } from '../../api/generated/model';

export const SessionContext = createContext<Me | null>(null);

/** Whether the member's role allows something. Only for showing or hiding; the API enforces it. */
export function can(me: Me, permission: MePermissionsItem): boolean {
  return me.permissions.includes(permission);
}

/** The signed-in member and workspace. Only use it inside the signed-in app (below MainLayout). */
export function useSession(): Me {
  const me = use(SessionContext);
  if (!me) throw new Error('useSession must be used inside the signed-in app');
  return me;
}
