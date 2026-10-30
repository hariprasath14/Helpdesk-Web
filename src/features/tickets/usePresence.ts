import { useEffect, useState } from 'react';
import { useLive, useLiveEvent } from '../../app/live-context';
import { useSession } from '../workspace/session-context';

export type Writing = 'reply' | 'forward' | null;

export interface Viewer {
  userId: string;
  name: string;
  writing: Writing;
}

interface PresenceSignal {
  ticketId: string;
  userId: string;
  name: string;
  typing?: Writing;
  left?: boolean;
}

/** We say we are here this often; others drop us after PRESENCE_TIMEOUT_MS without a word. */
export const PRESENCE_EVERY_MS = 10_000;
export const PRESENCE_TIMEOUT_MS = 30_000;

/**
 * Collision detection (F27): tells the others with this ticket open that we are here and whether
 * we are writing a reply or forward, and lists who else is here. Our own other tabs are left out.
 */
export function usePresence(ticketId: string, writing: Writing): Viewer[] {
  const { socket, connected } = useLive();
  const me = useSession();
  const [seen, setSeen] = useState<Map<string, Viewer & { at: number }>>(new Map());

  // Say so once the server has us watching the ticket (it ignores presence before that), whenever
  // what we do changes, and then every few seconds.
  useEffect(() => {
    if (!socket || !connected) return;
    const say = () => socket.emit('presence', { ticketId, typing: writing });
    socket.emit('watch', ticketId, (watching: boolean) => {
      if (watching) say();
    });
    const timer = setInterval(say, PRESENCE_EVERY_MS);
    return () => {
      clearInterval(timer);
    };
  }, [socket, connected, ticketId, writing]);

  useLiveEvent<PresenceSignal>('presence', (signal) => {
    if (signal.ticketId !== ticketId || signal.userId === me.user.id) return;
    setSeen((current) => {
      const next = new Map(current);
      if (signal.left) next.delete(signal.userId);
      else {
        next.set(signal.userId, {
          userId: signal.userId,
          name: signal.name,
          writing: signal.typing ?? null,
          at: Date.now(),
        });
      }
      return next;
    });
  });

  // Someone who has gone quiet (closed the tab, lost their connection) drops off.
  useEffect(() => {
    const timer = setInterval(() => {
      setSeen((current) => {
        const now = Date.now();
        const fresh = [...current].filter(([, viewer]) => now - viewer.at < PRESENCE_TIMEOUT_MS);
        return fresh.length === current.size ? current : new Map(fresh);
      });
    }, 5_000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  return [...seen.values()]
    .map(({ userId, name, writing: theirs }) => ({ userId, name, writing: theirs }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
