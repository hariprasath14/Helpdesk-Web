import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { CustomField, Me } from '../../api/generated/model';
import { apiError, me, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';
import { CustomFieldInput } from './CustomFieldInput';
import type { FieldShape } from './field-types';

const field = (overrides: Partial<CustomField>): CustomField => ({
  id: 'f1',
  recordType: 'ticket',
  key: 'employee_id',
  label: 'Employee ID',
  helpText: null,
  type: 'text',
  required: 'never',
  archived: false,
  position: 0,
  checkboxDefault: null,
  choices: [],
  ...overrides,
});

const FIELDS: CustomField[] = [
  field({ id: 'f1', required: 'always' }),
  field({
    id: 'f2',
    key: 'plan',
    label: 'Plan',
    type: 'dropdown',
    required: 'on_resolve',
    position: 1,
    choices: [
      { id: 'c1', label: 'Basic', removed: false, isDefault: false },
      { id: 'c2', label: 'Premium', removed: false, isDefault: true },
      { id: 'c3', label: 'Legacy', removed: true, isDefault: false },
    ],
  }),
  field({ id: 'f3', key: 'old_code', label: 'Old code', archived: true, position: 2 }),
];

const CONTACT_STANDARD = [
  { key: 'name', label: 'Name', description: 'Text', rule: 'Required' },
  { key: 'email', label: 'Email', description: 'Email', rule: 'Email or phone required' },
  { key: 'phone', label: 'Phone', description: 'Phone number', rule: 'Email or phone required' },
  { key: 'note', label: 'Note', description: 'Paragraph', rule: null },
];

/** A small in-memory API: every change returns the record type's list, like the real one. */
function fieldsApi(session: Me = me, start: CustomField[] = FIELDS) {
  let fields = [...start];
  const calls: { method: string; url: string; body: unknown }[] = [];
  const listFor = (recordType: string | null) => ({
    standardFields: recordType === 'contact' ? CONTACT_STANDARD : [],
    fields: fields.filter((item) => item.recordType === recordType),
  });
  const record = async (request: Request) => {
    const body = request.headers.get('content-type')?.includes('json')
      ? ((await request.json()) as Record<string, unknown>)
      : null;
    calls.push({ method: request.method, url: new URL(request.url).pathname, body });
    return body;
  };
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(session)),
    http.get(apiUrl('/api/v1/custom-fields'), ({ request }) =>
      HttpResponse.json(listFor(new URL(request.url).searchParams.get('recordType'))),
    ),
    http.post(apiUrl('/api/v1/custom-fields'), async ({ request }) => {
      const body = (await record(request)) as {
        recordType: CustomField['recordType'];
        label: string;
        type: CustomField['type'];
        required: CustomField['required'];
        choices?: { label: string; isDefault?: boolean }[];
      };
      fields.push(
        field({
          id: `new-${String(fields.length)}`,
          recordType: body.recordType,
          key: body.label.toLowerCase().replace(/\W+/g, '_'),
          label: body.label,
          type: body.type,
          required: body.required,
          position: fields.length,
          choices: (body.choices ?? []).map((choice, index) => ({
            id: `nc${String(index)}`,
            label: choice.label,
            removed: false,
            isDefault: choice.isDefault ?? false,
          })),
        }),
      );
      return HttpResponse.json(listFor(body.recordType));
    }),
    http.patch(apiUrl('/api/v1/custom-fields/:id'), async ({ request, params }) => {
      const body = (await record(request)) as Partial<CustomField>;
      fields = fields.map((item) =>
        item.id === params.id && body.label ? { ...item, label: body.label } : item,
      );
      return HttpResponse.json(listFor('ticket'));
    }),
    http.post(apiUrl('/api/v1/custom-fields/:id/:action'), async ({ request, params }) => {
      await record(request);
      fields = fields.map((item) =>
        item.id === params.id ? { ...item, archived: params.action === 'archive' } : item,
      );
      return HttpResponse.json(listFor('ticket'));
    }),
    http.put(apiUrl('/api/v1/custom-fields/order'), async ({ request }) => {
      const body = (await record(request)) as { fieldIds: string[] };
      fields = [
        ...body.fieldIds.flatMap((id) => fields.filter((item) => item.id === id)),
        ...fields.filter((item) => !body.fieldIds.includes(item.id)),
      ];
      return HttpResponse.json(listFor('ticket'));
    }),
  );
  return calls;
}

const fieldRow = (label: string) => {
  const list = screen.getByRole('list', { name: 'Tickets fields' });
  const item = within(list)
    .getAllByRole('listitem')
    .find((li) => within(li).queryByRole('button', { name: label }));
  if (!item) throw new Error(`no row for ${label}`);
  return item;
};

describe('fields settings page', () => {
  it('lists active fields in order with type, key and rule, and archived ones apart', async () => {
    fieldsApi();
    renderRoute('/settings/fields', { host: WORKSPACE });

    expect(await screen.findByRole('heading', { name: 'Fields' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /Standard/ })).not.toBeInTheDocument();
    expect(await screen.findByText(/2 of 50 fields/)).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'Tickets fields' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((li) => within(li).getAllByRole('button')[0]?.textContent)).toEqual([
      'Employee ID',
      'Plan',
    ]);
    expect(within(fieldRow('Employee ID')).getByText('Required')).toBeInTheDocument();
    expect(within(fieldRow('Plan')).getByText('Required when resolving')).toBeInTheDocument();
    expect(within(fieldRow('Plan')).getByText(/Dropdown · 2 choices/)).toBeInTheDocument();
    expect(within(fieldRow('Plan')).getByText('plan')).toBeInTheDocument();
    const archived = screen.getByRole('list', { name: 'Archived fields' });
    expect(within(archived).getByText('Old code')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fields' })).toHaveAttribute('aria-current', 'page');
  });

  it('switches to contacts, which start empty and have no "when resolving" rule', async () => {
    fieldsApi();
    const user = userEvent.setup();
    renderRoute('/settings/fields', { host: WORKSPACE });
    await user.click(await screen.findByRole('tab', { name: 'Contacts' }));
    expect(await screen.findByText('No custom contact fields yet')).toBeInTheDocument();
    const standard = screen.getByRole('list', { name: 'Standard contact fields' });
    expect(
      within(standard)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('p')?.textContent),
    ).toEqual(['Name', 'Email', 'Phone', 'Note']);
    expect(within(standard).getAllByText('Email or phone required')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Your fields' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add field' }));
    const drawer = await screen.findByRole('dialog', { name: 'Add a contact field' });
    expect(within(drawer).getByRole('radio', { name: /Required\b/ })).toBeInTheDocument();
    expect(
      within(drawer).queryByRole('radio', { name: /Required when resolving/ }),
    ).not.toBeInTheDocument();
  });

  it('adds a dropdown field with choices, a default and a live preview', async () => {
    const calls = fieldsApi();
    const user = userEvent.setup();
    renderRoute('/settings/fields', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Add field' }));
    const drawer = await screen.findByRole('dialog', { name: 'Add a ticket field' });

    await user.click(within(drawer).getByRole('button', { name: 'Add field' }));
    expect(within(drawer).getByText('Enter a label.')).toBeInTheDocument();

    await user.type(within(drawer).getByLabelText(/^Label/), 'Root cause');
    await user.selectOptions(within(drawer).getByLabelText('Type'), 'dropdown');
    await user.type(within(drawer).getByLabelText('Choice 1'), 'Bug{Enter}');
    expect(within(drawer).getByLabelText('Choice 2')).toHaveFocus();
    await user.keyboard('Question');
    await user.click(within(drawer).getByLabelText('Default for choice 2'));
    await user.click(within(drawer).getByRole('radio', { name: /Required when resolving/ }));

    const preview = within(drawer).getByRole('region', { name: 'Preview' });
    const select = within(preview).getByLabelText(/Root cause/);
    expect(select).toHaveDisplayValue('Question');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Choose…', 'Bug', 'Question']);

    await user.click(within(drawer).getByRole('button', { name: 'Add field' }));
    expect(await screen.findByText('Field added.')).toBeInTheDocument();
    expect(calls).toContainEqual({
      method: 'POST',
      url: '/api/v1/custom-fields',
      body: {
        recordType: 'ticket',
        label: 'Root cause',
        type: 'dropdown',
        required: 'on_resolve',
        choices: [
          { label: 'Bug', isDefault: false },
          { label: 'Question', isDefault: true },
        ],
      },
    });
    expect(fieldRow('Root cause')).toBeInTheDocument();
  });

  it('refuses a blank choice before sending, and shows the API message for a duplicate', async () => {
    const calls = fieldsApi();
    server.use(
      http.post(apiUrl('/api/v1/custom-fields'), () =>
        apiError(400, 'VALIDATION_FAILED', 'Check the choices.', {
          fields: [{ field: 'choices.1', message: 'This choice is already in the list.' }],
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/settings/fields', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Add field' }));
    const drawer = await screen.findByRole('dialog', { name: 'Add a ticket field' });
    await user.type(within(drawer).getByLabelText(/^Label/), 'Modules');
    await user.selectOptions(within(drawer).getByLabelText('Type'), 'multi_select');
    await user.type(within(drawer).getByLabelText('Choice 1'), 'HR{Enter}');
    await user.click(within(drawer).getByRole('button', { name: 'Add field' }));
    expect(within(drawer).getByText('Enter a choice.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    await user.type(within(drawer).getByLabelText('Choice 2'), 'hr');
    await user.click(within(drawer).getByRole('button', { name: 'Add field' }));
    expect(await within(drawer).findByText('This choice is already in the list.')).toBeVisible();
  });

  it('edits a field, sending only what changed; the type is locked and removed choices can come back', async () => {
    const calls = fieldsApi();
    const user = userEvent.setup();
    renderRoute('/settings/fields', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Plan' }));
    const drawer = await screen.findByRole('dialog', { name: 'Edit Plan' });

    expect(within(drawer).getByLabelText('Type')).toBeDisabled();
    expect(within(drawer).getByText('plan')).toBeInTheDocument();
    expect(within(drawer).getByLabelText('Choice 2')).toHaveValue('Premium');
    const removed = within(drawer).getByRole('list', { name: 'Removed choices' });
    expect(within(removed).getByText('Legacy')).toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', { name: 'Remove choice 1' }));
    expect(within(removed).getByText('Basic')).toBeInTheDocument();
    await user.click(within(removed).getByRole('button', { name: 'Bring back Legacy' }));
    await user.clear(within(drawer).getByLabelText(/^Label/));
    await user.type(within(drawer).getByLabelText(/^Label/), 'Plan name');
    await user.click(within(drawer).getByRole('button', { name: 'Save field' }));

    expect(await screen.findByText('Field saved.')).toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'PATCH',
        url: '/api/v1/custom-fields/f2',
        body: {
          label: 'Plan name',
          choices: [
            { id: 'c2', label: 'Premium', isDefault: true },
            { id: 'c3', label: 'Legacy', isDefault: false },
          ],
        },
      },
    ]);
  });

  it('closes without a request when nothing changed', async () => {
    const calls = fieldsApi();
    const user = userEvent.setup();
    renderRoute('/settings/fields', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Employee ID' }));
    const drawer = await screen.findByRole('dialog', { name: 'Edit Employee ID' });
    await user.click(within(drawer).getByRole('button', { name: 'Save field' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(calls).toHaveLength(0);
  });

  it('moves, archives (after asking) and restores fields', async () => {
    const calls = fieldsApi();
    const user = userEvent.setup();
    renderRoute('/settings/fields', { host: WORKSPACE });

    await user.click(await screen.findByRole('button', { name: 'Actions for Employee ID' }));
    expect(screen.queryByRole('menuitem', { name: 'Move up' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }));
    await waitFor(() => {
      expect(calls).toContainEqual({
        method: 'PUT',
        url: '/api/v1/custom-fields/order',
        body: { recordType: 'ticket', fieldIds: ['f2', 'f1'] },
      });
    });

    await user.click(screen.getByRole('button', { name: 'Actions for Plan' }));
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Archive "Plan"?' });
    await user.click(within(dialog).getByRole('button', { name: 'Archive field' }));
    expect(await screen.findByText('Field archived. Saved values are kept.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Archived fields' })).getByText('Plan'),
    ).toBeInTheDocument();

    const archived = screen.getByRole('list', { name: 'Archived fields' });
    await user.click(within(archived).getByRole('button', { name: 'Restore Old code' }));
    expect(await screen.findByText('Field restored at the end of the list.')).toBeInTheDocument();
    expect(fieldRow('Old code')).toBeInTheDocument();
  });

  it('shows the 50-field limit and tells the admin when the list changed meanwhile', async () => {
    const many = Array.from({ length: 50 }, (_, n) =>
      field({ id: `m${String(n)}`, key: `f_${String(n)}`, label: `Field ${String(n)}` }),
    );
    fieldsApi(me, many);
    server.use(
      http.put(apiUrl('/api/v1/custom-fields/order'), () =>
        apiError(409, 'CONFLICT', 'The list of fields has changed. Reload and try again.'),
      ),
    );
    const user = userEvent.setup();
    renderRoute('/settings/fields', { host: WORKSPACE });
    expect(await screen.findByText(/50 of 50 fields/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add field' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Actions for Field 0' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move down' }));
    expect(
      await screen.findByText('The list of fields has changed. Reload and try again.'),
    ).toBeInTheDocument();
  });

  it('is for admins only', async () => {
    fieldsApi({ ...me, role: 'supervisor', isOwner: false, permissions: ['members.view'] });
    renderRoute('/settings/fields', { host: WORKSPACE });
    expect(await screen.findByText(/Only admins can change the fields/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Fields' })).not.toBeInTheDocument();
  });
});

function Harness({ field: shape, start = null }: { field: FieldShape; start?: unknown }) {
  const [value, setValue] = useState<unknown>(start);
  return (
    <>
      <CustomFieldInput field={shape} value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

const shape = (overrides: Partial<FieldShape>): FieldShape => ({
  label: 'Value',
  helpText: null,
  type: 'text',
  required: 'never',
  choices: [],
  ...overrides,
});
const stored = () => screen.getByTestId('value').textContent;

describe('custom field input', () => {
  it('keeps typed number text while passing numbers up, and clears to null', async () => {
    const user = userEvent.setup();
    render(<Harness field={shape({ type: 'decimal', helpText: 'In rupees' })} />);
    const input = screen.getByLabelText('Value');
    expect(screen.getByText('In rupees')).toBeInTheDocument();
    await user.type(input, '1.');
    expect(input).toHaveValue('1.');
    expect(stored()).toBe('1');
    await user.type(input, '5');
    expect(stored()).toBe('1.5');
    await user.type(input, 'x');
    expect(stored()).toBe('"1.5x"');
    await user.clear(input);
    expect(stored()).toBe('null');
  });

  it('offers removed choices only when the record already has them', async () => {
    const choices = [
      { id: 'a', label: 'HR', removed: false, isDefault: false },
      { id: 'b', label: 'Old', removed: true, isDefault: false },
    ];
    const user = userEvent.setup();
    const { unmount } = render(
      <Harness field={shape({ type: 'multi_select', choices })} start={['b']} />,
    );
    expect(screen.getByLabelText('Old (removed)')).toBeChecked();
    await user.click(screen.getByLabelText('HR'));
    expect(stored()).toBe('["b","a"]');
    await user.click(screen.getByLabelText('Old (removed)'));
    await user.click(screen.getByLabelText('HR'));
    expect(stored()).toBe('null');
    unmount();

    render(<Harness field={shape({ type: 'dropdown', choices, required: 'always' })} />);
    expect(screen.queryByRole('option', { name: /Old/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Value/)).toBeRequired();
  });

  it('draws paragraph, date and checkbox fields', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness field={shape({ type: 'checkbox', label: 'VIP' })} />);
    await user.click(screen.getByLabelText('VIP'));
    expect(stored()).toBe('true');
    unmount();
    const second = render(<Harness field={shape({ type: 'paragraph' })} />);
    await user.type(screen.getByLabelText('Value'), 'Line{Enter}two');
    expect(stored()).toBe('"Line\\ntwo"');
    second.unmount();
    render(<Harness field={shape({ type: 'date' })} start="2026-10-25" />);
    expect(screen.getByLabelText('Value')).toHaveValue('2026-10-25');
  });
});
