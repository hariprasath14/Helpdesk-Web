import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Paperclip, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react';
import { useGetApiV1People } from '../../api/generated/members/members';
import type { Attachment, Ticket, TicketSummaryStatus } from '../../api/generated/model';
import {
  deleteApiV1AttachmentsAttachmentId,
  getApiV1TicketsNumberMessages,
  getGetApiV1TicketsNumberMessagesQueryKey,
  postApiV1Attachments,
  usePostApiV1TicketsNumberMessages,
} from '../../api/generated/tickets/tickets';
import { Button, IconButton } from '../../components/Button';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toast-context';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/relative-time';
import { formError } from '../auth/api-errors';
import { CannedResponsePicker } from '../canned-responses/CannedResponsePicker';
import { problemsFrom, type FormProblems } from '../contacts/directory';
import { useSession } from '../workspace/session-context';
import { fileSize, STATUS_OPTIONS, statusLabel } from './ticket-labels';
import { refreshTickets } from './tickets-cache';
import type { Writing } from './usePresence';

export type Kind = 'reply' | 'note' | 'forward';

const COMPOSER_TABS: { kind: Kind; label: string; send: string }[] = [
  { kind: 'reply', label: 'Reply', send: 'Send reply' },
  { kind: 'note', label: 'Private note', send: 'Add note' },
  { kind: 'forward', label: 'Forward', send: 'Forward' },
];

interface Upload {
  key: string;
  name: string;
  file?: Attachment;
  error?: string;
}

interface Draft {
  body: string;
  /** Reply copies, or forward recipients, as typed (commas or spaces between). */
  addresses: string;
  uploads: Upload[];
  /** '' keeps the current status. */
  status: string;
}

const emptyDraft: Draft = { body: '', addresses: '', uploads: [], status: '' };
const addressList = (text: string) =>
  text
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);

/** The @word being typed at the end of `text`, if any ("Can you @ne" → "ne"). */
const mentionQuery = (text: string) => /(?:^|\s)@([\p{L}\p{N}.'-]*)$/u.exec(text)?.[1];

/**
 * Write on a ticket: a reply to the requester, a private note (with @mentions) or a forward, with
 * files, and optionally a new status. Each tab keeps its own draft until sent.
 */
export function Composer({
  ticket,
  onWriting,
  kind: chosenKind,
  onKindChange,
  onClose,
}: {
  ticket: Ticket;
  /** What this person is writing for others to see (F27): a reply or forward with text, or nothing. */
  onWriting?: (writing: Writing) => void;
  /** The tab, when the page chooses it (the reply bar, Step 5b); otherwise the composer keeps it. */
  kind?: Kind;
  onKindChange?: (kind: Kind) => void;
  /** Folds the composer back into the reply bar; the drafts stay. */
  onClose?: () => void;
}) {
  const id = useId();
  const me = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const people = useGetApiV1People();
  const [ownKind, setOwnKind] = useState<Kind>(ticket.contact.email ? 'reply' : 'note');
  const kind = chosenKind ?? ownKind;
  const setKind = onKindChange ?? setOwnKind;
  const [drafts, setDrafts] = useState<Record<Kind, Draft>>({
    reply: emptyDraft,
    note: emptyDraft,
    forward: emptyDraft,
  });
  const [mentioned, setMentioned] = useState<Map<string, string>>(new Map());
  const [problems, setProblems] = useState<FormProblems>({ fields: {} });
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const draft = drafts[kind];
  const tab = COMPOSER_TABS.find((item) => item.kind === kind) ?? COMPOSER_TABS[0];
  // Collision detection (F27): since when this person has been looking, and who replied since.
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const [repliedMeanwhile, setRepliedMeanwhile] = useState<{ name: string; at: string } | null>(
    null,
  );
  const [checking, setChecking] = useState(false);
  const writing: Writing = kind !== 'note' && draft.body.trim() ? kind : null;
  // Never lose a draft (Step 5b): leaving the page with text or files in any tab asks first.
  const hasDraft = Object.values(drafts).some(
    (item) => item.body.trim() !== '' || item.uploads.length > 0,
  );
  useEffect(() => {
    onWriting?.(writing);
  }, [onWriting, writing]);

  const change = (next: Partial<Draft>, of: Kind = kind) => {
    setDrafts((current) => ({ ...current, [of]: { ...current[of], ...next } }));
  };
  const setUploads = (of: Kind, update: (uploads: Upload[]) => Upload[]) => {
    setDrafts((current) => ({
      ...current,
      [of]: { ...current[of], uploads: update(current[of].uploads) },
    }));
  };

  const send = usePostApiV1TicketsNumberMessages({
    mutation: {
      onSuccess: (conversation) => {
        queryClient.setQueryData(
          getGetApiV1TicketsNumberMessagesQueryKey(ticket.number),
          conversation,
        );
        void refreshTickets(queryClient);
        change(emptyDraft);
        setProblems({ fields: {} });
        setRepliedMeanwhile(null);
        setOpenedAt(Date.now());
        if (kind === 'note') setMentioned(new Map());
        toast({
          tone: 'success',
          message:
            kind === 'note'
              ? 'Note added.'
              : kind === 'reply'
                ? 'Reply added. It is being emailed.'
                : 'Forward added. It is being emailed.',
        });
      },
      onError: (failure) => {
        setProblems(problemsFrom(failure));
      },
    },
  });

  const uploadFiles = (files: FileList | null) => {
    if (!files) return;
    const of = kind;
    for (const file of Array.from(files)) {
      const key = `${file.name}-${String(Date.now())}-${String(Math.random())}`;
      setUploads(of, (uploads) => [...uploads, { key, name: file.name }]);
      const body = new FormData();
      body.append('file', file);
      postApiV1Attachments({ body })
        .then((saved) => {
          setUploads(of, (uploads) =>
            uploads.map((item) => (item.key === key ? { ...item, file: saved } : item)),
          );
        })
        .catch((failure: unknown) => {
          const found = problemsFrom(failure);
          const message = found.fields.file ?? found.form ?? formError(failure);
          setUploads(of, (uploads) =>
            uploads.map((item) => (item.key === key ? { ...item, error: message } : item)),
          );
        });
    }
    if (fileInput.current) fileInput.current.value = '';
  };
  const removeUpload = (upload: Upload) => {
    setUploads(kind, (uploads) => uploads.filter((item) => item.key !== upload.key));
    if (upload.file) void deleteApiV1AttachmentsAttachmentId(upload.file.id).catch(() => undefined);
  };

  // @mentions (notes only): suggestions for the word being typed, from active members.
  const query = kind === 'note' ? mentionQuery(draft.body) : undefined;
  const suggestions =
    query === undefined
      ? []
      : (people.data?.people ?? [])
          .filter(
            (person) =>
              person.status === 'active' && person.name.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 6);
  const choose = (person: { userId: string; name: string }) => {
    change({ body: draft.body.replace(/@([\p{L}\p{N}.'-]*)$/u, `@${person.name} `) });
    setMentioned((current) => new Map(current).set(person.userId, person.name));
    setSuggestionIndex(0);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setSuggestionIndex((index) => (index + step + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      const person = suggestions[Math.min(suggestionIndex, suggestions.length - 1)];
      if (person) {
        event.preventDefault();
        choose(person);
      }
    }
  };

  const pending = draft.uploads.some((upload) => !upload.file && !upload.error);
  /** A reply or forward someone else sent since this person opened the ticket, if any. */
  const otherReplySince = async () => {
    const latest = await queryClient.query({
      queryKey: getGetApiV1TicketsNumberMessagesQueryKey(ticket.number),
      queryFn: () => getApiV1TicketsNumberMessages(ticket.number),
      staleTime: 0,
    });
    return latest.messages
      .filter(
        (message) =>
          message.kind !== 'note' &&
          message.kind !== 'customer' &&
          message.author?.type === 'member' &&
          message.author.userId !== me.user.id &&
          Date.parse(message.createdAt) > openedAt,
      )
      .at(-1);
  };

  const submit = (event?: SyntheticEvent<HTMLFormElement>, anyway = false) => {
    event?.preventDefault();
    if (pending || checking) return;
    const sent = draft.uploads.flatMap((upload) => (upload.file ? [upload.file.id] : []));
    if (!draft.body.trim() && sent.length === 0) {
      setProblems({ fields: { body: 'Write a message or attach a file.' } });
      return;
    }
    if (kind === 'forward' && addressList(draft.addresses).length === 0) {
      setProblems({ fields: { to: 'Add who to forward this ticket to.' } });
      return;
    }
    setProblems({ fields: {} });
    // Before a reply or forward, a warning (not a block) if someone else answered meanwhile.
    if (kind !== 'note' && !anyway) {
      setChecking(true);
      otherReplySince()
        .then(
          (other) => {
            if (other?.author?.type === 'member') {
              setRepliedMeanwhile({ name: other.author.name, at: other.createdAt });
            } else submit(undefined, true);
          },
          () => {
            submit(undefined, true);
          },
        )
        .finally(() => {
          setChecking(false);
        });
      return;
    }
    send.mutate({
      number: ticket.number,
      data: {
        kind,
        body: draft.body,
        attachmentIds: sent,
        ...(kind === 'reply' && draft.addresses.trim() ? { cc: addressList(draft.addresses) } : {}),
        ...(kind === 'forward' ? { to: addressList(draft.addresses) } : {}),
        ...(kind === 'note'
          ? {
              mentions: [...mentioned]
                .filter(([, name]) => draft.body.includes(`@${name}`))
                .map(([userId]) => userId),
            }
          : {}),
        ...(kind !== 'forward' && draft.status
          ? { status: draft.status as TicketSummaryStatus }
          : {}),
      },
    });
  };

  const noEmail = kind === 'reply' && !ticket.contact.email;
  const error = (field: string) => problems.fields[field];
  const recipientsError =
    error(kind === 'forward' ? 'to' : 'cc') ??
    Object.entries(problems.fields).find(([field]) =>
      field.startsWith(kind === 'forward' ? 'to.' : 'cc.'),
    )?.[1];

  return (
    <section aria-label="Write" className="rounded-xl border border-border bg-surface">
      {/* The close button sits beside the tabs, not in the tab list (which holds only tabs). */}
      <div className="flex items-center gap-1 border-b border-border px-3 pt-2">
        <div role="tablist" aria-label="What to write" className="flex gap-1">
          {COMPOSER_TABS.map((item) => (
            <button
              key={item.kind}
              type="button"
              role="tab"
              id={`${id}-${item.kind}`}
              aria-selected={item.kind === kind}
              aria-controls={`${id}-panel`}
              onClick={() => {
                setKind(item.kind);
                setProblems({ fields: {} });
              }}
              className={cn(
                'rounded-t-lg px-3 py-2 text-sm font-medium',
                item.kind === kind
                  ? 'border-b-2 border-brand-600 text-brand-link'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {onClose && (
          <span className="ml-auto pb-1">
            <IconButton label="Close the editor" size="sm" onClick={onClose}>
              <X aria-hidden className="size-4" />
            </IconButton>
          </span>
        )}
      </div>
      {hasDraft && <UnsavedChangesGuard />}
      <form
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${kind}`}
        noValidate
        onSubmit={submit}
        className={cn('flex flex-col gap-3 p-4', kind === 'note' && 'bg-warning-bg/40')}
      >
        {problems.form && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {problems.form}
          </p>
        )}
        {kind === 'reply' &&
          (noEmail ? (
            <p
              role="status"
              className="rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-text"
            >
              {ticket.contact.name} has no email address, so a reply can&apos;t be sent. Add an
              email to the contact, or log a private note.
            </p>
          ) : (
            <p className="text-sm text-ink-muted">
              To <span className="font-medium text-ink">{ticket.contact.name}</span> &lt;
              {ticket.contact.email}&gt;
              {ticket.ccEmails.length > 0 && (
                // The requesters of tickets merged into this one (F28) get every reply.
                <span className="block text-xs">Always copied: {ticket.ccEmails.join(', ')}</span>
              )}
            </p>
          ))}
        {(kind === 'forward' || (kind === 'reply' && !noEmail)) && (
          <TextField
            label={kind === 'forward' ? 'To' : 'Cc'}
            placeholder={kind === 'forward' ? 'name@example.com' : 'Optional: more people to copy'}
            value={draft.addresses}
            error={recipientsError}
            hint="Separate addresses with commas."
            onChange={(event) => {
              change({ addresses: event.target.value });
            }}
          />
        )}
        <div className="relative flex flex-col gap-1.5">
          <label htmlFor={`${id}-body`} className="text-[13px] font-medium text-ink">
            {kind === 'note' ? 'Note' : 'Message'}
          </label>
          <textarea
            id={`${id}-body`}
            rows={5}
            maxLength={20_000}
            value={draft.body}
            disabled={noEmail}
            aria-invalid={error('body') ? true : undefined}
            aria-describedby={`${id}-body-hint`}
            aria-autocomplete={kind === 'note' ? 'list' : undefined}
            aria-controls={suggestions.length > 0 ? `${id}-mentions` : undefined}
            aria-activedescendant={
              suggestions.length > 0
                ? `${id}-mention-${String(Math.min(suggestionIndex, suggestions.length - 1))}`
                : undefined
            }
            placeholder={
              kind === 'note'
                ? 'Only your team sees notes. Type @ to mention someone.'
                : 'Write your reply'
            }
            onChange={(event) => {
              change({ body: event.target.value });
              setSuggestionIndex(0);
            }}
            onKeyDown={onKeyDown}
            className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-subtle focus:ring-2 focus:ring-brand-focus disabled:opacity-50 aria-invalid:border-danger-text"
          />
          {suggestions.length > 0 && (
            <div
              id={`${id}-mentions`}
              role="listbox"
              aria-label="People to mention"
              className="absolute top-full left-0 z-10 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-md"
            >
              {suggestions.map((person, index) => (
                <div
                  key={person.userId}
                  id={`${id}-mention-${String(index)}`}
                  role="option"
                  // The note box keeps focus; arrow keys move the highlighted person.
                  tabIndex={-1}
                  aria-selected={index === suggestionIndex}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(person);
                  }}
                  className={cn(
                    'cursor-pointer px-3 py-1.5 text-sm text-ink',
                    index === suggestionIndex && 'bg-surface-sunken',
                  )}
                >
                  {person.name}
                </div>
              ))}
            </div>
          )}
          <p
            id={`${id}-body-hint`}
            className={error('body') ? 'text-xs text-danger-text' : 'text-xs text-ink-subtle'}
          >
            {error('body') ??
              (kind === 'note'
                ? 'Private: the requester never sees notes.'
                : 'Plain text. Line breaks are kept.')}
          </p>
        </div>
        {draft.uploads.length > 0 && (
          <ul aria-label="Files to send" className="flex flex-wrap gap-2">
            {draft.uploads.map((upload) => (
              <li
                key={upload.key}
                className={cn(
                  'inline-flex max-w-72 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs',
                  upload.error
                    ? 'border-danger-text text-danger-text'
                    : 'border-border text-ink-body',
                )}
              >
                {upload.file || upload.error ? (
                  <Paperclip aria-hidden className="size-3.5 shrink-0" />
                ) : (
                  <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin" />
                )}
                <span className="truncate">{upload.name}</span>
                {upload.file && (
                  <span className="text-ink-subtle">{fileSize(upload.file.size)}</span>
                )}
                {upload.error && <span>: {upload.error}</span>}
                {!upload.file && !upload.error && <span className="sr-only">uploading</span>}
                <button
                  type="button"
                  aria-label={`Remove ${upload.name}`}
                  onClick={() => {
                    removeUpload(upload);
                  }}
                  className="rounded p-0.5 hover:bg-surface-sunken"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {error('attachmentIds') && (
          <p className="text-xs text-danger-text">{error('attachmentIds')}</p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <input
              ref={fileInput}
              type="file"
              multiple
              aria-label="Attach files"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                uploadFiles(event.target.files);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              icon={<Paperclip aria-hidden />}
              disabled={noEmail}
              onClick={() => {
                fileInput.current?.click();
              }}
            >
              Attach files
            </Button>
            <CannedResponsePicker
              ticketNumber={ticket.number}
              disabled={noEmail}
              onInsert={(text) => {
                const before = draft.body.trimEnd();
                change({
                  body: before
                    ? `${before}

${text}`
                    : text,
                });
              }}
            />
            {kind !== 'forward' && !noEmail && (
              <div className="w-56">
                <SelectField
                  label="Then set status"
                  value={draft.status}
                  error={error('status')}
                  options={[
                    { value: '', label: `Keep ${statusLabel(ticket.status)}` },
                    ...STATUS_OPTIONS.filter((option) => option.value !== ticket.status),
                  ]}
                  onChange={(event) => {
                    change({ status: event.target.value });
                  }}
                />
              </div>
            )}
          </div>
          <Button
            type="submit"
            loading={send.isPending || checking}
            disabled={noEmail || pending || repliedMeanwhile !== null}
          >
            {tab?.send ?? 'Send'}
          </Button>
        </div>
        {repliedMeanwhile && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-text sm:flex-row sm:items-center sm:justify-between"
          >
            <span>
              {repliedMeanwhile.name} replied {relativeTime(repliedMeanwhile.at)}. Check it before
              you send yours.
            </span>
            <span className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRepliedMeanwhile(null);
                  setOpenedAt(Date.now());
                  document
                    .querySelector('[aria-label="Conversation"]')
                    ?.lastElementChild?.scrollIntoView({ block: 'center' });
                }}
              >
                Review
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setRepliedMeanwhile(null);
                  submit(undefined, true);
                }}
              >
                Send anyway
              </Button>
            </span>
          </div>
        )}
        {Object.keys(problems.fields).some((field) => field.startsWith('customFields.')) && (
          <p role="alert" className="text-sm text-danger-text">
            To set that status, fill in the required fields under Properties first.
          </p>
        )}
      </form>
    </section>
  );
}
