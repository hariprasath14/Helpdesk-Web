import { io, type Socket } from 'socket.io-client';

/**
 * The live connection to the API (F26), on the app's own address (/socket.io) with the session
 * cookie, like every API call. It carries only short signals ("ticket 42 changed"); the app
 * reloads what it shows through the REST API. Tests replace this module with a fake.
 */
export function createLiveSocket(): Socket {
  return io({
    path: '/socket.io',
    // The app connects it once it is shown (LiveProvider).
    autoConnect: false,
    withCredentials: true,
    // Keep trying, a little slower each time, up to every 30 seconds.
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 30_000,
  });
}
