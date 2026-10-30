/** "Ravi Shankar" → "RS", "ravi@acme.com" → "R". At most two letters. */
export function initials(name: string): string {
  const words = name
    .replace(/@.*/, '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1);
  return letters.map((word) => word?.charAt(0).toUpperCase() ?? '').join('') || '?';
}
