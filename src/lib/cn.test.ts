import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins classes and skips empty values', () => {
    expect(cn('a', false, undefined, 'b')).toBe('a b');
  });

  it('lets a later class override a conflicting earlier one', () => {
    // The bug this prevents: icon buttons kept px-4 and squeezed their icon to 4px.
    expect(cn('h-9 px-4 text-sm', 'w-9 px-0')).toBe('h-9 text-sm w-9 px-0');
    expect(cn('inline-flex', 'hidden md:inline-flex')).toBe('hidden md:inline-flex');
    expect(cn('bg-brand-button', 'bg-danger-button')).toBe('bg-danger-button');
  });
});
