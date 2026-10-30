import { useBrand } from '../app/brand-context';
import { BRANDS } from '../brands';
import { cn } from '../lib/cn';
import { PRODUCT_NAME } from '../product';

interface LogoProps {
  /** Mark only (collapsed sidebar), or mark and wordmark. */
  variant?: 'mark' | 'full';
  /** White wordmark for the dark sidebar; dark wordmark for white backgrounds. */
  onDark?: boolean;
  className?: string;
}

/**
 * The logo in the active brand: the mark (support agent in a yellow chat bubble on a brand tile,
 * one SVG per brand in assets/brands/<id>, loaded as an image so its internal ids never clash with
 * other SVGs) and the product name as the wordmark, set in Satoshi. The wordmark is live text, so
 * renaming the product (src/product.ts) changes the logo too.
 */
export function Logo({ variant = 'full', onDark = true, className }: LogoProps) {
  const { logo } = BRANDS[useBrand().brand];
  if (variant === 'mark') {
    return (
      <img
        src={logo.mark}
        alt={PRODUCT_NAME}
        width={32}
        height={32}
        className={cn('size-8', className)}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={PRODUCT_NAME}
      className={cn('inline-flex h-8 items-center gap-2', className)}
    >
      <img src={logo.mark} alt="" width={32} height={32} className="h-full w-auto" />
      <span
        aria-hidden
        className={cn(
          'text-[1.375em] leading-none font-bold tracking-tight whitespace-nowrap lowercase',
          onDark ? 'text-white' : 'text-wordmark',
        )}
      >
        {PRODUCT_NAME}
      </span>
    </span>
  );
}
