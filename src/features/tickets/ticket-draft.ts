import type { PropertiesDraft } from './TicketFields';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The ticket changed elsewhere while the form was open (live updates, F26): keep what this person
 * edited and take everything else from the new values, so saving never undoes someone's change.
 */
export function rebaseDraft(
  draft: PropertiesDraft,
  before: PropertiesDraft,
  after: PropertiesDraft,
): PropertiesDraft {
  const pick = <K extends keyof PropertiesDraft>(key: K): PropertiesDraft[K] =>
    same(draft[key], before[key]) ? after[key] : draft[key];
  const old = new Map(Object.entries(before.customFields));
  const customFields = new Map(Object.entries(after.customFields));
  for (const [key, value] of Object.entries(draft.customFields)) {
    if (!same(value, old.get(key))) customFields.set(key, value);
  }
  return {
    status: pick('status'),
    priority: pick('priority'),
    type: pick('type'),
    teamId: pick('teamId'),
    assigneeUserId: pick('assigneeUserId'),
    tags: pick('tags'),
    customFields: Object.fromEntries(customFields),
  };
}
