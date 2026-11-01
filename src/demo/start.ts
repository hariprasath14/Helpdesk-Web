import { setupWorker } from 'msw/browser';
import { createDemoHandlers } from './handlers';

/**
 * Starts the demo's stand-in API (handlers.ts) in a service worker before the app draws. The
 * worker script (mockServiceWorker.js) is copied into the demo build by vite.config.ts.
 */
export async function startDemo(): Promise<void> {
  await setupWorker(...createDemoHandlers()).start({
    // Fonts, images and the app's own files load normally.
    onUnhandledFrame: 'bypass',
    quiet: true,
  });
}
