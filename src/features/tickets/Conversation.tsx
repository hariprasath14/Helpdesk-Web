import { useQueryClient } from '@tanstack/react-query';
import { Forward, Lock, Mail, Paperclip, RotateCw, Split } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useState, type ReactNode } from 'react';
import type {
  Attachment,
  CustomField,
  Ticket,
  TicketActivity,
  TicketMessage,
} from '../../api/generated/model';
import {
  getGetApiV1AttachmentsAttachmentIdUrl,
  getGetApiV1TicketsNumberMessagesQueryKey,
  useGetApiV1TicketsNumberActivity,
  useGetApiV1TicketsNumberMessages,
  usePostApiV1TicketsNumberMessagesMessageIdResend,
  usePostApiV1TicketsNumberMessagesMessageIdSplit,
} from '../../api/generated/tickets/tickets';
import { FALLBACK_REFRESH_MS, useLive } from '../../app/live-context';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { CheckboxField } from '../../components/CheckboxField';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/toast-context';
import { config } from '../../config';
import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/relative-time';
import { formError } from '../auth/api-errors';
import { activitySentence } from './ticket-history';
import { refreshTickets } from './tickets-cache';
import { fileSize } from './ticket-labels';

type Item =
  | { type: 'description'; at: string }
  | { type: 'message'; at: string; message: TicketMessage }
  | { type: 'activity'; at: string; entry: TicketActivity };

/** A note's text with its @mentions in bold. */
function withMentions(body: string, names: string[]): ReactNode {
  if (names.length === 0) return body;
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // The pattern is built from member names, escaped above.
  // eslint-disable-next-line security/detect-non-literal-regexp
  const parts = body.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'g'));
  return parts.map((part, index) =>
    part.startsWith('@') && names.includes(part.slice(1)) ? (
      <strong key={index} className="font-medium text-brand-link">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

const EMAIL_STATUS = {
  queued: { tone: 'neutral', label: 'Sending' },
  sent: { tone: 'success', label: 'Sent' },
  failed: { tone: 'danger', label: "Couldn't send" },
} as const;

/** While an email is being sent, the conversation checks again this often to show "Sent". */
const SENDING_REFRESH_MS = 5000;

/** Why a reply or forward could not be sent, and a button to send it again. */
function SendFailed({ ticketNumber, message }: { ticketNumber: number; message: TicketMessage }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const resend = usePostApiV1TicketsNumberMessagesMessageIdResend({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetApiV1TicketsNumberMessagesQueryKey(ticketNumber), result);
        toast({ tone: 'success', message: 'Sending it again.' });
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });
  return (
    <div
      role="alert"
      className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger-text"
    >
      <span className="min-w-0 flex-1 break-words">
        This email couldn&apos;t be sent{message.emailError ? `: ${message.emailError}` : '.'}
      </span>
      <Button
        size="sm"
        variant="secondary"
        loading={resend.isPending}
        onClick={() => {
          resend.mutate({ number: ticketNumber, messageId: message.id });
        }}
      >
        <RotateCw aria-hidden className="size-3.5" />
        Send again
      </Button>
    </div>
  );
}

/** Download links for a message's files (never shown inside the app). */
function FileLinks({ files }: { files: Attachment[] }) {
  if (files.length === 0) return null;
  return (
    <ul aria-label="Files" className="mt-3 flex flex-wrap gap-2">
      {files.map((file) => (
        <li key={file.id}>
          <a
            href={`${config.apiUrl}${getGetApiV1AttachmentsAttachmentIdUrl(file.id)}`}
            download={file.fileName}
            className="inline-flex max-w-72 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink-body hover:bg-surface-sunken"
          >
            <Paperclip aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{file.fileName}</span>
            <span className="shrink-0 text-ink-subtle">{fileSize(file.size)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function MessageItem({
  ticketNumber,
  message,
  onSplit,
}: {
  ticketNumber: number;
  message: TicketMessage;
  /** Offered on the customer's messages while the ticket can be worked on (F28). */
  onSplit?: ((message: TicketMessage) => void) | undefined;
}) {
  const author = message.author?.name ?? 'Someone';
  const note = message.kind === 'note';
  const heading =
    message.kind === 'reply'
      ? 'replied'
      : message.kind === 'forward'
        ? `forwarded the ticket to ${message.to.join(', ')}`
        : note
          ? 'added a private note'
          : 'replied by email';
  return (
    <article
      aria-label={`${author} ${heading}`}
      className={cn(
        'rounded-xl border p-4',
        note ? 'border-warning-dot/40 bg-warning-bg' : 'border-border bg-surface',
      )}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Avatar name={author} size="sm" />
        <span className="font-medium text-ink">{author}</span>
        <span className="text-ink-muted">{heading}</span>
        {note && <Lock aria-hidden className="size-3.5 text-warning-text" />}
        {message.kind === 'forward' && <Forward aria-hidden className="size-3.5 text-ink-muted" />}
        {message.kind === 'customer' && <Mail aria-hidden className="size-3.5 text-ink-muted" />}
        <time dateTime={message.createdAt} className="text-xs text-ink-subtle">
          {relativeTime(message.createdAt)}
        </time>
        {message.fromTicketNumber !== null && (
          <Link
            to={`/tickets/${String(message.fromTicketNumber)}`}
            className="text-xs text-brand-link underline"
          >
            From #{message.fromTicketNumber}
          </Link>
        )}
        {message.emailStatus && (
          <span
            className="ml-auto"
            title={
              message.emailSentAt
                ? `Sent ${new Date(message.emailSentAt).toLocaleString()}`
                : undefined
            }
          >
            <Badge tone={EMAIL_STATUS[message.emailStatus].tone}>
              {EMAIL_STATUS[message.emailStatus].label}
            </Badge>
          </span>
        )}
      </header>
      {message.emailStatus === 'failed' && (
        <SendFailed ticketNumber={ticketNumber} message={message} />
      )}
      {message.kind === 'reply' && (
        <p className="mt-1 text-xs text-ink-muted">
          To {message.to.join(', ')}
          {message.cc.length > 0 && ` · Cc ${message.cc.join(', ')}`}
        </p>
      )}
      {message.body && (
        <p className="mt-2 text-sm break-words whitespace-pre-line text-ink">
          {withMentions(
            message.body,
            message.mentions.map((person) => person.name),
          )}
        </p>
      )}
      <FileLinks files={message.attachments} />
      {onSplit && message.kind === 'customer' && (
        <div className="mt-2 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            icon={<Split aria-hidden />}
            onClick={() => {
              onSplit(message);
            }}
          >
            Split into a new ticket
          </Button>
        </div>
      )}
    </article>
  );
}

/**
 * The ticket's conversation, oldest first: the description, then replies, notes and forwards,
 * with property changes in between (they can be hidden).
 */
export function Conversation({ ticket, fields }: { ticket: Ticket; fields: CustomField[] }) {
  const { connected } = useLive();
  // Live updates (F26) reload these on changes; without them they are checked every minute.
  const fallback = connected ? false : FALLBACK_REFRESH_MS;
  const messages = useGetApiV1TicketsNumberMessages(ticket.number, {
    query: {
      refetchInterval: (query) =>
        query.state.data?.messages.some((message) => message.emailStatus === 'queued')
          ? SENDING_REFRESH_MS
          : fallback,
    },
  });
  const activity = useGetApiV1TicketsNumberActivity(ticket.number, {
    query: { refetchInterval: fallback },
  });
  const [showChanges, setShowChanges] = useState(true);
  const [splitting, setSplitting] = useState<TicketMessage | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const split = usePostApiV1TicketsNumberMessagesMessageIdSplit({
    mutation: {
      onSuccess: (created) => {
        setSplitting(null);
        void refreshTickets(queryClient);
        toast({ tone: 'success', message: `Split into ticket #${String(created.number)}.` });
        void navigate(`/tickets/${String(created.number)}`);
      },
      onError: (failure) => {
        setSplitting(null);
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });
  // Merged and deleted tickets are read-only (F28).
  const workable = ticket.deletedAt === null && ticket.mergedInto === null;

  if (messages.isPending || activity.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (messages.isError || activity.isError) {
    return (
      <p role="alert" className="text-sm text-danger-text">
        The conversation didn&apos;t load. Reload the page to try again.
      </p>
    );
  }

  const items: Item[] = [
    { type: 'description' as const, at: ticket.createdAt },
    ...messages.data.messages.map((message) => ({
      type: 'message' as const,
      at: message.createdAt,
      message,
    })),
    ...(showChanges
      ? activity.data.activity
          .filter((entry) => entry.action !== 'created')
          .map((entry) => ({ type: 'activity' as const, at: entry.at, entry }))
      : []),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <section aria-label="Conversation" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">Conversation</h2>
        <CheckboxField
          checked={showChanges}
          onChange={(event) => {
            setShowChanges(event.target.checked);
          }}
        >
          Show changes
        </CheckboxField>
      </div>
      <ol className="flex flex-col gap-3">
        {items.map((item) => {
          if (item.type === 'description') {
            return (
              <li key="description">
                <article
                  aria-label={`${ticket.contact.name} raised the ticket`}
                  className="rounded-xl border border-border bg-surface p-4"
                >
                  <header className="flex flex-wrap items-center gap-2 text-sm">
                    <Avatar name={ticket.contact.name} size="sm" />
                    <span className="font-medium text-ink">{ticket.contact.name}</span>
                    <span className="text-ink-muted">
                      raised the ticket
                      {ticket.source === 'email' && ' by email'}
                      {ticket.source === 'web_form' && ' through the web form'}
                      {ticket.createdBy && ` (logged by ${ticket.createdBy.name})`}
                    </span>
                    {ticket.source === 'email' && (
                      <Mail aria-hidden className="size-3.5 text-ink-muted" />
                    )}
                    <time dateTime={ticket.createdAt} className="text-xs text-ink-subtle">
                      {relativeTime(ticket.createdAt)}
                    </time>
                  </header>
                  <p className="mt-2 text-sm break-words whitespace-pre-line text-ink">
                    {ticket.description || <span className="text-ink-muted">No description.</span>}
                  </p>
                  <FileLinks files={messages.data.descriptionFiles} />
                </article>
              </li>
            );
          }
          if (item.type === 'message') {
            return (
              <li key={item.message.id}>
                <MessageItem
                  ticketNumber={ticket.number}
                  message={item.message}
                  onSplit={workable ? setSplitting : undefined}
                />
              </li>
            );
          }
          return (
            <li key={item.entry.id} className="flex items-start gap-2 px-2 text-xs text-ink-muted">
              <span
                aria-hidden
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border-strong"
              />
              <p>
                <span className="font-medium text-ink-body">{item.entry.actor.name}</span>{' '}
                {activitySentence(item.entry, fields)}.{' '}
                <time dateTime={item.entry.at}>{relativeTime(item.entry.at)}</time>
              </p>
            </li>
          );
        })}
      </ol>
      {splitting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setSplitting(null);
          }}
          pending={split.isPending}
          title="Split this message into a new ticket?"
          description={`It becomes a new ticket for ${ticket.contact.name}, with its files, and leaves this one. Both histories say so.`}
          confirmLabel="Split into new ticket"
          onConfirm={() => {
            split.mutate({ number: ticket.number, messageId: splitting.id });
          }}
        />
      )}
    </section>
  );
}
