import { useState, type SyntheticEvent } from 'react';
import type { SavedView } from '../../api/generated/model';
import {
  usePatchApiV1TicketViewsViewId,
  usePostApiV1TicketViews,
} from '../../api/generated/tickets/tickets';
import { Button } from '../../components/Button';
import { CheckboxField } from '../../components/CheckboxField';
import { Drawer } from '../../components/Drawer';
import { TextField } from '../../components/TextField';
import { problemsFrom, type FormProblems } from '../contacts/directory';
import type { Filters, Sort } from './ticket-filters';

interface SaveViewDrawerProps {
  /** The view to rename or re-share; leave out to save the current filters as a new view. */
  view?: SavedView | undefined;
  filters: Filters;
  sort: Sort;
  /** The person may share views with everyone (admins and supervisors). */
  canShare: boolean;
  onClose: () => void;
  onSaved: (view: SavedView, message: string) => void;
}

/** Save the list's current filters and sort as a view, or rename or share a saved one. */
export function SaveViewDrawer({
  view,
  filters,
  sort,
  canShare,
  onClose,
  onSaved,
}: SaveViewDrawerProps) {
  const [name, setName] = useState(view?.name ?? '');
  const [shared, setShared] = useState(view?.shared ?? false);
  const [problems, setProblems] = useState<FormProblems>({ fields: {} });
  const handlers = (message: string) => ({
    onSuccess: (saved: SavedView) => {
      onSaved(saved, message);
    },
    onError: (failure: unknown) => {
      setProblems(problemsFrom(failure));
    },
  });
  const create = usePostApiV1TicketViews({ mutation: handlers('View saved.') });
  const update = usePatchApiV1TicketViewsViewId({ mutation: handlers('View updated.') });

  const submit = (event?: SyntheticEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!name.trim()) {
      setProblems({ fields: { name: 'Enter a name.' } });
      return;
    }
    if (view) {
      update.mutate({
        viewId: view.id,
        data: { name: name.trim(), ...(shared !== view.shared ? { shared } : {}) },
      });
    } else {
      create.mutate({ data: { name: name.trim(), filters, sort, shared } });
    }
  };

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={view ? `Edit ${view.name}` : 'Save view'}
      {...(view
        ? {}
        : {
            description:
              'Saves the current filters and order, so you can come back to them in one click.',
          })}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={create.isPending || update.isPending}
            onClick={() => {
              submit();
            }}
          >
            {view ? 'Save' : 'Save view'}
          </Button>
        </div>
      }
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        {problems.form && (
          <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {problems.form}
          </p>
        )}
        <TextField
          label="Name"
          required
          maxLength={60}
          placeholder="Urgent billing"
          value={name}
          error={problems.fields.name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        {canShare && (
          <CheckboxField
            checked={shared}
            onChange={(event) => {
              setShared(event.target.checked);
            }}
          >
            Share with everyone in the workspace
          </CheckboxField>
        )}
      </form>
    </Drawer>
  );
}
