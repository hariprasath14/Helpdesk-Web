import { BRAND_IDS, DEFAULT_BRAND, isBrandId, type BrandId } from './brands';

export interface AppConfig {
  /**
   * Where the API is. Empty (the default) means the app's own address: calls go to /api on the
   * page's host, which the dev server (locally) or CloudFront (on AWS) forwards to the API.
   */
  apiUrl: string;
  /** The app's domain, e.g. helpdesk.example.com or localhost; each workspace is a subdomain of it. */
  appDomain: string;
  /** Design preview pages at /design: on locally and in dev, off in prod. */
  designPreview: boolean;
  /** The brand theme for this deployment. */
  brand: BrandId;
}

// Plain checks rather than Zod: this runs before every page, and Zod would add about 60 KB to the
// first download for a few settings. Forms load Zod on demand.
function readApiUrl(value: unknown, problems: string[]): string {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || !URL.canParse(value)) {
    problems.push(
      'VITE_API_URL: must be empty (same address) or a URL such as http://localhost:4000',
    );
    return '';
  }
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    problems.push('VITE_API_URL: must start with http:// or https://');
  }
  return url.origin;
}

function readDomain(value: unknown, problems: string[]): string {
  if (value === undefined || value === '') return 'localhost';
  if (typeof value === 'string' && /^[a-z0-9.-]+$/.test(value) && !value.startsWith('.')) {
    return value;
  }
  problems.push('VITE_APP_DOMAIN: must be a domain such as helpdesk.example.com or localhost');
  return 'localhost';
}

function readFlag(name: string, value: unknown, problems: string[]): boolean {
  if (value === undefined || value === '') return false;
  if (value === 'true' || value === 'false') return value === 'true';
  problems.push(`${name}: must be true or false`);
  return false;
}

function readBrand(value: unknown, problems: string[]): BrandId {
  if (value === undefined || value === '') return DEFAULT_BRAND;
  if (isBrandId(value)) return value;
  problems.push(`VITE_BRAND: must be one of ${BRAND_IDS.join(', ')}`);
  return DEFAULT_BRAND;
}

/**
 * Reads the build-time settings (VITE_*) once. A missing or invalid value stops the app with a
 * clear message instead of failing later on the first API call.
 */
export function loadConfig(env: Record<string, unknown>): AppConfig {
  const problems: string[] = [];
  const config = {
    apiUrl: readApiUrl(env.VITE_API_URL, problems),
    appDomain: readDomain(env.VITE_APP_DOMAIN, problems),
    designPreview: readFlag('VITE_DESIGN_PREVIEW', env.VITE_DESIGN_PREVIEW, problems),
    brand: readBrand(env.VITE_BRAND, problems),
  };
  if (problems.length > 0) throw new Error(`Invalid build settings:\n${problems.join('\n')}`);
  return config;
}

export const config = loadConfig(import.meta.env);
