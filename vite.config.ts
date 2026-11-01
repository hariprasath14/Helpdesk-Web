/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { PRODUCT_NAME } from './src/product';

/** Puts the product name (src/product.ts) into index.html: %PRODUCT_NAME% becomes it. */
const productName = (): Plugin => ({
  name: 'product-name',
  transformIndexHtml: (html) => html.replaceAll('%PRODUCT_NAME%', PRODUCT_NAME),
});

/**
 * The demo build (--mode demo) answers its API calls in a service worker (src/demo). This serves
 * MSW's worker script to the dev server and adds it to the build; other builds never ship it.
 */
const demoWorker = (): Plugin => {
  const script = () => readFileSync('node_modules/msw/lib/mockServiceWorker.js', 'utf8');
  return {
    name: 'demo-worker',
    configureServer(server) {
      server.middlewares.use('/mockServiceWorker.js', (_request, response) => {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(script());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'mockServiceWorker.js', source: script() });
    },
  };
};

export default defineConfig(({ mode }) => {
  // Where the dev server forwards API calls (helpdesk-api's npm run dev). Read from .env or the
  // shell; it has no VITE_ prefix, so it is never baked into the build.
  const apiTarget = loadEnv(mode, process.cwd(), '').API_PROXY_TARGET || 'http://localhost:4000';
  // changeOrigin stays false so the API sees the browser's address (acme.localhost:5173) and knows
  // which workspace a request is for, exactly as it will behind CloudFront on AWS.
  const toApi = { target: apiTarget, changeOrigin: false };

  return {
    plugins: [react(), tailwindcss(), productName(), ...(mode === 'demo' ? [demoWorker()] : [])],
    server: {
      port: 5173,
      // Fail instead of silently moving to another port: links in emails point at 5173.
      strictPort: true,
      // Workspaces are subdomains: acme.localhost:5173 (browsers resolve *.localhost with no setup).
      allowedHosts: ['.localhost'],
      // The app calls the API on its own address (/api), as it will on AWS; the dev server forwards it,
      // and the live connection (/socket.io, F26) as a WebSocket.
      proxy: {
        '/api': toApi,
        '/health': toApi,
        '/docs': toApi,
        '/socket.io': { ...toApi, ws: true },
      },
    },
    build: {
      sourcemap: true,
      rolldownOptions: {
        output: {
          // Libraries change rarely, our code changes every deploy: separate files let browsers keep
          // the libraries cached across releases.
          codeSplitting: {
            groups: [
              {
                name: 'react',
                test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
                priority: 30,
              },
              { name: 'query', test: /node_modules[\\/]@tanstack[\\/]/, priority: 20 },
              {
                name: 'ui',
                test: /node_modules[\\/](@radix-ui|@floating-ui|radix-ui|lucide-react|tailwind-merge|clsx)/,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      // Two test workers: more ran out of memory on a developer machine with little free RAM.
      maxWorkers: 2,
      // Generous per-test limit for the same reason; a slow machine should not turn into a failure.
      testTimeout: 15_000,
      setupFiles: ['src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
      // Fixed test settings, so tests never depend on a developer's .env.
      env: { VITE_API_URL: 'http://api.test', VITE_APP_DOMAIN: 'helpdesk.test' },
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        // Generated code is tested by the backend contract; main.tsx just mounts the app.
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/api/generated/**', 'src/main.tsx'],
        thresholds: { statements: 90, branches: 75, functions: 90, lines: 90 },
      },
    },
  };
});
