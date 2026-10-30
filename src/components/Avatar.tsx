import { cn } from '../lib/cn';
import { initials } from '../lib/initials';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Round initials avatar. Decorative: the name is always shown or announced next to it. */
export function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-brand-avatar font-bold text-brand-avatar-text',
        size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
