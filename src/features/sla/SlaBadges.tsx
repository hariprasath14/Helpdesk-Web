import { useEffect, useState } from 'react';
import type { TicketSla, TicketSummaryDue } from '../../api/generated/model';
import { Badge } from '../../components/Badge';
import { formatInZone } from '../../lib/time-zone';
import { useSession } from '../workspace/session-context';
import { dueText, targetText } from './sla-format';

/** The current time, moving on every half minute so countdowns stay right. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

/** A ticket's SLA targets (F23): "Reply due in 42m", "Resolve overdue by 10m", "Replied on time". */
export function SlaBadges({ sla }: { sla: TicketSla | null }) {
  const now = useNow();
  const me = useSession();
  if (!sla) return null;
  const items = (['reply', 'resolve'] as const).flatMap((kind) => {
    const target = sla[kind];
    return target ? [{ kind, target, ...targetText(kind, target, now) }] : [];
  });
  if (items.length === 0) return null;
  return (
    <ul aria-label="SLA" className="flex flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <li
          key={item.kind}
          title={`Due ${formatInZone(item.target.dueAt, me.workspace.timezone)}${sla.policy ? ` · ${sla.policy.name}` : ''}`}
        >
          <Badge tone={item.tone} dot>
            {item.text}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

const BADGE_TONES = { danger: 'danger', warning: 'warning', neutral: 'success' } as const;

/**
 * The list's next deadline in a few words (Step 5b Due column): "Reply in 42m" in green, amber
 * when it is soon, "Overdue 10m" in red; a dash when no clock is running.
 */
export function DueBadge({ due }: { due: TicketSummaryDue }) {
  const now = useNow();
  if (!due) {
    return (
      <span className="text-ink-subtle">
        <span aria-hidden>–</span>
        <span className="sr-only">No deadline running</span>
      </span>
    );
  }
  const { text, tone } = dueText(due, now);
  return <Badge tone={BADGE_TONES[tone]}>{text}</Badge>;
}
