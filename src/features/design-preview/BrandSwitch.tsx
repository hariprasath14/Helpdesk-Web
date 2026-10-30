import { useBrand } from '../../app/brand-context';
import { BRAND_IDS, BRANDS } from '../../brands';
import { cn } from '../../lib/cn';

/** Switches the brand for the whole page, to check that every component and the logo follow it. */
export function BrandSwitch() {
  const { brand, setBrand } = useBrand();
  return (
    <fieldset className="flex items-center gap-2">
      <legend className="sr-only">Brand colour</legend>
      {BRAND_IDS.map((id) => (
        <label
          key={id}
          className={cn(
            'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium',
            brand === id
              ? 'border-brand-600 bg-brand-tint text-brand-tint-text'
              : 'border-border bg-surface text-ink-muted',
          )}
        >
          <input
            type="radio"
            name="brand"
            value={id}
            checked={brand === id}
            onChange={() => {
              setBrand(id);
            }}
            className="sr-only"
          />
          {BRANDS[id].label}
        </label>
      ))}
    </fieldset>
  );
}
