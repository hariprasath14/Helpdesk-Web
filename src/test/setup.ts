import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { server } from './server';

// The live connection (F26) is a fake in component tests; tests deliver signals through
// `live.socket.receive()` (src/test/live.ts).
vi.mock('../lib/live', async () => {
  const { createFakeLiveSocket } = await import('./live');
  return { createLiveSocket: createFakeLiveSocket };
});

// Async lookups (findBy, waitFor) get 3 s instead of 1 s: debounced checks plus mocked requests can
// run slower when the full check runs on a busy machine.
configure({ asyncUtilTimeout: 3000 });

// jsdom lacks a few browser APIs that Radix menus, tooltips and dialogs use for positioning.
class NoopResizeObserver {
  observe() {
    // Layout is not measured in tests.
  }
  unobserve() {
    // Layout is not measured in tests.
  }
  disconnect() {
    // Layout is not measured in tests.
  }
}
Object.assign(globalThis, { ResizeObserver: NoopResizeObserver });
Object.assign(Element.prototype, {
  scrollIntoView: () => undefined,
  hasPointerCapture: () => false,
  releasePointerCapture: () => undefined,
});

// Component tests talk to a mocked API (MSW). A request without a handler fails the test, so no
// test can silently depend on a real backend.
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});
