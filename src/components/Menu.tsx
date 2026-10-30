import { DropdownMenu } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface MenuProps {
  /** The button that opens the menu (rendered as-is; it must be a single focusable element). */
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  /** Optional header block, for example the user's name and email. */
  header?: ReactNode;
}

/** A dropdown menu with keyboard support (arrow keys, Enter, Escape, type-ahead). */
export function Menu({ trigger, children, align = 'end', header }: MenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-48 overflow-hidden rounded-xl border border-border bg-surface py-1.5 shadow-md"
        >
          {header && (
            <>
              <div className="px-4 py-2.5">{header}</div>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
            </>
          )}
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

interface MenuItemProps {
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  children: ReactNode;
}

export function MenuItem({ onSelect, icon, danger = false, children }: MenuItemProps) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 px-4 py-2 text-sm outline-none select-none',
        'data-[highlighted]:bg-surface-sunken',
        danger ? 'text-danger-text' : 'text-ink-body',
      )}
    >
      {icon && <span className="text-ink-muted [&_svg]:size-4">{icon}</span>}
      {children}
    </DropdownMenu.Item>
  );
}
