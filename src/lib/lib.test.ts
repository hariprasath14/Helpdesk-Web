import { describe, expect, it } from 'vitest';
import { hostKind, mainOrigin, workspaceOrigin } from '../app/host';
import { loginPath, safeNextPath } from '../features/auth/next-path';
import { passwordStrength } from './password-strength';
import { relativeTime } from './relative-time';
import { formatInZone, startOfDayInZone } from './time-zone';
import { ADDRESS_PATTERN, cleanAddress, suggestAddress } from './workspace-address';

describe('host kind', () => {
  it.each([
    ['localhost', 'localhost', { kind: 'main' }],
    ['localhost', 'acme.localhost', { kind: 'workspace', subdomain: 'acme' }],
    ['helpdesk.example.com', 'ACME.helpdesk.example.com', { kind: 'workspace', subdomain: 'acme' }],
    ['helpdesk.example.com', 'a.b.helpdesk.example.com', { kind: 'main' }],
    ['helpdesk.example.com', 'evil.com', { kind: 'main' }],
  ])('%s + %s', (domain, hostname, expected) => {
    expect(hostKind(domain, hostname)).toEqual(expected);
  });

  it('builds workspace and main addresses keeping scheme and port', () => {
    const current = { protocol: 'http:', port: '5173' } as Location;
    expect(workspaceOrigin('localhost', 'acme', current)).toBe('http://acme.localhost:5173');
    expect(mainOrigin('localhost', current)).toBe('http://localhost:5173');
    expect(mainOrigin('helpdesk.example.com', { protocol: 'https:', port: '' } as Location)).toBe(
      'https://helpdesk.example.com',
    );
  });
});

describe('workspace address helpers', () => {
  it.each([
    ['Acme Support', 'acme-support'],
    ['Café Ñoño Ltd.', 'cafe-nono-ltd'],
    ['  ', ''],
  ])('suggests %j → %j', (company, expected) => {
    expect(suggestAddress(company)).toBe(expected);
  });

  it('cleans typed input to address characters', () => {
    expect(cleanAddress('My Desk!')).toBe('my-desk');
    expect(cleanAddress('x'.repeat(40))).toHaveLength(30);
    expect(ADDRESS_PATTERN.test('my-desk')).toBe(true);
    expect(ADDRESS_PATTERN.test('-desk')).toBe(false);
  });
});

describe('password strength', () => {
  it.each([
    ['', 0, ''],
    ['short', 0, 'Use at least 12 characters'],
    ['aaaaaaaaaaaa', 1, 'Weak'],
    ['correcthorse', 1, 'Weak'],
    ['correct horse battery', 3, 'Good'],
    ['Correct-Horse-Battery-9', 4, 'Strong'],
  ])('%j scores %i (%s)', (password, score, label) => {
    expect(passwordStrength(password)).toEqual({ score, label });
  });
});

describe('after-login address', () => {
  it.each([
    [null, '/'],
    ['/account', '/account'],
    ['/tickets?view=mine', '/tickets?view=mine'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['https://evil.example', '/'],
    ['/login', '/'],
    ['/login?next=/x', '/'],
  ])('%j → %j', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it('builds the login address with where to come back to', () => {
    expect(loginPath('/')).toBe('/login');
    expect(loginPath('/account')).toBe('/login?next=%2Faccount');
    expect(loginPath('/account', 'expired')).toBe('/login?next=%2Faccount&reason=expired');
  });
});

describe('relative time', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  it.each([
    ['2026-10-25T11:59:40Z', 'just now'],
    ['2026-10-25T11:55:00Z', '5 minutes ago'],
    ['2026-10-25T10:00:00Z', '2 hours ago'],
    ['2026-10-24T12:00:00Z', 'yesterday'],
    ['2026-10-28T12:00:00Z', 'in 3 days'],
  ])('%s → %s', (date, expected) => {
    expect(relativeTime(date, now)).toBe(expected);
  });
});

describe('time zones', () => {
  it('shows a time in the workspace time zone', () => {
    expect(formatInZone('2026-10-25T12:00:00Z', 'Asia/Kolkata')).toBe('25 Oct 2026, 17:30');
    expect(formatInZone('2026-10-25T12:00:00Z', 'America/New_York')).toBe('25 Oct 2026, 08:00');
  });

  it('finds midnight of a day in a time zone, across daylight saving changes', () => {
    expect(startOfDayInZone('2026-10-25', 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-24T18:30:00.000Z',
    );
    expect(startOfDayInZone('2026-10-25', 'UTC').toISOString()).toBe('2026-10-25T00:00:00.000Z');
    // London changes from BST to GMT on 25 October 2026.
    expect(startOfDayInZone('2026-10-25', 'Europe/London').toISOString()).toBe(
      '2026-10-24T23:00:00.000Z',
    );
    expect(startOfDayInZone('2026-10-26', 'Europe/London').toISOString()).toBe(
      '2026-10-26T00:00:00.000Z',
    );
  });
});
