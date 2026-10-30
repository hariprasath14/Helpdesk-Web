/** Same rule as the API: 3 to 30 lowercase letters, numbers or hyphens, no hyphen at either end. */
export const ADDRESS_PATTERN = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])$/;

/**
 * Suggests an address from the company name as the person types ("Acme Support" → "acme-support").
 * Only a suggestion: the API decides what is allowed and free.
 */
export function suggestAddress(companyName: string): string {
  const slug = companyName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/g, '');
  return slug;
}

/** Keeps only characters an address can have while the person types. */
export function cleanAddress(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 30);
}
