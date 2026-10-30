import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrandProvider } from './app/BrandProvider';
import { applyBrand, BRAND_IDS, BRANDS, isBrandId } from './brands';
import { Logo } from './components/Logo';
import { PRODUCT_NAME } from './product';
import { loadConfig } from './config';
import { BrandSwitch } from './features/design-preview/BrandSwitch';

beforeEach(() => {
  document.head.innerHTML =
    '<meta name="theme-color" content="#053c36" />' +
    '<link rel="icon" href="/brands/help-teal/favicon.svg" />' +
    '<link rel="apple-touch-icon" href="/brands/help-teal/apple-touch-icon.png" />';
});
afterEach(() => {
  applyBrand('help-teal');
});

describe('brands', () => {
  it('has a complete pack for every brand', () => {
    expect(BRAND_IDS).toEqual(['help-teal', 'ocean-cyan']);
    for (const id of BRAND_IDS) {
      const { logo, themeColor, label } = BRANDS[id];
      expect(label).not.toBe('');
      expect(themeColor).toMatch(/^#[0-9a-f]{6}$/);
      // Vite turns small files into inline data and larger ones into paths; either is fine.
      expect(logo.mark).not.toBe('');
    }
    // Each brand has its own artwork, not a copy of another brand's.
    expect(BRANDS['help-teal'].logo.mark).not.toBe(BRANDS['ocean-cyan'].logo.mark);
  });

  it('applies a brand to the colours, icons and phone address bar', () => {
    applyBrand('ocean-cyan');

    expect(document.documentElement.dataset.brand).toBe('ocean-cyan');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      '#033744',
    );
    expect(document.querySelector('link[rel="icon"]')).toHaveAttribute(
      'href',
      '/brands/ocean-cyan/favicon.svg',
    );
    expect(document.querySelector('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      '/brands/ocean-cyan/apple-touch-icon.png',
    );
  });

  it('recognises only known brand ids', () => {
    expect(isBrandId('help-teal')).toBe(true);
    expect(isBrandId('purple')).toBe(false);
    expect(isBrandId(undefined)).toBe(false);
  });

  it('is chosen by VITE_BRAND, defaulting to Help Teal', () => {
    const base = { VITE_API_URL: 'http://localhost:4000' };
    expect(loadConfig(base).brand).toBe('help-teal');
    expect(loadConfig({ ...base, VITE_BRAND: 'ocean-cyan' }).brand).toBe('ocean-cyan');
    expect(() => loadConfig({ ...base, VITE_BRAND: 'purple' })).toThrow(
      /VITE_BRAND: must be one of help-teal, ocean-cyan/,
    );
  });
});

describe('logo', () => {
  it('starts in the deployment brand and follows a brand switch', async () => {
    render(
      <BrandProvider initial="ocean-cyan">
        <Logo />
        <Logo variant="mark" />
        <Logo onDark={false} />
        <BrandSwitch />
      </BrandProvider>,
    );
    const [full, mark, onLight] = screen.getAllByRole('img', { name: PRODUCT_NAME });
    const markOf = (element: HTMLElement | undefined) =>
      element?.tagName === 'IMG' ? element : element?.querySelector('img');
    expect(markOf(full)).toHaveAttribute('src', BRANDS['ocean-cyan'].logo.mark);
    expect(markOf(mark)).toHaveAttribute('src', BRANDS['ocean-cyan'].logo.mark);
    expect(markOf(onLight)).toHaveAttribute('src', BRANDS['ocean-cyan'].logo.mark);
    // The wordmark is the product name as text, so renaming the product renames the logo.
    expect(full).toHaveTextContent(PRODUCT_NAME);
    expect(document.documentElement.dataset.brand).toBe('ocean-cyan');

    await userEvent.click(screen.getByText('Help Teal'));
    expect(markOf(full)).toHaveAttribute('src', BRANDS['help-teal'].logo.mark);
    expect(document.documentElement.dataset.brand).toBe('help-teal');
  });
});
