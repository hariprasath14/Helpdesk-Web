import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, EllipsisVertical, Merge, Pencil, SearchX, Trash2 } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { CustomField, Ticket } from '../../api/generated/model';
import {
  getGetApiV1TicketsNumberActivityQueryKey,
  getGetApiV1TicketsNumberMessagesQueryKey,
  getGetApiV1TicketsNumberQueryKey,
  useDeleteApiV1TicketsNumber,
  useGetApiV1Tickets,
  useGetApiV1TicketsNumber,
  usePatchApiV1TicketsNumber,
  usePostApiV1TicketsNumberRestore,
} from '../../api/generated/tickets/tickets';
import { ApiError } from '../../api/http';
import { FALLBACK_REFRESH_MS, useLive, useLiveEvent, useWatchTicket } from '../../app/live-context';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import { toneDotClass } from '../../components/badge-tones';
import { Button, IconButton } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Menu, MenuItem } from '../../components/Menu';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/StateMessage';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toast-context';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { cn } from '../../lib/cn';
import { relativeTime } from '../../lib/relative-time';
import { formError } from '../auth/api-errors';
import { changedValues, useCustomFields } from '../custom-fields/custom-values';
import { problemsFrom, type FormProblems } from '../contacts/directory';
import { can, useSession } from '../workspace/session-context';
import { RequesterPicker } from './RequesterPicker';
import { Composer, type Kind } from './Composer';
import { Conversation } from './Conversation';
import { MergeDrawer } from './MergeDrawer';
import { PresenceLine } from './PresenceLine';
import { usePresence, type Writing } from './usePresence';
import { priorityLabel, priorityTone, statusLabel, statusTone, ticketRef } from './ticket-labels';
import { SlaBadges } from '../sla/SlaBadges';
import { rebaseDraft } from './ticket-draft';
import { TicketFields, type PropertiesDraft } from './TicketFields';
import { refreshTickets } from './tickets-cache';

const draftOf = (ticket: Ticket): PropertiesDraft => ({
  status: ticket.status,
  priority: ticket.priority,
  type: ticket.type ?? '',
  teamId: ticket.team?.id ?? '',
  assigneeUserId: ticket.assignee?.userId ?? '',
  tags: ticket.tags,
  customFields: ticket.customFields,
});

/** What the properties panel changed, for a PATCH (empty when nothing did). */
function changesOf(ticket: Ticket, draft: PropertiesDraft) {
  const before = draftOf(ticket);
  const changes: Record<string, unknown> = {};
  if (draft.status !== before.status) changes.status = draft.status;
  if (draft.priority !== before.priority) changes.priority = draft.priority;
  if (draft.type !== before.type) changes.type = draft.type === '' ? null : draft.type;
  if (draft.teamId !== before.teamId) changes.teamId = draft.teamId === '' ? null : draft.teamId;
  if (draft.assigneeUserId !== before.assigneeUserId) {
    changes.assigneeUserId = draft.assigneeUserId === '' ? null : draft.assigneeUserId;
  }
  if (JSON.stringify(draft.tags) !== JSON.stringify(before.tags)) changes.tags = draft.tags;
  const custom = changedValues(before.customFields, draft.customFields);
  if (Object.keys(custom).length > 0) changes.customFields = custom;
  return changes;
}

/** The ticket's properties with an Update button; the form keeps edits until saved. */
function PropertiesPanel({ ticket, onSaved }: { ticket: Ticket; onSaved: (t: Ticket) => void }) {
  const { fields } = useCustomFields('ticket');
  const [draft, setDraft] = useState(() => draftOf(ticket));
  const [base, setBase] = useState(ticket);
  const [problems, setProblems] = useState<FormProblems>({ fields: {} });
  const update = usePatchApiV1TicketsNumber({
    mutation: {
      onSuccess: (saved) => {
        setProblems({ fields: {} });
        onSaved(saved);
      },
      onError: (failure) => {
        setProblems(problemsFrom(failure));
      },
    },
  });
  // The ticket changed elsewhere (someone else, a rule, another tab): take the new values, keeping
  // this person's own unsaved edits.
  if (ticket.updatedAt !== base.updatedAt) {
    setBase(ticket);
    setDraft(rebaseDraft(draft, draftOf(base), draftOf(ticket)));
  }
  const changes = changesOf(ticket, draft);
  const dirty = Object.keys(changes).length > 0;

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dirty) update.mutate({ number: ticket.number, data: changes });
  };

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label="Properties"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5"
    >
      <h2 className="text-base font-bold">Properties</h2>
      {problems.form && (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
          {problems.form}
        </p>
      )}
      <TicketFields
        layout="rows"
        savedAssignee={ticket.assignee}
        draft={draft}
        customFields={fields}
        errors={problems.fields}
        disabled={ticket.deletedAt !== null || ticket.mergedInto !== null}
        onChange={(next) => {
          setDraft((current) => ({ ...current, ...next }));
        }}
      />
      {dirty && <UnsavedChangesGuard />}
      {ticket.deletedAt === null && ticket.mergedInto === null && (
        // Stays in view at the bottom of the screen while the properties scroll (Step 5b); the
        // negative offset covers the page area's bottom padding on phones and tablets.
        <div className="sticky bottom-0 -mx-5 -mb-5 flex max-lg:-bottom-5 max-lg:pb-8 items-center justify-end gap-2 rounded-b-xl border-t border-border bg-surface px-5 py-3">
          {dirty && (
            <span className="mr-auto text-xs font-medium text-warning-text">
              {Object.keys(changes).length === 1
                ? '1 unsaved change'
                : `${String(Object.keys(changes).length)} unsaved changes`}
            </span>
          )}
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(draftOf(ticket));
                setProblems({ fields: {} });
              }}
            >
              Discard
            </Button>
          )}
          <Button type="submit" disabled={!dirty} loading={update.isPending}>
            Update
          </Button>
        </div>
      )}
    </form>
  );
}

/** The subject as the page title, with a pencil to rename it. */
function SubjectEditor({ ticket, onSaved }: { ticket: Ticket; onSaved: (t: Ticket) => void }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(ticket.subject);
  const [error, setError] = useState<string>();
  const save = usePatchApiV1TicketsNumber({
    mutation: {
      onSuccess: (saved) => {
        setEditing(false);
        onSaved(saved);
      },
      onError: (failure) => {
        setError(problemsFrom(failure).fields.subject ?? formError(failure));
      },
    },
  });
  if (!editing) {
    return (
      <span className="inline-flex items-start gap-1">
        <span>{ticket.subject}</span>
        {ticket.deletedAt === null && ticket.mergedInto === null && (
          <IconButton
            label="Edit subject"
            size="sm"
            onClick={() => {
              setSubject(ticket.subject);
              setError(undefined);
              setEditing(true);
            }}
          >
            <Pencil aria-hidden className="size-4" />
          </IconButton>
        )}
      </span>
    );
  }
  return (
    <form
      noValidate
      className="flex flex-col gap-2 sm:flex-row sm:items-start"
      onSubmit={(event) => {
        event.preventDefault();
        if (!subject.trim()) setError('Enter a subject.');
        else if (subject.trim() === ticket.subject) setEditing(false);
        else save.mutate({ number: ticket.number, data: { subject: subject.trim() } });
      }}
    >
      <div className="min-w-0 flex-1 text-sm font-normal">
        <TextField
          label="Subject"
          maxLength={200}
          value={subject}
          error={error}
          onChange={(event) => {
            setSubject(event.target.value);
          }}
        />
      </div>
      <div className="flex gap-2 sm:pt-6">
        <Button type="submit" size="sm" loading={save.isPending}>
          Save
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * The reply bar (Step 5b): folded until someone chooses Reply, Note or Forward, then the composer.
 * The composer stays mounted while folded, so drafts are kept.
 */
function ReplyArea({ ticket, onWriting }: { ticket: Ticket; onWriting: (w: Writing) => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(ticket.contact.email ? 'reply' : 'note');
  const start = (next: Kind) => {
    setKind(next);
    setOpen(true);
  };
  return (
    // Folded, it stays at the bottom of the screen on phones and tablets.
    <div
      className={cn(
        !open &&
          'max-lg:sticky max-lg:-bottom-5 max-lg:z-10 max-lg:bg-surface-page max-lg:pt-2 max-lg:pb-7',
      )}
    >
      {!open && (
        <div
          role="group"
          aria-label="Write on this ticket"
          className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-sm"
        >
          <button
            type="button"
            onClick={() => {
              start(ticket.contact.email ? 'reply' : 'note');
            }}
            className="min-w-0 flex-1 truncate rounded-lg bg-surface-sunken px-3 py-2 text-left text-sm text-ink-muted hover:text-ink max-sm:hidden"
          >
            {ticket.contact.email ? `Reply to ${ticket.contact.name}…` : 'Add a private note…'}
          </button>
          <Button
            size="sm"
            className="max-sm:flex-1"
            onClick={() => {
              start('reply');
            }}
          >
            Reply
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="max-sm:flex-1"
            onClick={() => {
              start('note');
            }}
          >
            Note
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="max-sm:flex-1"
            onClick={() => {
              start('forward');
            }}
          >
            Forward
          </Button>
        </div>
      )}
      <div hidden={!open}>
        <Composer
          ticket={ticket}
          onWriting={onWriting}
          kind={kind}
          onKindChange={setKind}
          onClose={() => {
            setOpen(false);
          }}
        />
      </div>
    </div>
  );
}

/** The requester (Step 5b): who they are, how to reach them, and their other open tickets. */
function RequesterCard({ ticket, readOnly }: { ticket: Ticket; readOnly: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [changing, setChanging] = useState(false);
  const others = useGetApiV1Tickets({
    contactId: ticket.contact.id,
    status: 'open,pending,waiting_on_customer',
    limit: 4,
  });
  const otherTickets = (others.data?.tickets ?? [])
    .filter((other) => other.number !== ticket.number)
    .slice(0, 3);
  const changeRequester = usePatchApiV1TicketsNumber({
    mutation: {
      onSuccess: (next) => {
        queryClient.setQueryData(getGetApiV1TicketsNumberQueryKey(next.number), next);
        void refreshTickets(queryClient);
        setChanging(false);
        toast({ tone: 'success', message: 'Requester changed.' });
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });
  return (
    <section
      aria-label="Requester"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="sr-only">Requester</h2>
      <div className="flex items-start gap-3">
        <Avatar name={ticket.contact.name} />
        <div className="min-w-0 flex-1 text-sm">
          <Link
            to={`/contacts/${ticket.contact.id}`}
            className="font-semibold text-brand-link hover:underline"
          >
            {ticket.contact.name}
          </Link>
          {ticket.company && (
            <p className="truncate">
              <Link
                to={`/companies/${ticket.company.id}`}
                className="text-ink-muted hover:underline"
              >
                {ticket.company.name}
              </Link>
            </p>
          )}
          {ticket.contact.email && (
            <p className="truncate text-ink-muted">{ticket.contact.email}</p>
          )}
        </div>
        {!readOnly && !changing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setChanging(true);
            }}
          >
            Change
          </Button>
        )}
      </div>
      {changing && (
        <RequesterPicker
          label="Change requester"
          value={null}
          onChange={(contact) => {
            if (contact.id !== ticket.contact.id) {
              changeRequester.mutate({ number: ticket.number, data: { contactId: contact.id } });
            } else setChanging(false);
          }}
        />
      )}
      {otherTickets.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <h3 className="text-xs font-medium text-ink-subtle">Their other open tickets</h3>
          <ul className="flex flex-col">
            {otherTickets.map((other) => (
              <li key={other.number}>
                <Link
                  to={`/tickets/${String(other.number)}`}
                  className="flex items-center gap-2 rounded-md py-1 text-[13px] text-ink-body hover:text-brand-link"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {ticketRef(other.number)} {other.subject}
                  </span>
                  <Badge tone={statusTone(other.status)}>{statusLabel(other.status)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** A loaded ticket (Step 5b layout): one header band, the conversation and the details. */
function LoadedTicket({ ticket: data, fields }: { ticket: Ticket; fields: CustomField[] }) {
  const me = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const number = data.number;
  const [deleting, setDeleting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [section, setSection] = useState<'conversation' | 'details'>('conversation');
  const [writing, setWriting] = useState<Writing>(null);
  const viewers = usePresence(data.id, writing);

  const saved = (next: Ticket, message = 'Ticket updated.') => {
    queryClient.setQueryData(getGetApiV1TicketsNumberQueryKey(next.number), next);
    void refreshTickets(queryClient);
    toast({ tone: 'success', message });
  };
  const take = usePatchApiV1TicketsNumber({
    mutation: {
      onSuccess: (next) => {
        saved(next, `You have ticket ${ticketRef(next.number)}.`);
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });
  const remove = useDeleteApiV1TicketsNumber({
    mutation: {
      onSuccess: () => {
        setDeleting(false);
        void refreshTickets(queryClient);
        toast({ tone: 'success', message: `Ticket ${ticketRef(number)} moved to the trash.` });
        void navigate('/tickets');
      },
      onError: (failure) => {
        setDeleting(false);
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });
  const restore = usePostApiV1TicketsNumberRestore({
    mutation: {
      onSuccess: (next) => {
        saved(next, `Ticket ${ticketRef(number)} restored.`);
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
      },
    },
  });

  const deleted = data.deletedAt !== null;
  // Merged into another ticket (F28): read-only, like a deleted one.
  const readOnly = deleted || data.mergedInto !== null;
  const admin = can(me, 'tickets.delete');
  const canMerge = can(me, 'tickets.merge');
  const tabs = [
    { id: 'conversation', label: 'Conversation' },
    { id: 'details', label: 'Details' },
  ] as const;

  return (
    // From 1024px the page fills the window: the conversation and the details scroll separately.
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      <header className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <Link
            to="/tickets"
            aria-label="Back to tickets"
            className="mt-0.5 shrink-0 rounded-md p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </Link>
          <span className="mt-1 shrink-0 text-sm font-medium text-ink-muted tabular-nums">
            {ticketRef(number)}
          </span>
          <h1 className="min-w-0 flex-1 text-xl font-bold break-words">
            <SubjectEditor key={data.subject} ticket={data} onSaved={saved} />
          </h1>
          {!readOnly && (
            <div className="flex shrink-0 items-center gap-2">
              {!data.assignee && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={take.isPending}
                  onClick={() => {
                    take.mutate({ number, data: { assigneeUserId: me.user.id } });
                  }}
                >
                  Take it
                </Button>
              )}
              {(admin || canMerge) && (
                <Menu
                  trigger={
                    <IconButton label="More actions">
                      <EllipsisVertical aria-hidden className="size-4" />
                    </IconButton>
                  }
                >
                  {canMerge && (
                    <MenuItem
                      onSelect={() => {
                        setMerging(true);
                      }}
                    >
                      Merge with other tickets
                    </MenuItem>
                  )}
                  {admin && (
                    <MenuItem
                      danger
                      onSelect={() => {
                        setDeleting(true);
                      }}
                    >
                      Delete ticket
                    </MenuItem>
                  )}
                </Menu>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-subtle">
          <Badge tone={statusTone(data.status)} dot>
            {statusLabel(data.status)}
          </Badge>
          <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-body">
            <span
              aria-hidden
              className={cn('size-2 rounded-full', toneDotClass(priorityTone(data.priority)))}
            />
            <span className="sr-only">Priority </span>
            <span>{priorityLabel(data.priority)}</span>
          </span>
          {!readOnly && <SlaBadges sla={data.sla} />}
          <span>
            raised by {data.contact.name}
            {data.source === 'email' && ' by email'}
            {data.source === 'web_form' && ' through the web form'} · created{' '}
            {relativeTime(data.createdAt)}
            {data.createdBy && ` by ${data.createdBy.name}`}
          </span>
          {!readOnly && (
            <span className="ml-auto">
              <PresenceLine viewers={viewers} />
            </span>
          )}
        </div>
      </header>
      {data.mergedInto && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg bg-info-bg px-4 py-3 text-sm text-info-text"
        >
          <Merge aria-hidden className="size-4 shrink-0" />
          <span>
            This ticket was merged into{' '}
            <Link
              to={`/tickets/${String(data.mergedInto.number)}`}
              className="font-medium underline"
            >
              {ticketRef(data.mergedInto.number)}
            </Link>
            . Its messages are there now; work on that one.
          </span>
        </div>
      )}
      {deleted && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-lg bg-warning-bg px-4 py-3 text-sm text-warning-text sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-center gap-2">
            <Trash2 aria-hidden className="size-4" />
            This ticket is in the trash
            {data.deletedAt ? ` since ${relativeTime(data.deletedAt)}` : ''}. Restore it to work on
            it.
          </span>
          {admin && (
            <Button
              variant="outline"
              size="sm"
              loading={restore.isPending}
              onClick={() => {
                restore.mutate({ number });
              }}
            >
              Restore ticket
            </Button>
          )}
        </div>
      )}
      {/* Narrower than 1024px: the conversation and the details are two tabs. */}
      <div
        role="tablist"
        aria-label="Ticket sections"
        className="flex gap-1 border-b border-border lg:hidden"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={section === tab.id}
            onClick={() => {
              setSection(tab.id);
            }}
            className={cn(
              'flex-1 px-3 py-2 text-sm font-medium',
              section === tab.id
                ? 'border-b-2 border-brand-600 text-brand-link'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-4 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div
          className={cn(
            'flex min-w-0 flex-col gap-3 lg:min-h-0',
            section !== 'conversation' && 'max-lg:hidden',
          )}
        >
          <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
            <Conversation ticket={data} fields={fields} />
          </div>
          {!readOnly && <ReplyArea ticket={data} onWriting={setWriting} />}
        </div>
        <div
          className={cn(
            'flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1',
            section !== 'details' && 'max-lg:hidden',
          )}
        >
          <RequesterCard ticket={data} readOnly={readOnly} />
          <PropertiesPanel ticket={data} onSaved={saved} />
        </div>
      </div>
      {merging && (
        <MergeDrawer
          ticket={data}
          onClose={() => {
            setMerging(false);
          }}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        destructive
        pending={remove.isPending}
        title={`Delete ticket ${ticketRef(number)}?`}
        description="It moves to the trash: hidden from lists, kept with its history. An admin can restore it."
        confirmLabel="Delete ticket"
        onConfirm={() => {
          remove.mutate({ number });
        }}
      />
    </div>
  );
}

/** One ticket: its conversation and composer, requester and properties; admins delete and restore. */
export function TicketPage() {
  const { number: param } = useParams();
  const number = Number(param);
  const valid = Number.isInteger(number) && number > 0;
  const queryClient = useQueryClient();
  const { fields } = useCustomFields('ticket');
  const { connected } = useLive();
  const ticket = useGetApiV1TicketsNumber(number, {
    query: { enabled: valid, refetchInterval: connected ? false : FALLBACK_REFRESH_MS },
  });
  // Live updates (F26): changes by anyone, rules or the worker show at once.
  useWatchTicket(ticket.data?.id);
  useLiveEvent<{ ticketId: string }>('ticket', ({ ticketId }) => {
    if (ticketId !== ticket.data?.id) return;
    void queryClient.invalidateQueries({ queryKey: getGetApiV1TicketsNumberQueryKey(number) });
    void queryClient.invalidateQueries({
      queryKey: getGetApiV1TicketsNumberMessagesQueryKey(number),
    });
    void queryClient.invalidateQueries({
      queryKey: getGetApiV1TicketsNumberActivityQueryKey(number),
    });
  });

  const crumbs = [
    { label: 'Tickets', to: '/tickets' },
    { label: valid ? ticketRef(number) : 'Ticket' },
  ];
  if (!valid || (ticket.error instanceof ApiError && ticket.error.status === 404)) {
    return (
      <>
        <PageHeader title="Ticket not found" breadcrumbs={crumbs} />
        <EmptyState
          icon={SearchX}
          title="This ticket doesn't exist"
          description="Check the number, or find it in the ticket list."
          actions={
            <Link to="/tickets" className="font-medium text-brand-link hover:underline">
              All tickets
            </Link>
          }
        />
      </>
    );
  }
  if (ticket.isPending) {
    return (
      <>
        <PageHeader title={<Skeleton className="h-7 w-72" />} breadcrumbs={crumbs} />
        <div
          role="status"
          aria-label="Loading ticket"
          className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]"
        >
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }
  if (ticket.isError) {
    return (
      <>
        <PageHeader title={ticketRef(number)} breadcrumbs={crumbs} />
        <ErrorState
          what="this ticket"
          retrying={ticket.isFetching}
          onRetry={() => {
            void ticket.refetch();
          }}
        />
      </>
    );
  }
  return <LoadedTicket key={ticket.data.id} ticket={ticket.data} fields={fields} />;
}
