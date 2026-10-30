import { Tooltip as RadixTooltip } from 'radix-ui';
import type { ReactNode } from 'react';

interface TooltipProps {
  content: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** The element the tooltip describes; it must be focusable so keyboard users see the tip too. */
  children: ReactNode;
}

/** Short hint on hover and keyboard focus, for example labels in the collapsed sidebar. */
export function Tooltip({ content, side = 'right', children }: TooltipProps) {
  return (
    <RadixTooltip.Root delayDuration={200}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={8}
          className="z-50 rounded-md bg-surface-inverse px-2.5 py-1.5 text-xs font-medium text-ink-inverse shadow-md"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

/** Wrap the app once so tooltips share timing (moving between them shows the next at once). */
export const TooltipProvider = RadixTooltip.Provider;
