import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Logo } from '../../components/Logo';
import { PRODUCT_NAME } from '../../product';

interface AuthLayoutProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Wider card for longer forms. */
  wide?: boolean;
}

const POINTS: { title: string; text: string }[] = [
  {
    title: 'One inbox for your team.',
    text: 'Email and web form requests become tickets with a number.',
  },
  {
    title: 'Never miss a deadline.',
    text: 'SLA timers, warnings and escalation in your business hours.',
  },
  {
    title: 'Work faster.',
    text: 'Rules route tickets; canned replies and live updates save time.',
  },
];

/** A few sample tickets with their deadlines, drawn in the panel (not real data). */
const SAMPLE = [
  { subject: 'Manager approvals stuck in pending', due: 'Overdue 27m', late: true },
  { subject: 'Payslips for 3 employees are blank', due: 'Due in 25m', late: false },
  { subject: 'Biometric sync stopped since yesterday', due: 'Reply in 17h', late: false },
];

/** What the product does, beside the form on wide screens (Step 5b). */
function BrandPanel() {
  return (
    <aside
      aria-label={`About ${PRODUCT_NAME}`}
      className="hidden flex-col justify-center gap-8 bg-sidebar px-12 py-10 text-sidebar-text lg:flex"
    >
      <h2 className="max-w-md text-2xl leading-snug font-bold text-white">
        Every customer email and web form request, answered on time.
      </h2>
      <ul className="flex max-w-md flex-col gap-4">
        {POINTS.map((point) => (
          <li key={point.title} className="flex gap-3 text-sm">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/15">
              <Check aria-hidden className="size-3.5 text-white" />
            </span>
            <span>
              <b className="font-semibold text-white">{point.title}</b> {point.text}
            </span>
          </li>
        ))}
      </ul>
      <div aria-hidden className="max-w-md rounded-xl bg-white/95 p-3 shadow-lg">
        {SAMPLE.map((ticket) => (
          <span
            key={ticket.subject}
            className="flex items-center justify-between gap-3 border-b border-border px-2 py-2 text-xs last:border-b-0"
          >
            <b className="truncate font-semibold text-ink">{ticket.subject}</b>
            <span
              className={
                ticket.late
                  ? 'shrink-0 rounded-full bg-danger-bg px-2 py-0.5 font-medium text-danger-text'
                  : 'shrink-0 rounded-full bg-warning-bg px-2 py-0.5 font-medium text-warning-text'
              }
            >
              {ticket.due}
            </span>
          </span>
        ))}
      </div>
    </aside>
  );
}

/**
 * The frame for sign-up, sign-in and email pages (Step 5b): from 1024px the form on the left and
 * what the product does on the right; narrower, the logo and a white card on a soft brand gradient.
 * Terms and Privacy links sit underneath.
 */
export function AuthLayout({ title, subtitle, children, wide = false }: AuthLayoutProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col items-center bg-linear-to-b from-surface to-brand-50 px-4 py-10 lg:justify-center lg:bg-none lg:bg-surface">
        <main className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'}`}>
          <Logo onDark={false} className="mb-8 h-9 max-lg:mx-auto" />
          <div className="rounded-2xl bg-surface p-6 shadow-md sm:p-8 lg:p-0 lg:shadow-none">
            <h1 className="text-xl font-bold">{title}</h1>
            {subtitle && <div className="mt-1.5 text-ink-muted">{subtitle}</div>}
            <div className="mt-6">{children}</div>
          </div>
        </main>
        <nav aria-label="Legal" className="mt-6 flex gap-4 text-xs text-ink-muted">
          <Link to="/terms" className="hover:text-ink hover:underline">
            Terms
          </Link>
          <Link to="/privacy" className="hover:text-ink hover:underline">
            Privacy
          </Link>
        </nav>
      </div>
      <BrandPanel />
    </div>
  );
}
