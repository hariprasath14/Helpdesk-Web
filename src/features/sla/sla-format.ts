import type {
  SlaDuration,
  SlaTarget,
  SlaTargetsInput,
  TicketSummaryDue,
} from '../../api/generated/model';

/** "45 min", "4 h", "1 day", "3 days": a policy target as people say it. */
export function durationText({ amount, unit }: SlaDuration): string {
  if (unit === 'minutes') return `${String(amount)} min`;
  if (unit === 'hours') return `${String(amount)} h`;
  return `${String(amount)} ${amount === 1 ? 'day' : 'days'}`;
}

/** "42m", "3h 10m", "2d 4h": a stretch of time in its two largest parts. */
export function spanText(ms: number): string {
  const minutes = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return hours > 0 ? `${String(days)}d ${String(hours)}h` : `${String(days)}d`;
  if (hours > 0) return rest > 0 ? `${String(hours)}h ${String(rest)}m` : `${String(hours)}h`;
  return `${String(rest)}m`;
}

export type SlaTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

/** Due within this long counts as "soon" (shown in amber). */
const SOON_MS = 60 * 60_000;

/**
 * One SLA target as a short sentence and a colour, for example "Reply due in 42m" (amber when
 * under an hour), "Reply overdue by 10m", "Replied on time", "Resolved 2h late", "Paused".
 */
export function targetText(
  kind: 'reply' | 'resolve',
  target: SlaTarget,
  now: number = Date.now(),
): { text: string; tone: SlaTone } {
  const due = Date.parse(target.dueAt);
  const noun = kind === 'reply' ? 'Reply' : 'Resolve';
  switch (target.state) {
    case 'met':
      return { text: kind === 'reply' ? 'Replied on time' : 'Resolved on time', tone: 'success' };
    case 'missed': {
      const late = spanText(Date.parse(target.doneAt ?? target.dueAt) - due);
      return {
        text: kind === 'reply' ? `Replied ${late} late` : `Resolved ${late} late`,
        tone: 'danger',
      };
    }
    case 'paused':
      return { text: `${noun} paused: waiting on the customer`, tone: 'neutral' };
    default:
      return now > due
        ? { text: `${noun} overdue by ${spanText(now - due)}`, tone: 'danger' }
        : {
            text: `${noun} due in ${spanText(due - now)}`,
            tone: due - now <= SOON_MS ? 'warning' : 'info',
          };
  }
}

/** The list's short form of the next deadline: "Reply in 42m", "Overdue 10m". */
export function dueText(due: NonNullable<TicketSummaryDue>, now: number = Date.now()) {
  const at = Date.parse(due.at);
  if (now > at) return { text: `Overdue ${spanText(now - at)}`, tone: 'danger' as const };
  const noun = due.target === 'reply' ? 'Reply' : 'Resolve';
  return {
    text: `${noun} in ${spanText(at - now)}`,
    tone: at - now <= SOON_MS ? ('warning' as const) : ('neutral' as const),
  };
}

/** The starting values of the default policy (the API's), offered for a new policy. */
export const STARTING_TARGETS: SlaTargetsInput = {
  urgent: {
    reply: { amount: 1, unit: 'hours' },
    resolve: { amount: 4, unit: 'hours' },
    hours: 'business',
  },
  high: {
    reply: { amount: 4, unit: 'hours' },
    resolve: { amount: 1, unit: 'days' },
    hours: 'business',
  },
  medium: {
    reply: { amount: 8, unit: 'hours' },
    resolve: { amount: 3, unit: 'days' },
    hours: 'business',
  },
  low: {
    reply: { amount: 1, unit: 'days' },
    resolve: { amount: 5, unit: 'days' },
    hours: 'business',
  },
};
