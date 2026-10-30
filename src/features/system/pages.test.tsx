import { render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { describe, expect, it, vi } from 'vitest';
import { renderRoute } from '../../test/render';
import { RouteErrorPage } from './pages';

describe('unknown pages', () => {
  it('show a friendly not-found page with a way home', () => {
    renderRoute('/does/not/exist');

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
  });
});

describe('a page that crashes', () => {
  function Crashing(): never {
    throw new Error('database password is hunter2');
  }

  it('shows a friendly error with a way home, never the error itself', () => {
    // React logs the caught error to the console; keep the test output clean.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = createMemoryRouter([
      { path: '/', element: <Crashing />, errorElement: <RouteErrorPage /> },
    ]);
    render(<RouterProvider router={router} />);

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('hunter2');
    consoleError.mockRestore();
  });
});
