import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/http';
import { createQueryClient, shouldRetry } from './query-client';

describe('shouldRetry', () => {
  it('never retries client errors, which would fail again', () => {
    expect(shouldRetry(0, new ApiError(400, 'VALIDATION_ERROR', 'x'))).toBe(false);
    expect(shouldRetry(0, new ApiError(404, 'NOT_FOUND', 'x'))).toBe(false);
  });

  it('retries network and server errors twice', () => {
    const network = new ApiError(0, 'NETWORK_ERROR', 'x');
    expect(shouldRetry(0, network)).toBe(true);
    expect(shouldRetry(1, new ApiError(503, 'HTTP_ERROR', 'x'))).toBe(true);
    expect(shouldRetry(2, network)).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('does not retry mutations, so a create is never sent twice', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});
