import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../lib/cn';

export interface Crumb {
  label: string;
  /** Omit for the current page (the last crumb). */
  to?: string;
}

interface PageHeaderProps {
  title: ReactNode;
  breadcrumbs?: Crumb[];
  /** Grey text after the title, for example "128 tickets" or "Loading…". */
  meta?: ReactNode;
  /** Right-side buttons: Filter, Actions, and the page's main button last. */
  actions?: ReactNode;
  /** Long titles (a ticket's subject) wrap instead of being cut off; on phones every title wraps. */
  wrapTitle?: boolean;
}

/**
 * The top of every page: small grey breadcrumb, bold title, count, and the page's actions. The
 * actions stay on the title's row at every width (the title wraps or shortens instead).
 */
export function PageHeader({
  title,
  breadcrumbs,
  meta,
  actions,
  wrapTitle = false,
}: PageHeaderProps) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0 flex-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-subtle">
              {breadcrumbs.map((crumb, index) => (
                <li key={`${crumb.label}-${String(index)}`} className="flex items-center gap-1">
                  {index > 0 && <span aria-hidden>/</span>}
                  {crumb.to ? (
                    <Link to={crumb.to} className="hover:text-ink hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current="page">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        {/* Phones: the title wraps beside the actions and the meta drops below. */}
        <div className="flex flex-wrap items-baseline gap-x-3 sm:flex-nowrap">
          <h1 className={cn('min-w-0 text-xl font-bold break-words', !wrapTitle && 'sm:truncate')}>
            {title}
          </h1>
          {meta && <span className="text-xs whitespace-nowrap text-ink-subtle">{meta}</span>}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
      )}
    </div>
  );
}
