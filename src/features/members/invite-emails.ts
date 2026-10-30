/** "a@x.com, b@x.com" or one per line → a clean, de-duplicated list. */
export function parseEmails(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}
