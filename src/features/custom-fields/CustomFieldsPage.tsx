import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ChevronRight,
  EllipsisVertical,
  GripVertical,
  ListPlus,
  Lock,
  Plus,
} from 'lucide-react';
import { Tabs } from 'radix-ui';
import { useEffect, useRef, useState, type DragEvent, type Ref } from 'react';
import { useSearchParams } from 'react-router';
import type {
  CustomField,
  CustomFieldList,
  CustomFieldRecordType,
} from '../../api/generated/model';
import {
  getGetApiV1CustomFieldsQueryKey,
  useGetApiV1CustomFields,
  usePostApiV1CustomFieldsFieldIdArchive,
  usePostApiV1CustomFieldsFieldIdRestore,
  usePutApiV1CustomFieldsOrder,
} from '../../api/generated/custom-fields/custom-fields';
import { Badge } from '../../components/Badge';
import { Button, IconButton } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Menu, MenuItem } from '../../components/Menu';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { EmptyState, ErrorState, NoAccessState } from '../../components/StateMessage';
import { useToast } from '../../components/toast-context';
import { cn } from '../../lib/cn';
import { formError } from '../auth/api-errors';
import { can, useSession } from '../workspace/session-context';
import { FieldDrawer } from './FieldDrawer';
import {
  MAX_ACTIVE_FIELDS,
  RECORD_TABS,
  recordTab,
  REQUIRED_NAMES,
  TYPE_NAMES,
} from './field-types';

type Editing = { field?: CustomField } | null;

function FieldRow({
  field,
  index,
  count,
  dragging,
  onEdit,
  onMove,
  onArchive,
  rowRef,
  drag,
}: {
  field: CustomField;
  index: number;
  count: number;
  dragging: boolean;
  onEdit: () => void;
  onMove: (to: number) => void;
  onArchive: () => void;
  rowRef: Ref<HTMLLIElement>;
  drag: {
    onDragStart: () => void;
    onDragEnd: () => void;
  };
}) {
  return (
    <li
      ref={rowRef}
      className={cn(
        'flex items-center gap-3 py-3',
        dragging && 'rounded-lg bg-brand-tint opacity-70',
      )}
    >
      {/* A mouse shortcut: keyboard and touch use Move up / Move down in the row's menu. */}
      <button
        type="button"
        draggable
        tabIndex={-1}
        aria-hidden
        title="Drag to reorder"
        onDragStart={(event: DragEvent) => {
          event.dataTransfer.effectAllowed = 'move';
          drag.onDragStart();
        }}
        onDragEnd={drag.onDragEnd}
        className="hidden cursor-grab text-ink-subtle active:cursor-grabbing sm:block"
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onEdit}
          className="max-w-full truncate text-left font-medium text-ink hover:underline"
        >
          {field.label}
        </button>
        <p className="truncate text-xs text-ink-muted">
          {TYPE_NAMES[field.type]}
          {field.choices.length > 0 &&
            ` · ${String(field.choices.filter((choice) => !choice.removed).length)} choices`}{' '}
          · <code className="font-mono">{field.key}</code>
        </p>
      </div>
      {field.required !== 'never' && (
        <Badge tone={field.required === 'always' ? 'brand' : 'info'}>
          {REQUIRED_NAMES[field.required]}
        </Badge>
      )}
      <Menu
        trigger={
          <IconButton label={`Actions for ${field.label}`} size="sm">
            <EllipsisVertical aria-hidden className="size-4" />
          </IconButton>
        }
      >
        <MenuItem onSelect={onEdit}>Edit</MenuItem>
        {index > 0 && (
          <MenuItem
            onSelect={() => {
              onMove(index - 1);
            }}
          >
            Move up
          </MenuItem>
        )}
        {index < count - 1 && (
          <MenuItem
            onSelect={() => {
              onMove(index + 1);
            }}
          >
            Move down
          </MenuItem>
        )}
        <MenuItem onSelect={onArchive}>Archive</MenuItem>
      </Menu>
    </li>
  );
}

function FieldsTab({ recordType }: { recordType: CustomFieldRecordType }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const queryKey = getGetApiV1CustomFieldsQueryKey({ recordType });
  const list = useGetApiV1CustomFields({ recordType });
  const [editing, setEditing] = useState<Editing>(null);
  const [archiving, setArchiving] = useState<CustomField | null>(null);
  // While dragging: the order shown, and the field being moved.
  const [dragOrder, setDragOrder] = useState<CustomField[] | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());

  // While a field is dragged, the pointer's height decides where it goes: before the first row
  // whose middle is below the pointer.
  useEffect(() => {
    if (!draggedId) return;
    const over = (event: globalThis.DragEvent) => {
      event.preventDefault();
      setDragOrder((order) => {
        const moved = order?.find((field) => field.id === draggedId);
        if (!order || !moved) return order;
        const others = order.filter((field) => field.id !== draggedId);
        const before = others.findIndex((field) => {
          const box = rows.current.get(field.id)?.getBoundingClientRect();
          return box !== undefined && event.clientY < box.top + box.height / 2;
        });
        others.splice(before === -1 ? others.length : before, 0, moved);
        return others.every((field, at) => field.id === order[at]?.id) ? order : others;
      });
    };
    const drop = (event: globalThis.DragEvent) => {
      event.preventDefault();
    };
    document.addEventListener('dragover', over);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragover', over);
      document.removeEventListener('drop', drop);
    };
  }, [draggedId]);
  const record = recordTab(recordType);

  const show = (result: CustomFieldList) => {
    queryClient.setQueryData(queryKey, result);
  };
  const failed = (failure: unknown) => {
    toast({ tone: 'danger', message: formError(failure) });
    void queryClient.invalidateQueries({ queryKey });
  };

  const archive = usePostApiV1CustomFieldsFieldIdArchive({
    mutation: {
      onSuccess: (result) => {
        show(result);
        setArchiving(null);
        toast({ tone: 'success', message: 'Field archived. Saved values are kept.' });
      },
      onError: (failure) => {
        setArchiving(null);
        failed(failure);
      },
    },
  });
  const restore = usePostApiV1CustomFieldsFieldIdRestore({
    mutation: {
      onSuccess: (result) => {
        show(result);
        toast({ tone: 'success', message: 'Field restored at the end of the list.' });
      },
      onError: failed,
    },
  });
  const reorder = usePutApiV1CustomFieldsOrder({
    mutation: {
      onSuccess: (result) => {
        show(result);
        setDragOrder(null);
      },
      onError: (failure) => {
        setDragOrder(null);
        failed(failure);
      },
    },
  });

  if (list.isPending) {
    return (
      <div role="status" aria-label="Loading fields" className="flex flex-col gap-3 pt-4">
        {[1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (list.isError) {
    return (
      <div className="pt-4">
        <ErrorState
          what="fields"
          retrying={list.isFetching}
          onRetry={() => {
            void list.refetch();
          }}
        />
      </div>
    );
  }

  const active = list.data.fields.filter((field) => !field.archived);
  const archived = list.data.fields.filter((field) => field.archived);
  const shown = dragOrder ?? active;
  const full = active.length >= MAX_ACTIVE_FIELDS;

  const saveOrder = (order: CustomField[]) => {
    setDragOrder(order);
    reorder.mutate({ data: { recordType, fieldIds: order.map((field) => field.id) } });
  };
  const moveTo = (from: number, to: number) => {
    const order = [...active];
    const [field] = order.splice(from, 1);
    if (!field) return;
    order.splice(to, 0, field);
    saveOrder(order);
  };

  // Built-in fields come from the API, which also enforces them.
  const standard = list.data.standardFields;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <div>
          <h2 className="text-sm font-bold text-ink">Your fields</h2>
          <p className="text-xs text-ink-muted">
            {String(active.length)} of {String(MAX_ACTIVE_FIELDS)} fields · Shown on{' '}
            {record.singular} forms in this order.
          </p>
        </div>
        <Button
          icon={<Plus aria-hidden />}
          disabled={full}
          title={full ? 'Archive a field to add another.' : undefined}
          onClick={() => {
            setEditing({});
          }}
        >
          Add field
        </Button>
      </div>

      {active.length === 0 ? (
        <div className="py-4">
          <EmptyState
            icon={ListPlus}
            title={`No custom ${record.singular} fields yet`}
            description={`Add fields to record what your team needs on every ${record.singular}, for example a plan, an employee ID or a renewal date.`}
          />
        </div>
      ) : (
        <ul aria-label={`${record.label} fields`} className="mt-2 divide-y divide-border">
          {shown.map((field, index) => (
            <FieldRow
              key={field.id}
              field={field}
              index={index}
              count={shown.length}
              dragging={draggedId === field.id}
              rowRef={(node) => {
                if (node) rows.current.set(field.id, node);
                else rows.current.delete(field.id);
              }}
              onEdit={() => {
                setEditing({ field });
              }}
              onMove={(to) => {
                moveTo(index, to);
              }}
              onArchive={() => {
                setArchiving(field);
              }}
              drag={{
                onDragStart: () => {
                  setDraggedId(field.id);
                  setDragOrder(active);
                },
                onDragEnd: () => {
                  setDraggedId(null);
                  const changed = shown.some((item, at) => item.id !== active[at]?.id);
                  if (changed) saveOrder(shown);
                  else setDragOrder(null);
                },
              }}
            />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="mt-4 border-t border-border pt-4 pb-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
            <Archive aria-hidden className="size-4 text-ink-muted" />
            Archived
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Hidden from forms. Values already saved stay on records.
          </p>
          <ul aria-label="Archived fields" className="mt-2 divide-y divide-border">
            {archived.map((field) => (
              <li key={field.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ink-muted">{field.label}</p>
                  <p className="truncate text-xs text-ink-subtle">{TYPE_NAMES[field.type]}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={full}
                  title={full ? 'Archive a field to restore this one.' : undefined}
                  aria-label={`Restore ${field.label}`}
                  onClick={() => {
                    restore.mutate({ fieldId: field.id });
                  }}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && (
        <FieldDrawer
          recordType={recordType}
          field={editing.field}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={(result, message) => {
            show(result);
            setEditing(null);
            toast({ tone: 'success', message });
          }}
        />
      )}
      {archiving && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setArchiving(null);
          }}
          pending={archive.isPending}
          title={`Archive "${archiving.label}"?`}
          description="It's hidden from forms and can't be changed on records. Values already saved stay, and you can restore it any time."
          confirmLabel="Archive field"
          onConfirm={() => {
            archive.mutate({ fieldId: archiving.id });
          }}
        />
      )}
      {/* Your fields first; the built-in ones fold away below (Step 5b). */}
      {standard.length > 0 && (
        <details className="group mt-4 border-t border-border pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-sm">
            <ChevronRight
              aria-hidden
              className="size-4 text-ink-subtle transition-transform group-open:rotate-90"
            />
            <span className="font-bold text-ink">Standard fields</span>
            <span className="text-xs text-ink-muted">
              {String(standard.length)} built in · always on the {record.singular} form · can&apos;t
              be changed
            </span>
          </summary>
          <ul
            aria-label={`Standard ${record.singular} fields`}
            className="mt-1 divide-y divide-border"
          >
            {standard.map((item) => (
              <li key={item.key} className="flex items-center gap-3 py-2.5">
                <Lock aria-hidden className="hidden size-4 text-ink-subtle sm:block" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{item.label}</p>
                  <p className="truncate text-xs text-ink-muted">{item.description}</p>
                </div>
                {item.rule && <Badge tone="brand">{item.rule}</Badge>}
                <Badge>Standard</Badge>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** Settings → Fields (admins): custom fields for tickets, contacts and companies. */
export function CustomFieldsPage() {
  const me = useSession();
  const [params, setParams] = useSearchParams();
  const chosen = recordTab(params.get('for'));
  const header = (
    <PageHeader title="Fields" breadcrumbs={[{ label: 'Settings' }, { label: 'Fields' }]} />
  );

  if (!can(me, 'settings.manage')) {
    return (
      <>
        {header}
        <NoAccessState
          area="field settings"
          explanation={`Only admins can change the fields of ${me.workspace.name}.`}
        />
      </>
    );
  }

  return (
    <>
      {header}
      <section className="rounded-xl border border-border bg-surface px-5 pt-3 pb-2">
        <Tabs.Root
          value={chosen.value}
          onValueChange={(value) => {
            setParams(value === 'ticket' ? {} : { for: value }, { replace: true });
          }}
        >
          <Tabs.List aria-label="Record type" className="flex gap-1 border-b border-border">
            {RECORD_TABS.map((tab) => (
              <Tabs.Trigger
                key={tab.value}
                value={tab.value}
                className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-focus focus-visible:outline-none data-[state=active]:border-brand-600 data-[state=active]:text-ink"
              >
                {tab.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {RECORD_TABS.map((tab) => (
            <Tabs.Content key={tab.value} value={tab.value} className="outline-none">
              <FieldsTab recordType={tab.value} />
            </Tabs.Content>
          ))}
        </Tabs.Root>
      </section>
    </>
  );
}
