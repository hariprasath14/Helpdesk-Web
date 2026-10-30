import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { Logo } from '../../components/Logo';
import { Tooltip } from '../../components/Tooltip';
import { cn } from '../../lib/cn';
import { NavLinks } from './NavLinks';
import type { NavItem } from './types';
import { PRODUCT_NAME } from '../../product';

interface SidebarProps {
  nav: NavItem[];
  footerNav?: NavItem[];
  collapsed: boolean;
  onToggle: () => void;
}

/** Desktop sidebar: brand 900, icons only when collapsed, icons and labels when expanded. */
export function Sidebar({ nav, footerNav = [], collapsed, onToggle }: SidebarProps) {
  const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  const toggle = (
    <button
      type="button"
      onClick={onToggle}
      aria-label={toggleLabel}
      aria-expanded={!collapsed}
      className={cn(
        'flex h-10 items-center gap-3 rounded-lg text-sm text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text',
        collapsed ? 'w-10 justify-center' : 'px-3',
      )}
    >
      {collapsed ? (
        <ChevronRight aria-hidden className="size-[18px]" />
      ) : (
        <ChevronLeft aria-hidden className="size-[18px]" />
      )}
      {!collapsed && <span>Collapse</span>}
    </button>
  );

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col bg-sidebar py-3 transition-[width] duration-200 md:flex',
        collapsed ? 'w-16 items-center' : 'w-56 px-3',
      )}
    >
      <Link
        to="/"
        aria-label={`${PRODUCT_NAME} home`}
        className={cn('mb-5 flex h-10 items-center', !collapsed && 'px-1')}
      >
        <Logo variant={collapsed ? 'mark' : 'full'} />
      </Link>
      <nav aria-label="Main" className="flex flex-1 flex-col justify-between">
        <NavLinks items={nav} collapsed={collapsed} />
        <div className="flex flex-col gap-1">
          {footerNav.length > 0 && <NavLinks items={footerNav} collapsed={collapsed} />}
          {collapsed ? <Tooltip content={toggleLabel}>{toggle}</Tooltip> : toggle}
        </div>
      </nav>
    </aside>
  );
}
