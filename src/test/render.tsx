import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { BrandProvider } from '../app/BrandProvider';
import { createQueryClient } from '../app/query-client';
import type { HostKind } from '../app/host';
import { createRoutes } from '../app/routes';
import { ToastProvider } from '../components/Toast';
import { TooltipProvider } from '../components/Tooltip';

/**
 * Renders the real routes and providers at `path` with a fresh query cache (no retries, so error
 * states show at once). Use it for page and feature tests.
 */
export function renderRoute(
  path = '/',
  {
    designPreview = false,
    host = { kind: 'main' },
  }: { designPreview?: boolean; host?: HostKind } = {},
) {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  const router = createMemoryRouter(createRoutes({ designPreview }, host), {
    initialEntries: [path],
  });
  const result = render(
    <BrandProvider initial="help-teal">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </BrandProvider>,
  );
  return { ...result, router, queryClient };
}
