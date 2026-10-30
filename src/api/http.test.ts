import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { apiUrl, server } from '../test/server';
import { ApiError, apiFetch, setCsrfToken } from './http';
import { PRODUCT_NAME } from '../product';

async function catchApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected the call to fail');
}

describe('apiFetch', () => {
  it('calls the API base URL with cookies and returns the JSON body', async () => {
    server.use(http.get(apiUrl('/probe'), () => HttpResponse.json({ hello: 'world' })));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(apiFetch('/probe')).resolves.toEqual({ hello: 'world' });
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('http://api.test/probe');
    // 'include' sends the session cookie even when VITE_API_URL points at another origin.
    expect(init?.credentials).toBe('include');
    expect(new Headers(init?.headers).get('accept')).toBe('application/json');
    fetchSpy.mockRestore();
  });

  it('keeps headers the caller sets', async () => {
    let accept: string | null = null;
    server.use(
      http.get(apiUrl('/probe'), ({ request }) => {
        accept = request.headers.get('accept');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(apiFetch('/probe', { headers: { Accept: 'text/csv' } })).resolves.toBeUndefined();
    expect(accept).toBe('text/csv');
  });

  it("turns the API's standard error body into an ApiError", async () => {
    server.use(
      http.post(apiUrl('/probe'), () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'The request body is invalid.',
              details: { fields: [{ field: 'email', message: 'Invalid email address' }] },
            },
          },
          { status: 400 },
        ),
      ),
    );

    const error = await catchApiError(apiFetch('/probe', { method: 'POST' }));
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'The request body is invalid.',
      details: { fields: [{ field: 'email', message: 'Invalid email address' }] },
    });
  });

  it('uses a safe generic message when the error has no standard body', async () => {
    server.use(
      http.get(
        apiUrl('/probe'),
        () => new HttpResponse('<html>Bad gateway</html>', { status: 502 }),
      ),
    );

    const error = await catchApiError(apiFetch('/probe'));
    expect(error.status).toBe(502);
    expect(error.code).toBe('HTTP_ERROR');
    expect(error.message).toBe('Something went wrong on our side. Please try again.');
  });

  it('keeps the body of an error response that carries data, such as an unhealthy /health', async () => {
    server.use(
      http.get(apiUrl('/probe'), () => HttpResponse.json({ status: 'error' }, { status: 503 })),
    );

    const error = await catchApiError(apiFetch('/probe'));
    expect(error.status).toBe(503);
    expect(error.body).toEqual({ status: 'error' });
  });

  it('reports an unreachable API as a network error with status 0', async () => {
    server.use(http.get(apiUrl('/probe'), () => HttpResponse.error()));

    const error = await catchApiError(apiFetch('/probe'));
    expect(error.status).toBe(0);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.message).toBe(
      `Cannot reach ${PRODUCT_NAME}. Check your connection and try again.`,
    );
  });

  it('treats a malformed JSON body as no body', async () => {
    server.use(
      http.get(
        apiUrl('/probe'),
        () => new HttpResponse('{"broken": ', { headers: { 'content-type': 'application/json' } }),
      ),
    );

    await expect(apiFetch('/probe')).resolves.toBeUndefined();
  });

  it('sends the CSRF token on changes only, once a session has one', async () => {
    const seen: Record<string, string | null> = {};
    server.use(
      http.all(apiUrl('/probe'), ({ request }) => {
        seen[request.method] = request.headers.get('x-csrf-token');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await apiFetch('/probe', { method: 'POST' });
    expect(seen.POST).toBeNull();

    setCsrfToken('token-1');
    await apiFetch('/probe');
    await apiFetch('/probe', { method: 'PATCH' });
    await apiFetch('/probe', { method: 'delete' });
    expect(seen).toEqual({ POST: null, GET: null, PATCH: 'token-1', DELETE: 'token-1' });
    setCsrfToken(undefined);
  });
});
