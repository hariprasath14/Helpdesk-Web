import { ChevronDown, CircleHelp, Menu as MenuIcon, Plus, Search } from 'lucide-react';
import { useRef, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button, IconButton } from '../../components/Button';
import { Logo } from '../../components/Logo';
import { Menu, MenuItem } from '../../components/Menu';
import type { ShellConfig } from './types';
import { PRODUCT_NAME } from '../../product';

interface TopBarProps {
  config: ShellConfig;
  onOpenMobileNav: () => void;
}

/**
 * White top bar. Desktop: search on the left; trial, Upgrade, New, notifications, help and the
 * user on the right. Phone: menu button, logo, notifications and the user's avatar (on phones,
 * tickets are searched from the Tickets page).
 */
export function TopBar({ config, onOpenMobileNav }: TopBarProps) {
  const { search, trial, newActions, notifications, onHelp, user } = config;
  const searchInput = useRef<HTMLInputElement>(null);

  const submitSearch = (event: SyntheticEvent) => {
    event.preventDefault();
    const query = searchInput.current?.value.trim() ?? '';
    if (query && search) search.onSearch(query);
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 md:px-6">
      {/* Phone only */}
      <IconButton label="Open menu" className="md:hidden" onClick={onOpenMobileNav}>
        <MenuIcon aria-hidden className="size-5" />
      </IconButton>
      <Link to="/" aria-label={`${PRODUCT_NAME} home`} className="md:hidden">
        <Logo onDark={false} />
      </Link>

      {search && (
        <form role="search" onSubmit={submitSearch} className="hidden max-w-md flex-1 md:block">
          <label className="flex h-9 items-center gap-2 rounded-lg bg-surface-sunken px-3 text-ink-muted focus-within:ring-2 focus-within:ring-brand-focus">
            <Search aria-hidden className="size-4" />
            <span className="sr-only">{search.placeholder}</span>
            <input
              ref={searchInput}
              type="search"
              placeholder={search.placeholder}
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
            />
          </label>
        </form>
      )}

      <div className="ml-auto flex items-center gap-2">
        {trial && (
          <div className="hidden items-center gap-3 lg:flex">
            <Badge tone="success">Trial · {trial.daysLeft} days left</Badge>
            <button
              type="button"
              onClick={trial.onUpgrade}
              className="text-sm font-bold text-brand-link hover:underline"
            >
              Upgrade
            </button>
          </div>
        )}

        {newActions && newActions.length > 0 && (
          <div className="hidden md:block">
            <Menu
              trigger={
                <Button icon={<Plus aria-hidden className="size-4" />}>
                  New
                  <ChevronDown aria-hidden className="-mr-1 size-4 opacity-80" />
                </Button>
              }
            >
              {newActions.map(({ label, icon: Icon, onSelect }) => (
                <MenuItem key={label} onSelect={onSelect} icon={<Icon />}>
                  {label}
                </MenuItem>
              ))}
            </Menu>
          </div>
        )}

        {notifications}

        {onHelp && (
          <IconButton label="Help" className="hidden md:inline-flex" onClick={onHelp}>
            <CircleHelp aria-hidden className="size-5" />
          </IconButton>
        )}

        {user && (
          <Menu
            header={
              <div>
                <p className="font-bold text-ink">{user.name}</p>
                <p className="text-ink-muted">{user.email}</p>
              </div>
            }
            trigger={
              // Named by its visible text plus "account menu", so voice control users can say
              // what they see. On phones only the avatar shows, so the name is added for them.
              <button
                type="button"
                className="flex items-center gap-2.5 rounded-lg p-1 hover:bg-surface-sunken md:pl-2"
              >
                <span className="hidden text-right leading-tight md:block">
                  <span className="block text-[13px] font-bold text-ink">{user.name}</span>
                  <span className="block text-[11px] text-ink-subtle">{user.roleLine}</span>
                </span>
                <span className="sr-only md:hidden">{user.name}</span>
                <span className="sr-only">account menu</span>
                <Avatar name={user.name} />
                <ChevronDown aria-hidden className="hidden size-4 text-ink-muted md:block" />
              </button>
            }
          >
            {user.menu.map(({ label, onSelect, icon: Icon, danger }) => (
              <MenuItem
                key={label}
                onSelect={onSelect}
                danger={danger ?? false}
                {...(Icon ? { icon: <Icon /> } : {})}
              >
                {label}
              </MenuItem>
            ))}
          </Menu>
        )}
      </div>
    </header>
  );
}
