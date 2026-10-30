import { useQueryClient } from '@tanstack/react-query';
import { AlarmClock, AtSign, Bell, CircleAlert, MessageSquare, UserRoundCheck } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Notification, NotificationKind } from '../../api/generated/model';
import {
  getGetApiV1NotificationsQueryKey,
  getGetApiV1NotificationsUnreadQueryKey,
  useGetApiV1Notifications,
  useGetApiV1NotificationsUnread,
  usePostApiV1NotificationsRead,
} from '../../api/generated/notifications/notifications';
import { FALLBACK_REFRESH_MS, useLive, useLiveEvent } from '../../app/live-context';
import { pillClass, type BadgeTone } from '../../components/badge-tones';
import { Button } from '../../components/Button';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/toast-context';
import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/relative-time';
import { formError } from '../auth/api-errors';

const ICONS: Record<NotificationKind, typeof Bell> = {
  assigned: UserRoundCheck,
  mention: AtSign,
  sla_warning: AlarmClock,
  sla_breach: CircleAlert,
  customer_reply: MessageSquare,
};

/** Each kind's colour (Step 5b): mentions blue, SLA warnings amber, breaches red. */
const TONES: Record<NotificationKind, BadgeTone> = {
  assigned: 'brand',
  mention: 'info',
  sla_warning: 'warning',
  sla_breach: 'danger',
  customer_reply: 'neutral',
};

/** A notification's kind as a small round icon, in the bell and on Home. */
export function NotificationIcon({ kind }: { kind: NotificationKind }) {
  const Icon = ICONS[kind];
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full',
        TONES[kind] === 'brand' ? 'bg-brand-tint text-brand-tint-text' : pillClass(TONES[kind]),
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

/** "3", or "99+" past 99. */
const countText = (count: number) => (count > 99 ? '99+' : String(count));

function Item({ item, onOpen }: { item: Notification; onOpen: (item: Notification) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          onOpen(item);
        }}
        className={cn(
          'flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none',
          !item.read && 'bg-brand-tint/40',
        )}
      >
        <NotificationIcon kind={item.kind} />
        <span className="min-w-0 flex-1">
          <span className={cn('block text-sm', item.read ? 'text-ink-body' : 'font-bold text-ink')}>
            {item.title}
          </span>
          <span className="line-clamp-2 block text-xs text-ink-muted">{item.body}</span>
          <span className="block text-xs text-ink-subtle">{relativeTime(item.createdAt)}</span>
        </span>
        {!item.read && (
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500">
            <span className="sr-only">Unread</span>
          </span>
        )}
      </button>
    </li>
  );
}

function NotificationList({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const list = useGetApiV1Notifications({ limit: 20 });
  const markRead = usePostApiV1NotificationsRead({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetApiV1NotificationsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetApiV1NotificationsUnreadQueryKey() });
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });
  const open = (item: Notification) => {
    if (!item.read) markRead.mutate({ data: { ids: [item.id] } });
    onClose();
    if (item.ticket) void navigate(`/tickets/${String(item.ticket.number)}`);
  };

  if (list.isPending) {
    return (
      <div role="status" aria-label="Loading notifications" className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (list.isError) {
    return (
      <div className="flex flex-col items-start gap-2 p-4 text-sm">
        <p className="text-ink-muted">Notifications could not be loaded.</p>
        <Button
          variant="outline"
          size="sm"
          loading={list.isFetching}
          onClick={() => {
            void list.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
  const items = list.data.notifications;
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-bold">Notifications</h2>
        {list.data.unread > 0 && (
          <Button
            variant="ghost"
            size="sm"
            loading={markRead.isPending}
            onClick={() => {
              markRead.mutate({ data: {} });
            }}
          >
            Mark all as read
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-muted">
          Nothing yet. You&apos;ll see tickets assigned to you, @mentions, SLA alerts and customer
          replies here.
        </p>
      ) : (
        <ul
          aria-label="Notification list"
          className="max-h-96 divide-y divide-border overflow-y-auto"
        >
          {items.map((item) => (
            <Item key={item.id} item={item} onOpen={open} />
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * The top bar's bell (F25): the unread count, and the latest notifications when opened. It updates
 * at once through live updates (F26).
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { connected } = useLive();
  // Live updates (F26) say when something arrives; without them the bell checks every minute.
  const unread = useGetApiV1NotificationsUnread({
    query: {
      refetchInterval: connected ? false : FALLBACK_REFRESH_MS,
      refetchIntervalInBackground: false,
    },
  });
  useLiveEvent('notifications', () => {
    void queryClient.invalidateQueries({ queryKey: getGetApiV1NotificationsUnreadQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetApiV1NotificationsQueryKey() });
  });
  const count = unread.data?.unread ?? 0;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={count > 0 ? `Notifications, ${countText(count)} unread` : 'Notifications'}
          className="relative inline-flex size-9 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-focus focus-visible:outline-none"
        >
          <Bell aria-hidden className="size-5" />
          {count > 0 && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-dot px-1 text-[10px] leading-none font-bold text-white ring-2 ring-surface"
            >
              {countText(count)}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          aria-label="Notifications"
          className="z-50 w-96 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-md"
        >
          <NotificationList
            onClose={() => {
              setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
