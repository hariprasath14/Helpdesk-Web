import type {
  TicketSummaryPriority,
  TicketSummaryStatus,
  TicketSummaryType,
} from '../../api/generated/model';
import type { BadgeTone } from '../../components/badge-tones';

export const STATUS_OPTIONS: { value: TicketSummaryStatus; label: string; tone: BadgeTone }[] = [
  { value: 'open', label: 'Open', tone: 'info' },
  { value: 'pending', label: 'Pending', tone: 'warning' },
  { value: 'waiting_on_customer', label: 'Waiting on customer', tone: 'warning' },
  { value: 'resolved', label: 'Resolved', tone: 'success' },
  { value: 'closed', label: 'Closed', tone: 'neutral' },
];

export const PRIORITY_OPTIONS: { value: TicketSummaryPriority; label: string; tone: BadgeTone }[] =
  [
    { value: 'low', label: 'Low', tone: 'neutral' },
    { value: 'medium', label: 'Medium', tone: 'info' },
    { value: 'high', label: 'High', tone: 'warning' },
    { value: 'urgent', label: 'Urgent', tone: 'danger' },
  ];

export const TYPE_OPTIONS: { value: NonNullable<TicketSummaryType>; label: string }[] = [
  { value: 'question', label: 'Question' },
  { value: 'incident', label: 'Incident' },
  { value: 'problem', label: 'Problem' },
  { value: 'feature_request', label: 'Feature request' },
];

const labelOf = (options: { value: string; label: string }[], value: unknown) =>
  options.find((option) => option.value === value)?.label;

export const statusLabel = (value: unknown) => labelOf(STATUS_OPTIONS, value) ?? String(value);
export const priorityLabel = (value: unknown) => labelOf(PRIORITY_OPTIONS, value) ?? String(value);
export const typeLabel = (value: unknown) => labelOf(TYPE_OPTIONS, value) ?? 'No type';

export const statusTone = (value: TicketSummaryStatus) =>
  STATUS_OPTIONS.find((option) => option.value === value)?.tone ?? 'neutral';
export const priorityTone = (value: TicketSummaryPriority) =>
  PRIORITY_OPTIONS.find((option) => option.value === value)?.tone ?? 'neutral';

/** "1.2 MB", "340 KB". */
export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

/** "#42", how tickets are named everywhere. */
export const ticketRef = (number: number) => `#${String(number)}`;
