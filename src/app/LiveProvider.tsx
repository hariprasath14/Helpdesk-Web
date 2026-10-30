import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { getGetApiV1MeQueryKey } from '../api/generated/accounts/accounts';
import { createLiveSocket } from '../lib/live';
import { LiveContext } from './live-context';

/**
 * Opens the live connection (F26) for the signed-in app. After a reconnection everything on
 * screen is reloaded, since signals may have been missed meanwhile. When the server closes it
 * (signed out, deactivated, session expired), the app checks who is signed in, which leads to
 * the sign-in page.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Created once, unconnected; the effect connects it while the app is shown.
  const [socket] = useState(createLiveSocket);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const live = socket;
    let wasConnected = false;
    live.on('connect', () => {
      setConnected(true);
      if (wasConnected) void queryClient.invalidateQueries();
      wasConnected = true;
    });
    live.on('disconnect', (reason) => {
      setConnected(false);
      if (reason === 'io server disconnect') {
        void queryClient.invalidateQueries({ queryKey: getGetApiV1MeQueryKey() });
      }
    });
    live.connect();
    return () => {
      live.off('connect');
      live.off('disconnect');
      live.disconnect();
    };
  }, [socket, queryClient]);

  return <LiveContext value={{ socket, connected }}>{children}</LiveContext>;
}
