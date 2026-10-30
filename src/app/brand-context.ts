import { createContext, use } from 'react';
import { DEFAULT_BRAND, type BrandId } from '../brands';

export interface BrandState {
  brand: BrandId;
  /** Switches the brand for this page view (design preview only; deployments use VITE_BRAND). */
  setBrand: (brand: BrandId) => void;
}

export const BrandContext = createContext<BrandState>({
  brand: DEFAULT_BRAND,
  setBrand: () => undefined,
});

/** The active brand, so components such as the logo can follow it. */
export function useBrand(): BrandState {
  return use(BrandContext);
}
