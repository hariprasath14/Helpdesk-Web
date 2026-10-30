import { createContext, useContext, useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';

export interface LiveState {
  socket: Socket | null;
  /** Connected now; while not, screens check for changes every minute instead. */
  connected: boolean;
}

export const LiveContext = createContext<LiveState>({ socket: null, connected: false });

/** The live connection (F26) of the signed-in app. */
export const useLive = () => useContext(LiveContext);

/** While live updates are down, screens fall back to checking this often. */
export const FALLBACK_REFRESH_MS = 60_000;

/** Calls `handler` for each live signal of this kind while the component is shown. */
// The caller names the signal's shape, as with response.json<T>().
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function useLiveEvent<T = unknown>(event: string, handler: (data: T) => void) {
  const { socket } = useLive();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!socket) return;
    const listener = (data: T) => {
      latest.current(data);
    };
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}

/** Receives the signals of one open ticket while it is shown (again after reconnecting). */
export function useWatchTicket(ticketId: string | undefined) {
  const { socket, connected } = useLive();
  useEffect(() => {
    if (!socket || !connected || !ticketId) return;
    socket.emit('watch', ticketId);
    return () => {
      socket.emit('unwatch', ticketId);
    };
  }, [socket, connected, ticketId]);
}
