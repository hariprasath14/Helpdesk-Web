import { Avatar } from '../../components/Avatar';
import type { Viewer } from './usePresence';

const names = (list: string[]) =>
  list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1) ?? ''}`;

/**
 * Who else has the ticket open, and who is writing to the customer (F27), in the ticket's header
 * (Step 5b): their avatars and a line each. Nothing when alone.
 */
export function PresenceLine({ viewers }: { viewers: Viewer[] }) {
  const writers = viewers.filter((viewer) => viewer.writing);
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs">
      {viewers.length > 0 && (
        <span className="flex -space-x-1.5">
          {viewers.slice(0, 3).map((viewer) => (
            <Avatar
              key={viewer.userId}
              name={viewer.name}
              size="sm"
              className="ring-2 ring-surface-page"
            />
          ))}
        </span>
      )}
      <span className="flex flex-col">
        {viewers.length > 0 && (
          <span className="text-ink-muted">
            Also viewing: {names(viewers.map((viewer) => viewer.name))}
          </span>
        )}
        {writers.map((viewer) => (
          <span key={viewer.userId} className="font-medium text-warning-text">
            {viewer.name} is {viewer.writing === 'forward' ? 'writing a forward' : 'replying'}…
          </span>
        ))}
      </span>
    </div>
  );
}
