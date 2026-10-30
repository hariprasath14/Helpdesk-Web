import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { Logo } from '../../components/Logo';
import { NavLinks } from './NavLinks';
import type { NavItem } from './types';

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nav: NavItem[];
  footerNav?: NavItem[];
}

/** Phone navigation: the sidebar slides in from the left over a dimmed page. */
export function MobileNav({ open, onOpenChange, nav, footerNav = [] }: MobileNavProps) {
  const close = () => {
    onOpenChange(false);
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay md:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col bg-sidebar px-3 py-3 md:hidden"
        >
          <div className="mb-5 flex h-10 items-center justify-between px-1">
            <Logo />
            <Dialog.Title className="sr-only">Menu</Dialog.Title>
            <Dialog.Close
              aria-label="Close menu"
              className="rounded-md p-1.5 text-sidebar-muted hover:text-sidebar-text"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <nav aria-label="Main" className="flex flex-col gap-1">
            <NavLinks items={[...nav, ...footerNav]} onNavigate={close} />
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
