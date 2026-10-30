import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import {
  getGetApiV1WorkspaceBusinessHoursQueryKey,
  useDeleteApiV1WorkspaceHolidaysHolidayId,
  useGetApiV1WorkspaceBusinessHours,
  usePostApiV1WorkspaceHolidays,
  usePutApiV1WorkspaceBusinessHours,
} from '../../api/generated/business-hours/business-hours';
import type { BusinessDay, BusinessHours, Holiday } from '../../api/generated/model';
import { Badge } from '../../components/Badge';
import { Button, IconButton } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { SelectField } from '../../components/SelectField';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState, NoAccessState } from '../../components/StateMessage';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toast-context';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { cn } from '../../lib/cn';
import { Section } from '../account/Section';
import { apiFieldErrors, formError, type FieldErrors } from '../auth/api-errors';
import { useSession } from '../workspace/session-context';
import { formatDay, timeZones, todayInZone } from './dates';

/** The time inputs show midnight as 00:00; as an end time it means the end of the day (24:00). */
const toInput = (time: string) => (time === '24:00' ? '00:00' : time);
const fromInput = (time: string, end: boolean) => (end && time === '00:00' ? '24:00' : time);

const dayName = (day: string) => day.charAt(0).toUpperCase() + day.slice(1);

function useSaved() {
  const queryClient = useQueryClient();
  return (result: BusinessHours) => {
    queryClient.setQueryData(getGetApiV1WorkspaceBusinessHoursQueryKey(), result);
  };
}

const timeInput =
  'h-10 w-28 rounded-lg border bg-surface px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-brand-focus disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted';

function DayRow({
  day,
  error,
  onChange,
}: {
  day: BusinessDay;
  error?: string | undefined;
  onChange: (day: BusinessDay) => void;
}) {
  const name = dayName(day.day);
  const errorId = `hours-${day.day}-error`;
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex w-32 items-center gap-2.5 text-sm text-ink-body">
          <input
            type="checkbox"
            className="size-4 shrink-0 accent-brand-600"
            checked={day.open}
            onChange={(event) => {
              onChange({ ...day, open: event.target.checked });
            }}
          />
          {name}
        </label>
        {day.open ? (
          <div className="flex items-center gap-2">
            <input
              type="time"
              aria-label={`${name} from`}
              className={cn(timeInput, 'border-border-strong')}
              value={toInput(day.start)}
              onChange={(event) => {
                onChange({ ...day, start: event.target.value });
              }}
            />
            <span aria-hidden className="text-ink-muted">
              –
            </span>
            <input
              type="time"
              aria-label={`${name} to`}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className={cn(timeInput, error ? 'border-danger-text' : 'border-border-strong')}
              value={toInput(day.end)}
              onChange={(event) => {
                onChange({ ...day, end: fromInput(event.target.value, true) });
              }}
            />
          </div>
        ) : (
          <span className="text-sm text-ink-muted">Closed</span>
        )}
      </div>
      {error && (
        <p id={errorId} className="pl-6.5 text-xs text-danger-text">
          {error}
        </p>
      )}
    </li>
  );
}

function HoursSection({ hours }: { hours: BusinessHours }) {
  const saved = useSaved();
  const toast = useToast();
  const save = usePutApiV1WorkspaceBusinessHours();
  const [timeZone, setTimeZone] = useState(hours.timeZone);
  const [alwaysOpen, setAlwaysOpen] = useState(hours.alwaysOpen);
  const [days, setDays] = useState(hours.days);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string>();
  const edited =
    timeZone !== hours.timeZone ||
    alwaysOpen !== hours.alwaysOpen ||
    JSON.stringify(days) !== JSON.stringify(hours.days);
  // Until the hours are saved once, saving the defaults as they are is allowed (they are confirmed).
  const unchanged = hours.saved && !edited;

  const reset = () => {
    setErrors({});
    setGeneral(undefined);
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems: Record<string, string> = {};
    days.forEach((day, index) => {
      if (day.open && (!day.start || !day.end)) {
        problems[`days.${String(index)}.end`] = 'Enter both times.';
      } else if (day.open && day.end !== '24:00' && day.end <= day.start) {
        problems[`days.${String(index)}.end`] = 'End after the start time.';
      }
    });
    if (!alwaysOpen && !days.some((day) => day.open)) {
      problems.days = 'Choose at least one working day, or 24×7.';
    }
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      return;
    }
    const known = [
      'timeZone',
      'days',
      ...days.flatMap((_, index) => [`days.${String(index)}.start`, `days.${String(index)}.end`]),
    ];
    save.mutate(
      { data: { timeZone, alwaysOpen, days } },
      {
        onSuccess: (result) => {
          saved(result);
          setDays(result.days);
          toast({ tone: 'success', message: 'Business hours saved.' });
        },
        onError: (failure) => {
          const found: FieldErrors<string> = apiFieldErrors(failure, known);
          if (Object.keys(found).length > 0) {
            setErrors(
              Object.fromEntries(
                Object.entries(found).map(([key, message]) => [
                  key.replace(/\.start$/, '.end'),
                  message ?? '',
                ]),
              ),
            );
          } else setGeneral(formError(failure));
        },
      },
    );
  };

  const zones = timeZones(hours.timeZone);
  return (
    <Section
      title="Working hours"
      description="SLA clocks set to business hours count only these hours, in the workspace time zone. Changes apply to due times worked out from now on."
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <Badge tone={hours.openNow ? 'success' : 'neutral'} dot>
            {hours.openNow ? 'Working time now' : 'Outside working time now'}
          </Badge>
        </div>
        <SelectField
          label="Time zone"
          name="timeZone"
          hint="Also used for times shown across the workspace."
          error={errors.timeZone}
          value={timeZone}
          options={zones.map((zone) => ({ value: zone, label: zone.replaceAll('_', ' ') }))}
          onChange={(event) => {
            setTimeZone(event.target.value);
            reset();
          }}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-medium text-ink">Hours</legend>
          {[
            {
              value: true,
              label: '24 hours, 7 days',
              hint: 'Every hour counts; holidays don’t apply.',
            },
            {
              value: false,
              label: 'Set working days',
              hint: 'Choose the days and hours you work.',
            },
          ].map((option) => (
            <label key={option.label} className="flex items-start gap-2.5 text-sm text-ink-body">
              <input
                type="radio"
                name="alwaysOpen"
                className="mt-0.5 size-4 shrink-0 accent-brand-600"
                checked={alwaysOpen === option.value}
                onChange={() => {
                  setAlwaysOpen(option.value);
                  reset();
                }}
              />
              <span>
                {option.label}
                <span className="block text-xs text-ink-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {!alwaysOpen && (
          <div>
            <ul aria-label="Working days" className="divide-y divide-border">
              {days.map((day, index) => (
                <DayRow
                  key={day.day}
                  day={day}
                  error={errors[`days.${String(index)}.end`]}
                  onChange={(next) => {
                    setDays(days.map((item, at) => (at === index ? next : item)));
                    reset();
                  }}
                />
              ))}
            </ul>
            <p className="mt-1 text-xs text-ink-muted">An end time of 00:00 means midnight.</p>
            {errors.days && (
              <p role="alert" className="mt-2 text-xs text-danger-text">
                {errors.days}
              </p>
            )}
          </div>
        )}
        {general && (
          <p role="alert" className="text-sm text-danger-text">
            {general}
          </p>
        )}
        {edited && <UnsavedChangesGuard />}
        <Button type="submit" loading={save.isPending} disabled={unchanged} className="self-start">
          Save business hours
        </Button>
      </form>
    </Section>
  );
}

function HolidayRow({
  holiday,
  past,
  onRemove,
  removing,
}: {
  holiday: Holiday;
  past: boolean;
  onRemove: () => void;
  removing: boolean;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <div className={cn('min-w-0 flex-1', past && 'text-ink-muted')}>
        <p className="truncate text-sm font-medium">{holiday.name}</p>
        <p className="text-xs text-ink-muted">{formatDay(holiday.date)}</p>
      </div>
      <IconButton label={`Remove ${holiday.name}`} size="sm" disabled={removing} onClick={onRemove}>
        <Trash2 aria-hidden className="size-4" />
      </IconButton>
    </li>
  );
}

function HolidaysSection({ hours }: { hours: BusinessHours }) {
  const saved = useSaved();
  const toast = useToast();
  const add = usePostApiV1WorkspaceHolidays();
  const remove = useDeleteApiV1WorkspaceHolidaysHolidayId();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'date' | 'name'>>({});
  const [general, setGeneral] = useState<string>();
  const today = todayInZone(hours.timeZone);
  const upcoming = hours.holidays.filter((holiday) => holiday.date >= today);
  const past = hours.holidays.filter((holiday) => holiday.date < today).reverse();

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems: FieldErrors<'date' | 'name'> = {};
    if (!date) problems.date = 'Choose a date.';
    if (!name.trim()) problems.name = 'Enter a name.';
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      return;
    }
    add.mutate(
      { data: { date, name: name.trim() } },
      {
        onSuccess: (result) => {
          saved(result);
          setDate('');
          setName('');
          toast({ tone: 'success', message: 'Holiday added.' });
        },
        onError: (failure) => {
          const found = apiFieldErrors(failure, ['date', 'name'] as const);
          if (Object.keys(found).length > 0) setErrors(found);
          else setGeneral(formError(failure));
        },
      },
    );
  };

  const removeOne = (holiday: Holiday) => {
    remove.mutate(
      { holidayId: holiday.id },
      {
        onSuccess: (result) => {
          saved(result);
          toast({ tone: 'success', message: `${holiday.name} removed.` });
        },
        onError: (failure) => {
          toast({ tone: 'danger', message: formError(failure) });
        },
      },
    );
  };

  return (
    <Section
      title="Holidays"
      description={
        hours.alwaysOpen
          ? 'Days off for the whole team. With 24×7 hours they don’t apply, so SLA clocks keep counting.'
          : 'Days off for the whole team. SLA clocks in business hours skip them.'
      }
    >
      <div className="flex flex-col gap-5">
        {upcoming.length === 0 && past.length === 0 ? (
          <p className="text-sm text-ink-muted">No holidays yet.</p>
        ) : (
          <>
            {upcoming.length > 0 ? (
              <ul aria-label="Upcoming holidays" className="divide-y divide-border">
                {upcoming.map((holiday) => (
                  <HolidayRow
                    key={holiday.id}
                    holiday={holiday}
                    past={false}
                    removing={remove.isPending}
                    onRemove={() => {
                      removeOne(holiday);
                    }}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">No upcoming holidays.</p>
            )}
            {past.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm text-brand-link">
                  Past holidays ({past.length})
                </summary>
                <ul aria-label="Past holidays" className="mt-1 divide-y divide-border">
                  {past.map((holiday) => (
                    <HolidayRow
                      key={holiday.id}
                      holiday={holiday}
                      past
                      removing={remove.isPending}
                      onRemove={() => {
                        removeOne(holiday);
                      }}
                    />
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        <form
          noValidate
          onSubmit={submit}
          aria-label="Add a holiday"
          className="flex flex-col gap-3 border-t border-border pt-4"
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            <TextField
              label="Date"
              name="date"
              type="date"
              required
              value={date}
              error={errors.date}
              onChange={(event) => {
                setDate(event.target.value);
                setErrors({});
                setGeneral(undefined);
              }}
            />
            <TextField
              label="Name"
              name="name"
              required
              maxLength={80}
              placeholder="For example, Diwali"
              value={name}
              error={errors.name}
              onChange={(event) => {
                setName(event.target.value);
                setErrors({});
                setGeneral(undefined);
              }}
            />
          </div>
          {general && (
            <p role="alert" className="text-sm text-danger-text">
              {general}
            </p>
          )}
          <Button type="submit" variant="secondary" loading={add.isPending} className="self-start">
            Add holiday
          </Button>
        </form>
      </div>
    </Section>
  );
}

function BusinessHoursCards() {
  const hours = useGetApiV1WorkspaceBusinessHours();
  if (hours.isPending) {
    return (
      <div role="status" aria-label="Loading business hours" className="flex flex-col gap-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (hours.isError) {
    return (
      <ErrorState
        what="business hours"
        retrying={hours.isFetching}
        onRetry={() => {
          void hours.refetch();
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <HoursSection hours={hours.data} />
      <HolidaysSection hours={hours.data} />
    </div>
  );
}

/** Settings → Business hours (admins): time zone, working days and holidays for SLA clocks. */
export function BusinessHoursPage() {
  const me = useSession();
  return (
    <>
      <PageHeader
        title="Business hours"
        breadcrumbs={[{ label: 'Settings' }, { label: 'Business hours' }]}
      />
      {me.permissions.includes('settings.manage') ? (
        <BusinessHoursCards />
      ) : (
        <NoAccessState
          area="business hours"
          explanation={`Only admins can change business hours. Ask an admin of ${me.workspace.name} if something needs changing.`}
        />
      )}
    </>
  );
}
