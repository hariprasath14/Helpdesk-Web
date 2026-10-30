import { useQueryClient } from '@tanstack/react-query';
import { EllipsisVertical, MessageSquareText, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import {
  getGetApiV1CannedResponsesQueryKey,
  useDeleteApiV1CannedResponsesCannedResponseId,
  useGetApiV1CannedResponses,
} from '../../api/generated/canned-responses/canned-responses';
import type { CannedResponse } from '../../api/generated/model';
import { Badge } from '../../components/Badge';
import { Button, IconButton } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Menu, MenuItem } from '../../components/Menu';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState, ErrorState } from '../../components/StateMessage';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toast-context';
import { formError } from '../auth/api-errors';
import { CannedResponseDrawer } from './CannedResponseDrawer';
import { matchesSearch } from './canned-search';

const BREADCRUMBS = [{ label: 'Settings' }, { label: 'Canned responses' }];

function CannedRow({
  item,
  onEdit,
  onDelete,
}: {
  item: CannedResponse;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {item.canEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="font-medium text-brand-link hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {item.title}
            </button>
          ) : (
            <p className="font-medium text-ink">{item.title}</p>
          )}
          <Badge tone={item.shared ? 'info' : 'neutral'}>
            {item.shared ? 'Shared' : 'Only you'}
          </Badge>
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm whitespace-pre-line text-ink-muted">
          {item.body}
        </p>
        {item.shared && <p className="mt-0.5 text-xs text-ink-subtle">By {item.authorName}</p>}
      </div>
      {item.canEdit && (
        <Menu
          trigger={
            <IconButton label={`Actions for ${item.title}`} size="sm">
              <EllipsisVertical aria-hidden className="size-4" />
            </IconButton>
          }
        >
          <MenuItem onSelect={onEdit}>Edit</MenuItem>
          <MenuItem danger onSelect={onDelete}>
            Delete
          </MenuItem>
        </Menu>
      )}
    </li>
  );
}

/**
 * Settings → Canned responses: saved replies to drop into the reply box. Everyone keeps their own;
 * admins and supervisors also manage the shared ones.
 */
export function CannedResponsesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useGetApiV1CannedResponses();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CannedResponse | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CannedResponse | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetApiV1CannedResponsesQueryKey() });

  const remove = useDeleteApiV1CannedResponsesCannedResponseId({
    mutation: {
      onSuccess: () => {
        void refresh();
        toast({ tone: 'success', message: `Canned response ${deleting?.title ?? ''} deleted.` });
        setDeleting(null);
      },
      onError: (failure) => {
        toast({ tone: 'danger', message: formError(failure) });
        setDeleting(null);
      },
    },
  });

  const newButton = (
    <Button
      icon={<Plus aria-hidden />}
      onClick={() => {
        setEditing('new');
      }}
    >
      New canned response
    </Button>
  );
  const items = list.data?.cannedResponses;
  const shown = (items ?? []).filter((item) => matchesSearch(item, search));

  let body;
  if (list.isPending) {
    body = (
      <div role="status" aria-label="Loading canned responses" className="flex flex-col gap-3">
        {[1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-14 w-full" />
        ))}
      </div>
    );
  } else if (list.isError) {
    body = (
      <ErrorState
        what="canned responses"
        retrying={list.isFetching}
        onRetry={() => {
          void list.refetch();
        }}
      />
    );
  } else if (list.data.cannedResponses.length === 0) {
    body = (
      <EmptyState
        icon={MessageSquareText}
        title="No canned responses yet"
        description="Save the replies you send again and again, such as password reset steps. Pick one in the reply box and the customer's name and ticket number are filled in."
        actions={newButton}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <div className="sm:w-80">
          <TextField
            label="Search canned responses"
            type="search"
            placeholder="Title or text"
            trailing={<Search aria-hidden className="mr-2 size-4 text-ink-subtle" />}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </div>
        <section className="rounded-xl border border-border bg-surface px-5 py-1">
          {shown.length === 0 ? (
            <p className="py-4 text-sm text-ink-muted">No canned responses match.</p>
          ) : (
            <ul aria-label="Canned responses" className="divide-y divide-border">
              {shown.map((item) => (
                <CannedRow
                  key={item.id}
                  item={item}
                  onEdit={() => {
                    setEditing(item);
                  }}
                  onDelete={() => {
                    setDeleting(item);
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Canned responses"
        breadcrumbs={BREADCRUMBS}
        {...(items
          ? { meta: items.length === 1 ? '1 reply' : `${String(items.length)} replies` }
          : {})}
        {...(items && items.length > 0 ? { actions: newButton } : {})}
      />
      {body}
      {editing && (
        <CannedResponseDrawer
          cannedResponse={editing === 'new' ? undefined : editing}
          placeholders={list.data?.placeholders ?? []}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={(message) => {
            void refresh();
            setEditing(null);
            toast({ tone: 'success', message });
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
          destructive
          pending={remove.isPending}
          title={`Delete the canned response ${deleting.title}?`}
          description={
            deleting.shared
              ? "Nobody in the workspace can use it any more. Replies already sent don't change."
              : "Replies already sent don't change. This can't be undone."
          }
          confirmLabel="Delete"
          onConfirm={() => {
            remove.mutate({ cannedResponseId: deleting.id });
          }}
        />
      )}
    </>
  );
}
