import { NavLink } from 'react-router';
import { Tooltip } from '../../components/Tooltip';
import { cn } from '../../lib/cn';
import type { NavItem } from './types';

interface NavLinksProps {
  items: NavItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}

/** Sidebar links. The current page is highlighted and announced (aria-current="page"). */
export function NavLinks({ items, collapsed = false, onNavigate }: NavLinksProps) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map(({ label, to, icon: Icon, count, attention }) => {
        const link = (
          <NavLink
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            aria-label={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'relative flex h-10 items-center gap-3 rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'w-10 justify-center' : 'px-3',
                isActive
                  ? // White tint and a 3px brand-200 marker on the left, clear on the dark sidebar.
                    'bg-sidebar-active text-sidebar-text before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-indicator'
                  : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text',
              )
            }
          >
            <Icon aria-hidden className="size-[18px] shrink-0" />
            {!collapsed && <span className="flex-1 truncate">{label}</span>}
            {!collapsed && count !== undefined && (
              <span className="rounded-full bg-white px-1.5 text-[11px] font-bold text-sidebar">
                {count}
              </span>
            )}
            {collapsed && (attention ?? false) && (
              <span
                aria-hidden
                className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent ring-2 ring-sidebar"
              />
            )}
          </NavLink>
        );
        // The tooltip wraps a span, not the NavLink: Radix merges className as a string and would
        // break NavLink's className function. Focus on the link still bubbles up to show the tip.
        return (
          <li key={to}>
            {collapsed ? (
              <Tooltip content={label}>
                <span className="block">{link}</span>
              </Tooltip>
            ) : (
              link
            )}
          </li>
        );
      })}
    </ul>
  );
}
