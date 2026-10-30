import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { applyBrand, type BrandId } from '../brands';
import { BrandContext } from './brand-context';

/** Holds the active brand and applies it to the page whenever it changes. */
export function BrandProvider({ initial, children }: { initial: BrandId; children: ReactNode }) {
  const [brand, setBrandState] = useState<BrandId>(() => {
    applyBrand(initial);
    return initial;
  });
  const setBrand = useCallback((next: BrandId) => {
    applyBrand(next);
    setBrandState(next);
  }, []);
  const value = useMemo(() => ({ brand, setBrand }), [brand, setBrand]);
  return <BrandContext value={value}>{children}</BrandContext>;
}
