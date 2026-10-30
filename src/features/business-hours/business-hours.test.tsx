import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { BusinessHours, Me, UpdateBusinessHoursRequestInput } from '../../api/generated/model';
import { apiError, me, WORKSPACE } from '../../test/fixtures';
import { renderRoute } from '../../test/render';
import { apiUrl, server } from '../../test/server';
import { formatDay, timeZones, todayInZone } from './dates';

const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
const HOURS: BusinessHours = {
  timeZone: 'Asia/Kolkata',
  alwaysOpen: false,
  days: DAYS.map((day, index) => ({ day, open: index < 5, start: '09:00', end: '18:00' })),
  holidays: [
    { id: 'h0', date: '2020-01-26', name: 'Republic Day' },
    { id: 'h1', date: '2099-12-25', name: 'Christmas' },
  ],
  openNow: true,
  saved: true,
};

function hoursApi({ session = me, hours = HOURS }: { session?: Me; hours?: BusinessHours } = {}) {
  let current = hours;
  const saved: UpdateBusinessHoursRequestInput[] = [];
  server.use(
    http.get(apiUrl('/api/v1/me'), () => HttpResponse.json(session)),
    http.get(apiUrl('/api/v1/workspace/business-hours'), () => HttpResponse.json(current)),
    http.put(apiUrl('/api/v1/workspace/business-hours'), async ({ request }) => {
      const body = (await request.json()) as UpdateBusinessHoursRequestInput;
      saved.push(body);
      if (body.days[0]?.open && body.days[0].start === '07:00') {
        return apiError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
          fields: [{ field: 'days.0.end', message: 'End after the start time.' }],
        });
      }
      current = { ...current, ...body, openNow: false, saved: true };
      return HttpResponse.json(current);
    }),
    http.post(apiUrl('/api/v1/workspace/holidays'), async ({ request }) => {
      const body = (await request.json()) as { date: string; name: string };
      if (body.date === '2099-12-25') {
        return apiError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', {
          fields: [{ field: 'date', message: 'This day is already a holiday: Christmas.' }],
        });
      }
      current = {
        ...current,
        holidays: [...current.holidays, { id: 'h2', ...body }].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
      };
      return HttpResponse.json(current);
    }),
    http.delete(apiUrl('/api/v1/workspace/holidays/:id'), ({ params }) => {
      current = {
        ...current,
        holidays: current.holidays.filter((holiday) => holiday.id !== params.id),
      };
      return HttpResponse.json(current);
    }),
  );
  return { saved };
}

describe('Settings → Business hours', () => {
  it('lets a new workspace confirm the default hours as they are', async () => {
    const { saved } = hoursApi({ hours: { ...HOURS, saved: false } });
    const user = userEvent.setup();
    renderRoute('/settings/business-hours', { host: WORKSPACE });
    await user.click(await screen.findByRole('button', { name: 'Save business hours' }));
    expect(await screen.findByText('Business hours saved.')).toBeInTheDocument();
    expect(saved[0]?.days).toEqual(HOURS.days);
    // Saved once, the button waits for a change again.
    expect(screen.getByRole('button', { name: 'Save business hours' })).toBeDisabled();
  });

  it('saves the working days, times and time zone', async () => {
    const { saved } = hoursApi();
    const user = userEvent.setup();
    renderRoute('/settings/business-hours', { host: WORKSPACE });
    expect(await screen.findByText('Working time now')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save business hours' });
    expect(save).toBeDisabled();
    const days = screen.getByRole('list', { name: 'Working days' });
    expect(within(days).getAllByText('Closed')).toHaveLength(2);

    await user.click(screen.getByRole('checkbox', { name: 'Saturday' }));
    const from = screen.getByLabelText('Saturday from');
    await user.clear(from);
    await user.type(from, '10:00');
    const to = screen.getByLabelText('Saturday to');
    await user.clear(to);
    await user.type(to, '14:00');
    await user.click(screen.getByRole('checkbox', { name: 'Sunday' }));
    await user.clear(screen.getByLabelText('Sunday to'));
    await user.type(screen.getByLabelText('Sunday to'), '00:00');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Time zone' }), 'Asia/Dubai');
    await user.click(save);

    expect(await screen.findByText('Business hours saved.')).toBeInTheDocument();
    expect(saved[0]?.timeZone).toBe('Asia/Dubai');
    expect(saved[0]?.days[5]).toEqual({
      day: 'saturday',
      open: true,
      start: '10:00',
      end: '14:00',
    });
    // 00:00 as an end time is midnight.
    expect(saved[0]?.days[6]).toEqual({ day: 'sunday', open: true, start: '09:00', end: '24:00' });
    expect(screen.getByText('Outside working time now')).toBeInTheDocument();
    expect(screen.getByLabelText('Sunday to')).toHaveValue('00:00');
  });

  it('checks the times, and switches to 24×7', async () => {
    const { saved } = hoursApi();
    const user = userEvent.setup();
    renderRoute('/settings/business-hours', { host: WORKSPACE });
    const mondayTo = await screen.findByLabelText('Monday to');
    await user.clear(mondayTo);
    await user.type(mondayTo, '08:00');
    await user.click(screen.getByRole('button', { name: 'Save business hours' }));
    expect(screen.getByText('End after the start time.')).toBeInTheDocument();
    expect(saved).toEqual([]);

    // The API's own check shows on the day too.
    await user.clear(mondayTo);
    await user.type(mondayTo, '18:00');
    await user.clear(screen.getByLabelText('Monday from'));
    await user.type(screen.getByLabelText('Monday from'), '07:00');
    await user.click(screen.getByRole('button', { name: 'Save business hours' }));
    expect(await screen.findByText('End after the start time.')).toBeInTheDocument();

    for (const day of DAYS.slice(0, 5)) {
      await user.click(
        screen.getByRole('checkbox', { name: day.charAt(0).toUpperCase() + day.slice(1) }),
      );
    }
    await user.click(screen.getByRole('button', { name: 'Save business hours' }));
    expect(screen.getByText('Choose at least one working day, or 24×7.')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /24 hours, 7 days/ }));
    expect(screen.queryByRole('list', { name: 'Working days' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save business hours' }));
    expect(await screen.findByText('Business hours saved.')).toBeInTheDocument();
    expect(saved.at(-1)?.alwaysOpen).toBe(true);
    expect(screen.getByText(/With 24×7 hours they don’t apply/)).toBeInTheDocument();
  });

  it('adds and removes holidays, with past ones tucked away', async () => {
    hoursApi();
    const user = userEvent.setup();
    renderRoute('/settings/business-hours', { host: WORKSPACE });
    const upcoming = await screen.findByRole('list', { name: 'Upcoming holidays' });
    expect(within(upcoming).getByText('Christmas')).toBeInTheDocument();
    expect(screen.getByText('Past holidays (1)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add holiday' }));
    expect(screen.getByText('Choose a date.')).toBeInTheDocument();
    expect(screen.getByText('Enter a name.')).toBeInTheDocument();

    const form = screen.getByRole('form', { name: 'Add a holiday' });
    await user.type(within(form).getByLabelText(/Date/), '2099-12-25');
    await user.type(within(form).getByRole('textbox', { name: /Name/ }), 'Again');
    await user.click(screen.getByRole('button', { name: 'Add holiday' }));
    expect(
      await screen.findByText('This day is already a holiday: Christmas.'),
    ).toBeInTheDocument();

    await user.clear(within(form).getByLabelText(/Date/));
    await user.type(within(form).getByLabelText(/Date/), '2099-11-08');
    await user.clear(within(form).getByRole('textbox', { name: /Name/ }));
    await user.type(within(form).getByRole('textbox', { name: /Name/ }), 'Diwali');
    await user.click(screen.getByRole('button', { name: 'Add holiday' }));
    expect(await screen.findByText('Holiday added.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Upcoming holidays' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([`Diwali${formatDay('2099-11-08')}`, `Christmas${formatDay('2099-12-25')}`]);

    await user.click(screen.getByRole('button', { name: 'Remove Christmas' }));
    expect(await screen.findByText('Christmas removed.')).toBeInTheDocument();
    expect(screen.queryByText('Christmas')).not.toBeInTheDocument();
  });

  it('is for admins only, and shows a retry when it cannot load', async () => {
    hoursApi({
      session: { ...me, role: 'supervisor', permissions: ['tickets.work', 'members.view'] },
    });
    renderRoute('/settings/business-hours', { host: WORKSPACE });
    expect(await screen.findByText(/Only admins can change business hours/)).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    hoursApi();
    server.use(
      http.get(apiUrl('/api/v1/workspace/business-hours'), () =>
        apiError(500, 'INTERNAL', 'Something went wrong.'),
      ),
    );
    renderRoute('/settings/business-hours', { host: WORKSPACE });
    expect(await screen.findByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});

describe('business hours dates', () => {
  it('formats days and knows today in a time zone', () => {
    expect(formatDay('2026-12-25')).toBe('Fri, 25 Dec 2026');
    expect(todayInZone('Asia/Kolkata', new Date('2026-10-28T20:00:00Z'))).toBe('2026-10-29');
    expect(timeZones('Mars/Olympus')[0]).toBe('Mars/Olympus');
    expect(timeZones('Asia/Dubai')).toContain('Asia/Dubai');
  });
});
