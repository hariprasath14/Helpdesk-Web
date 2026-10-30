import { useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import type { InviteRequestInputRole, InviteResult } from '../../api/generated/model';
import {
  getGetApiV1MembersQueryKey,
  usePostApiV1Invitations,
} from '../../api/generated/members/members';
import { useGetApiV1Teams } from '../../api/generated/teams/teams';
import { Button } from '../../components/Button';
import { CheckboxField } from '../../components/CheckboxField';
import { Drawer } from '../../components/Drawer';
import { SelectField } from '../../components/SelectField';
import { useToast } from '../../components/toast-context';
import { formError } from '../auth/api-errors';
import { parseEmails } from './invite-emails';
import { isReauthRequired, useReauth } from './use-reauth';
import { ROLE_OPTIONS } from './roles';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_AT_ONCE = 20;

interface InviteDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Invite people by email with a role and teams. Shows who was skipped and why. */
export function InviteDrawer({ open, onOpenChange }: InviteDrawerProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const reauth = useReauth();
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<InviteRequestInputRole>('agent');
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const teams = useGetApiV1Teams({ query: { enabled: open } });
  const [error, setError] = useState<string>();
  const [skipped, setSkipped] = useState<InviteResult['skipped']>([]);

  const close = () => {
    setEmails('');
    setRole('agent');
    setTeamIds([]);
    setError(undefined);
    setSkipped([]);
    onOpenChange(false);
  };

  const invite = usePostApiV1Invitations({
    mutation: {
      onSuccess: (result) => {
        void queryClient.invalidateQueries({ queryKey: getGetApiV1MembersQueryKey() });
        if (result.invited.length > 0) {
          toast({
            tone: 'success',
            message:
              result.invited.length === 1
                ? `Invitation sent to ${result.invited[0] ?? ''}.`
                : `Invitations sent to ${String(result.invited.length)} people.`,
          });
        }
        if (result.skipped.length > 0) {
          setSkipped(result.skipped);
          setEmails('');
        } else {
          close();
        }
      },
      onError: (failure, variables) => {
        if (isReauthRequired(failure)) {
          reauth.ask(() => {
            invite.mutate(variables);
          });
          return;
        }
        setError(formError(failure));
      },
    },
  });

  const submit = (event?: SyntheticEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const list = parseEmails(emails);
    const invalid = list.filter((email) => !EMAIL.test(email));
    if (list.length === 0) setError('Enter at least one email address.');
    else if (invalid.length > 0) setError(`Check these addresses: ${invalid.join(', ')}`);
    else if (list.length > MAX_AT_ONCE)
      setError(`Invite up to ${String(MAX_AT_ONCE)} people at a time.`);
    else {
      setSkipped([]);
      invite.mutate({ data: { emails: list, role, teamIds } });
    }
  };

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        title="Invite people"
        description="Each person gets an email with a link to join. Links work for 7 days."
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" onClick={close}>
              {skipped.length > 0 ? 'Done' : 'Cancel'}
            </Button>
            <Button
              loading={invite.isPending}
              onClick={() => {
                submit();
              }}
            >
              Send invitations
            </Button>
          </div>
        }
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-emails" className="text-[13px] font-medium text-ink">
              Email addresses
            </label>
            <textarea
              id="invite-emails"
              rows={5}
              value={emails}
              aria-invalid={error ? true : undefined}
              aria-describedby="invite-emails-hint"
              onChange={(event) => {
                setEmails(event.target.value);
                setError(undefined);
              }}
              placeholder="neha@acme.com, arjun@acme.com"
              className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-subtle focus:ring-2 focus:ring-brand-focus aria-invalid:border-danger-text"
            />
            <p
              id="invite-emails-hint"
              className={error ? 'text-xs text-danger-text' : 'text-xs text-ink-subtle'}
            >
              {error ?? 'Separate addresses with commas or new lines. Up to 20 at a time.'}
            </p>
          </div>
          <SelectField
            label="Role"
            value={role}
            options={ROLE_OPTIONS}
            hint={ROLE_OPTIONS.find((option) => option.value === role)?.description}
            onChange={(event) => {
              setRole(event.target.value as InviteRequestInputRole);
            }}
          />
          {teams.data && teams.data.teams.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-[13px] font-medium text-ink">Teams</legend>
              <p className="-mt-1 text-xs text-ink-subtle">
                They join these teams when they accept. You can change teams later.
              </p>
              <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
                {teams.data.teams.map((team) => (
                  <CheckboxField
                    key={team.id}
                    checked={teamIds.includes(team.id)}
                    onChange={(event) => {
                      setTeamIds((current) =>
                        event.target.checked
                          ? [...current, team.id]
                          : current.filter((id) => id !== team.id),
                      );
                    }}
                  >
                    {team.name}
                  </CheckboxField>
                ))}
              </div>
            </fieldset>
          )}
          {skipped.length > 0 && (
            <div
              role="status"
              className="rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-text"
            >
              <p className="font-medium">Not invited:</p>
              <ul className="mt-1 list-disc pl-5">
                {skipped.map(({ email, reason }) => (
                  <li key={email}>
                    {email}: {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </Drawer>
      {reauth.dialog}
    </>
  );
}
