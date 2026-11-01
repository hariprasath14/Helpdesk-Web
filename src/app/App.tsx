import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { ToastProvider } from '../components/Toast';
import { TooltipProvider } from '../components/Tooltip';
import { config } from '../config';
import { BrandProvider } from './BrandProvider';
import { hostKind } from './host';
import { createQueryClient } from './query-client';
import { createRoutes } from './routes';

// The demo has one address, which opens its sample workspace.
const host = config.demo
  ? ({ kind: 'workspace', subdomain: 'demo' } as const)
  : hostKind(config.appDomain, window.location.hostname);
const router = createBrowserRouter(createRoutes(config, host));

/** Providers shared by every page: brand, server-data cache, toasts, tooltips and the router. */
export function App() {
  const [queryClient] = useState(createQueryClient);
  return (
    <BrandProvider initial={config.brand}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </BrandProvider>
  );
}
