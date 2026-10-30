import { useRef, useState, type SyntheticEvent } from 'react';
import {
  usePatchApiV1CannedResponsesCannedResponseId,
  usePostApiV1CannedResponses,
} from '../../api/generated/canned-responses/canned-responses';
import type { CannedResponse, Placeholder } from '../../api/generated/model';
import { Button } from '../../components/Button';
import { CheckboxField } from '../../components/CheckboxField';
import { Drawer } from '../../components/Drawer';
import { SelectField } from '../../components/SelectField';
import { TextAreaField } from '../../components/TextAreaField';
import { TextField } from '../../components/TextField';
import { problemsFrom, type FormProblems } from '../contacts/directory';
import { can, useSession } from '../workspace/session-context';

interface Draft {
  title: string;
  body: string;
  shared: boolean;
}

interface CannedResponseDrawerProps {
  /** The one to change; leave out to add one. */
  cannedResponse?: CannedResponse | undefined;
  placeholders: Placeholder[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Add or edit a canned response: title, text with placeholders, and sharing. Mount it only while open. */
export function CannedResponseDrawer({
  cannedResponse,
  placeholders,
  onClose,
  onSaved,
}: CannedResponseDrawerProps) {
  const me = useSession();
  const managesShared = can(me, 'canned_responses.manage_shared');
  const [draft, setDraft] = useState<Draft>(() => ({
    title: cannedResponse?.title ?? '',
    body: cannedResponse?.body ?? '',
    shared: cannedResponse?.shared ?? false,
  }));
  const [problems, setProblems] = useState<FormProblems>({ fields: {} });
  const text = useRef<HTMLTextAreaElement>(null);
  const editing = cannedResponse !== undefined;

  const handlers = (message: (saved: CannedResponse) => string) => ({
    onSuccess: (saved: CannedResponse) => {
      onSaved(message(saved));
    },
    onError: (failure: unknown) => {
      setProblems(problemsFrom(failure));
    },
  });
  const create = usePostApiV1CannedResponses({
    mutation: handlers((saved) => `Canned response ${saved.title} added.`),
  });
  const update = usePatchApiV1CannedResponsesCannedResponseId({
    mutation: handlers((saved) => `Canned response ${saved.title} saved.`),
  });

  const change = (next: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...next }));
  };

  /** Puts {{key}} where the cursor is in the text (at the end when the text was not focused). */
  const insertPlaceholder = (key: string) => {
    const tag = `{{${key}}}`;
    const box = text.current;
    const at = box ? box.selectionStart : draft.body.length;
    const end = box ? box.selectionEnd : draft.body.length;
    change({ body: draft.body.slice(0, at) + tag + draft.body.slice(end) });
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(at + tag.length, at + tag.length);
    });
  };

  const submit = (event?: SyntheticEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const fields: Record<string, string> = {};
    if (!draft.title.trim()) fields.title = 'Enter a title.';
    if (!draft.body.trim()) fields.body = 'Enter the text.';
    if (Object.keys(fields).length > 0) {
      setProblems({ fields });
      return;
    }
    setProblems({ fields: {} });
    const data = {
      title: draft.title.trim(),
      body: draft.body.trim(),
      ...(managesShared ? { shared: draft.shared } : {}),
    };
    if (cannedResponse) update.mutate({ cannedResponseId: cannedResponse.id, data });
    else create.mutate({ data });
  };

  return (
    <Drawer
      open
      width="lg"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={editing ? `Edit ${cannedResponse.title}` : 'New canned response'}
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
            {editing ? 'Save' : 'Add canned response'}
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
          label="Title"
          required
          maxLength={80}
          autoComplete="off"
          placeholder="Password reset steps"
          value={draft.title}
          error={problems.fields.title}
          hint="What agents search for in the reply box."
          onChange={(event) => {
            change({ title: event.target.value });
          }}
        />
        <TextAreaField
          ref={text}
          label="Text"
          required
          rows={10}
          maxLength={5000}
          value={draft.body}
          error={problems.fields.body}
          hint="Plain text. Placeholders such as {{contact.first_name}} are filled in for the ticket."
          onChange={(event) => {
            change({ body: event.target.value });
          }}
        />
        <div className="sm:w-72">
          <SelectField
            label="Insert a placeholder"
            value=""
            options={[
              { value: '', label: 'Choose…' },
              ...placeholders.map((placeholder) => ({
                value: placeholder.key,
                label: placeholder.label,
              })),
            ]}
            onChange={(event) => {
              if (event.target.value) insertPlaceholder(event.target.value);
            }}
          />
        </div>
        {managesShared ? (
          <CheckboxField
            checked={draft.shared}
            onChange={(event) => {
              change({ shared: event.target.checked });
            }}
          >
            Share with everyone in {me.workspace.name}
          </CheckboxField>
        ) : (
          <p className="text-xs text-ink-muted">
            Only you see this one. Admins and supervisors add the shared ones.
          </p>
        )}
      </form>
    </Drawer>
  );
}
