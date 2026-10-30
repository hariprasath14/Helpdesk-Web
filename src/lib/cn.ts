import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names, skipping empty and false values. When two classes set the same thing (for
 * example `px-4` from a size and `px-0` from a caller), the later one wins.
 */
export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}
