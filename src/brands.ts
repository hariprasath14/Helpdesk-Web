import tealMark from './assets/brands/help-teal/mark.svg';
import cyanMark from './assets/brands/ocean-cyan/mark.svg';

/**
 * The colour themes (brand packs). One is chosen per deployment with VITE_BRAND; the design preview can
 * switch between them. A brand pack is: a palette block in styles/tokens.css
 * ([data-brand='<id>']), the logo mark in assets/brands/<id>, icons in public/brands/<id>, and an
 * entry here. Everything else (neutrals, status and feedback colours, font, components) is shared.
 *
 * To add a brand: copy one of each, check every pair in tokens.css passes WCAG AA, add it below.
 */
export const BRANDS = {
  'help-teal': {
    label: 'Help Teal',
    logo: { mark: tealMark },
    /** Phone browser address bar: the brand's darkest shade, like the sidebar. */
    themeColor: '#053c36',
    /** The main button colour (brand 600 in tokens.css), for the theme preview in Your account. */
    swatch: '#0c8577',
  },
  'ocean-cyan': {
    label: 'Ocean Cyan',
    logo: { mark: cyanMark },
    themeColor: '#033744',
    swatch: '#077b97',
  },
} as const;

export type BrandId = keyof typeof BRANDS;

export const BRAND_IDS = Object.keys(BRANDS) as BrandId[];

export const DEFAULT_BRAND: BrandId = 'help-teal';

export function isBrandId(value: unknown): value is BrandId {
  return typeof value === 'string' && value in BRANDS;
}

/**
 * Applies a brand to the page: the colour tokens (data-brand on <html>), the browser tab and
 * home-screen icons, and the phone address bar colour. index.html starts with the default brand,
 * so the first paint is already right for Help Teal deployments.
 */
export function applyBrand(id: BrandId, doc: Document = document): void {
  doc.documentElement.dataset.brand = id;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', BRANDS[id].themeColor);
  doc.querySelector('link[rel="icon"]')?.setAttribute('href', `/brands/${id}/favicon.svg`);
  doc
    .querySelector('link[rel="apple-touch-icon"]')
    ?.setAttribute('href', `/brands/${id}/apple-touch-icon.png`);
}
