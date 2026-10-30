import type { Socket } from 'socket.io-client';

type Handler = (...args: unknown[]) => void;

/**
 * A stand-in for the live connection (F26) in component tests: it "connects" at once, records
 * what the app sends, and lets a test deliver signals with `receive()`.
 */
export class FakeLiveSocket {
  connected = false;
  /** What the app sent, for example ['watch', ticketId]. */
  sent: unknown[][] = [];
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler) {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler);
    this.handlers.set(event, set);
    return this;
  }

  off(event: string, handler?: Handler) {
    if (handler) this.handlers.get(event)?.delete(handler);
    else this.handlers.delete(event);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    this.sent.push([event, ...args]);
    const ack = args.at(-1);
    if (typeof ack === 'function') (ack as (ok: boolean) => void)(true);
    return this;
  }

  connect() {
    this.connected = true;
    queueMicrotask(() => {
      this.receive('connect');
    });
    return this;
  }

  disconnect() {
    this.connected = false;
    return this;
  }

  /** Delivers a signal from the server to the app's handlers. */
  receive(event: string, ...args: unknown[]) {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(...args);
  }
}

/** The fake the app opened last (one per signed-in app). */
export const live: { socket: FakeLiveSocket } = { socket: new FakeLiveSocket() };

export function createFakeLiveSocket(): Socket {
  live.socket = new FakeLiveSocket();
  return live.socket as unknown as Socket;
}
