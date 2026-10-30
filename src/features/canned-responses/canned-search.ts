import type { CannedResponse } from '../../api/generated/model';

/** Whether a canned response matches what was typed (title or text, any case). */
export function matchesSearch(item: CannedResponse, search: string): boolean {
  const query = search.trim().toLowerCase();
  return (
    !query || item.title.toLowerCase().includes(query) || item.body.toLowerCase().includes(query)
  );
}
