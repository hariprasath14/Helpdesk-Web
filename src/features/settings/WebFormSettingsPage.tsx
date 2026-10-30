import { useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import type { WebFormSettings } from '../../api/generated/model';
import {
  getGetApiV1WorkspaceWebFormQueryKey,
  useGetApiV1WorkspaceWebForm,
  usePatchApiV1WorkspaceWebForm,
} from '../../api/generated/web-form/web-form';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState, NoAccessState } from '../../components/StateMessage';
import { SwitchField } from '../../components/Switch';
import { TextAreaField } from '../../components/TextAreaField';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toast-context';
import { UnsavedChangesGuard } from '../../components/UnsavedChangesGuard';
import { Section } from '../account/Section';
import { apiFieldErrors, formError, type FieldErrors } from '../auth/api-errors';
import { useSession } from '../workspace/session-context';

/** The code a customer site pastes to show the form inside its own page. */
const embedCode = (url: string) =>
  `<iframe src="${url}" title="Contact support" style="width:100%;min-height:720px;border:0"></iframe>`;

function useSave(message: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return usePatchApiV1WorkspaceWebForm({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(getGetApiV1WorkspaceWebFormQueryKey(), result);
        toast({ tone: 'success', message });
      },
    },
  });
}

function TextSection({ settings }: { settings: WebFormSettings }) {
  const save = useSave('Web form text saved.');
  const [title, setTitle] = useState(settings.title);
  const [intro, setIntro] = useState(settings.intro);
  const [errors, setErrors] = useState<FieldErrors<'title' | 'intro'>>({});
  const [general, setGeneral] = useState<string>();

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      setErrors({ title: 'Enter a title.' });
      return;
    }
    save.mutate(
      { data: { title: title.trim(), intro: intro.trim() } },
      {
        onError: (failure) => {
          const found = apiFieldErrors(failure, ['title', 'intro'] as const);
          if (Object.keys(found).length > 0) setErrors(found);
          else setGeneral(formError(failure));
        },
      },
    );
  };

  const unchanged = title.trim() === settings.title && intro.trim() === settings.intro;
  return (
    <Section title="Text" description="What people see at the top of the form.">
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="Title"
          name="title"
          required
          maxLength={80}
          value={title}
          error={errors.title}
          onChange={(event) => {
            setTitle(event.target.value);
            setErrors({});
            setGeneral(undefined);
          }}
        />
        <TextAreaField
          label="Introduction"
          name="intro"
          rows={3}
          maxLength={1000}
          hint="Optional. For example, when you answer."
          value={intro}
          error={errors.intro}
          onChange={(event) => {
            setIntro(event.target.value);
            setErrors({});
            setGeneral(undefined);
          }}
        />
        {general && (
          <p role="alert" className="text-sm text-danger-text">
            {general}
          </p>
        )}
        {!unchanged && <UnsavedChangesGuard />}
        <Button type="submit" loading={save.isPending} disabled={unchanged} className="self-start">
          Save text
        </Button>
      </form>
    </Section>
  );
}

function ShareSection({ settings }: { settings: WebFormSettings }) {
  const toast = useToast();
  const code = embedCode(settings.url);
  return (
    <Section
      title="Share it"
      description="Link to the form from your website or email signature, or show it inside a page of your site."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">Link</span>
          <a
            href={settings.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm break-all text-brand-link hover:underline"
          >
            {settings.url}
            <ExternalLink aria-hidden className="size-3.5 shrink-0" />
          </a>
        </div>
        <TextAreaField label="Embed code" name="embed" readOnly rows={3} value={code} />
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            navigator.clipboard.writeText(code).then(
              () => {
                toast({ tone: 'success', message: 'Embed code copied.' });
              },
              () => {
                toast({ tone: 'danger', message: 'Copy it from the box instead.' });
              },
            );
          }}
        >
          <Copy aria-hidden className="size-4" />
          Copy embed code
        </Button>
      </div>
    </Section>
  );
}

function WebFormCards() {
  const settings = useGetApiV1WorkspaceWebForm();
  const toggle = useSave('Web form saved.');
  const toast = useToast();
  if (settings.isPending) {
    return (
      <div role="status" aria-label="Loading web form settings" className="flex flex-col gap-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (settings.isError) {
    return (
      <ErrorState
        what="web form settings"
        retrying={settings.isFetching}
        onRetry={() => {
          void settings.refetch();
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Web form"
        description="A public page where customers send a request without email. Each request becomes a ticket."
      >
        <SwitchField
          label="Show the web form"
          description={
            settings.data.enabled
              ? 'On: anyone with the link can send a request.'
              : 'Off: the page says the form is not available.'
          }
          checked={settings.data.enabled}
          disabled={toggle.isPending}
          onCheckedChange={(checked) => {
            toggle.mutate(
              { data: { enabled: checked } },
              {
                onError: (failure) => {
                  toast({ tone: 'danger', message: formError(failure) });
                },
              },
            );
          }}
        />
      </Section>
      <TextSection settings={settings.data} />
      <ShareSection settings={settings.data} />
    </div>
  );
}

/** Settings → Web form (admins): turn the public form on, its text, its link and embed code. */
export function WebFormSettingsPage() {
  const me = useSession();
  return (
    <>
      <PageHeader title="Web form" breadcrumbs={[{ label: 'Settings' }, { label: 'Web form' }]} />
      {me.permissions.includes('settings.manage') ? (
        <WebFormCards />
      ) : (
        <NoAccessState
          area="web form settings"
          explanation={`Only admins can change the web form. Ask an admin of ${me.workspace.name} if something needs changing.`}
        />
      )}
    </>
  );
}
