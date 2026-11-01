import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('calls the API on the same address by default', () => {
    expect(loadConfig({})).toMatchObject({ apiUrl: '', appDomain: 'localhost' });
  });

  it('accepts an explicit API origin and drops a trailing slash', () => {
    expect(loadConfig({ VITE_API_URL: 'https://api.dev.helpdesk.example.com/' }).apiUrl).toBe(
      'https://api.dev.helpdesk.example.com',
    );
  });

  it('stops with a clear message when the API URL is invalid', () => {
    expect(() => loadConfig({ VITE_API_URL: 'not a url' })).toThrow(/VITE_API_URL/);
    expect(() => loadConfig({ VITE_API_URL: 'ftp://files.example.com' })).toThrow(/VITE_API_URL/);
  });

  it('reads the app domain and refuses a malformed one', () => {
    expect(loadConfig({ VITE_APP_DOMAIN: 'helpdesk.example.com' }).appDomain).toBe(
      'helpdesk.example.com',
    );
    expect(() => loadConfig({ VITE_APP_DOMAIN: 'https://helpdesk.example.com' })).toThrow(
      /VITE_APP_DOMAIN/,
    );
  });

  it('turns the design preview off unless it is set to true', () => {
    expect(loadConfig({}).designPreview).toBe(false);
    expect(loadConfig({ VITE_DESIGN_PREVIEW: 'true' }).designPreview).toBe(true);
    expect(() => loadConfig({ VITE_DESIGN_PREVIEW: 'yes' })).toThrow(/VITE_DESIGN_PREVIEW/);
  });

  it('runs the demo on its own address and refuses a malformed demo flag', () => {
    expect(loadConfig({}).demo).toBe(false);
    expect(loadConfig({ VITE_DEMO: 'true' }, 'helpnest-demo.pages.dev')).toMatchObject({
      demo: true,
      appDomain: 'helpnest-demo.pages.dev',
    });
    expect(() => loadConfig({ VITE_DEMO: 'yes' })).toThrow(/VITE_DEMO/);
  });

  it('lists every problem at once', () => {
    expect(() => loadConfig({ VITE_API_URL: 'nope', VITE_DESIGN_PREVIEW: 'yes' })).toThrow(
      /VITE_API_URL[\s\S]*VITE_DESIGN_PREVIEW/,
    );
  });
});
