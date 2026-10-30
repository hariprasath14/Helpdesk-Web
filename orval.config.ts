import { defineConfig } from 'orval';

const input = { target: '../helpdesk-api/openapi.json' };

/**
 * Generates the typed API client from the backend's committed contract. Run `npm run api:generate`
 * after pulling a backend change (from helpdesk-api's dev-deploy branch), then commit src/api/generated.
 */
export default defineConfig({
  helpdesk: {
    input,
    output: {
      mode: 'tags-split',
      target: 'src/api/generated',
      schemas: 'src/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      // One folder per API tag. Add a new tag's folder here so stale files are removed; zod/ belongs
      // to the output below and is cleaned there.
      clean: [
        'src/api/generated/accounts',
        'src/api/generated/audit',
        'src/api/generated/contacts',
        'src/api/generated/custom-fields',
        'src/api/generated/auth',
        'src/api/generated/members',
        'src/api/generated/system',
        'src/api/generated/two-factor',
        'src/api/generated/model',
      ],
      override: {
        // Every call goes through our fetch wrapper: base URL, cookies and the error shape.
        mutator: { path: 'src/api/http.ts', name: 'apiFetch' },
        // GET endpoints become queries (cached, refreshed); POST, PUT and DELETE become mutations,
        // which run only when called, so a create is never sent again by a background refresh.
        query: { useSuspenseQuery: false },
        // Functions return the response body directly; failed calls throw ApiError (src/api/http.ts).
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
  // The same contract as Zod schemas, so forms check exactly what the API checks before sending.
  helpdeskZod: {
    input,
    output: {
      mode: 'tags-split',
      target: 'src/api/generated/zod',
      client: 'zod',
      fileExtension: '.zod.ts',
      clean: true,
    },
  },
});
