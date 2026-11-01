import { Download, Plus, Ticket } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import type { BadgeTone } from '../../components/badge-tones';
import { Button, IconButton } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Drawer } from '../../components/Drawer';
import { Menu, MenuItem } from '../../components/Menu';
import { PageHeader } from '../../components/PageHeader';
import { TableSkeleton } from '../../components/Skeleton';
import { EmptyState, ErrorState, NoAccessState } from '../../components/StateMessage';
import { useToast } from '../../components/toast-context';
import { BrandSwitch } from './BrandSwitch';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-4 text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}

const Swatch = ({ name, className }: { name: string; className: string }) => (
  <div className="w-24">
    <div className={`h-12 rounded-lg border border-border ${className}`} />
    <p className="mt-1 text-xs text-ink-muted">{name}</p>
  </div>
);

// Full class names, so Tailwind can find them in the source.
const BRAND_SWATCHES = [
  ['50', 'bg-brand-50'],
  ['100', 'bg-brand-100'],
  ['200', 'bg-brand-200'],
  ['500', 'bg-brand-500'],
  ['600', 'bg-brand-600'],
  ['700', 'bg-brand-700'],
  ['900', 'bg-brand-900'],
] as const;

const STATUSES: [string, BadgeTone][] = [
  ['Open', 'brand'],
  ['Pending', 'warning'],
  ['Waiting on customer', 'info'],
  ['Resolved', 'success'],
  ['Closed', 'neutral'],
];
const SLA: [string, BadgeTone][] = [
  ['45m left', 'success'],
  ['At risk', 'warning'],
  ['Breached', 'danger'],
  ['Met', 'neutral'],
];

/**
 * Design preview (local and dev only): every token, component and shared state in one place, to
 * review against the Figma design system and to check the brand switch.
 */
export function DesignPreviewPage() {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  return (
    <>
      <PageHeader
        title="Design preview"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Design preview' }]}
        meta="Local and dev only"
        actions={
          <>
            <BrandSwitch />
            <Link to="/design/shell" className="text-sm font-bold text-brand-link hover:underline">
              Open the app shell preview
            </Link>
          </>
        }
      />

      <Section title="Colours">
        <div className="flex flex-wrap gap-4">
          {BRAND_SWATCHES.map(([shade, className]) => (
            <Swatch key={shade} name={`brand ${shade}`} className={className} />
          ))}
          <Swatch name="sidebar (fixed)" className="bg-sidebar" />
          <Swatch name="page" className="bg-surface-page" />
          <Swatch name="accent" className="bg-accent" />
        </div>
      </Section>

      <Section title="Typography (Nunito)">
        <p className="text-xl font-bold text-ink">Page title, 20 bold</p>
        <p className="text-base font-bold text-ink">Section title, 16 bold</p>
        <p className="text-sm">
          Body text, 14 regular. The quick brown fox jumps over the lazy dog.
        </p>
        <p className="text-sm font-medium">Body medium, 14</p>
        <p className="text-xs text-ink-muted">Small grey text, 12: counts, hints and labels</p>
        <a href="#top" className="text-sm font-medium text-brand-link hover:underline">
          A text link
        </a>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<Plus aria-hidden className="size-4" />}>New ticket</Button>
          <Button variant="secondary">Filter</Button>
          <Button variant="outline">Cancel</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <IconButton label="Download">
            <Download aria-hidden className="size-4" />
          </IconButton>
        </div>
      </Section>

      <Section title="Badges and avatars">
        <div className="mb-3 flex flex-wrap gap-2">
          {STATUSES.map(([label, tone]) => (
            <Badge key={label} tone={tone}>
              {label}
            </Badge>
          ))}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {SLA.map(([label, tone]) => (
            <Badge key={label} tone={tone} dot>
              {label}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Avatar name="Ravi Shankar" />
          <Avatar name="Meena Iyer" />
          <Avatar name="priya@acme.com" size="sm" />
        </div>
      </Section>

      <Section title="Feedback">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              toast({
                tone: 'success',
                message: 'Ticket #1042 assigned to Ravi',
                action: { label: 'Undo', onClick: () => undefined },
              });
            }}
          >
            Success toast
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              toast({
                tone: 'danger',
                message: "Couldn't save the reply. Check your connection and try again.",
                action: { label: 'Retry', onClick: () => undefined },
              });
            }}
          >
            Error toast
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setConfirmOpen(true);
            }}
          >
            Confirm dialog
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setDrawerOpen(true);
            }}
          >
            Side drawer
          </Button>
          <Menu trigger={<Button variant="outline">Menu</Button>} align="start">
            <MenuItem onSelect={() => undefined}>My profile</MenuItem>
            <MenuItem onSelect={() => undefined}>Notification settings</MenuItem>
            <MenuItem onSelect={() => undefined} danger>
              Log out
            </MenuItem>
          </Menu>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete 3 tickets?"
          description="Tickets #1038, #1039 and #1040 and their conversations will be deleted. This can't be undone."
          confirmLabel="Delete 3 tickets"
          destructive
          onConfirm={() => {
            setConfirmOpen(false);
          }}
        />
        <Drawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          title="New ticket"
          footer={
            <>
              <button type="button" className="mr-auto text-sm font-bold text-brand-link">
                Show all fields
              </button>
              <Button
                variant="outline"
                onClick={() => {
                  setDrawerOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button>Create ticket</Button>
            </>
          }
        >
          <p className="text-ink-muted">
            Form fields stack here: labels above inputs, required fields marked, helper text below.
            The body scrolls; the header and footer stay fixed.
          </p>
        </Drawer>
      </Section>

      <Section title="Loading">
        <TableSkeleton rows={3} label="Loading tickets" />
      </Section>
      <div className="mb-6">
        <EmptyState
          icon={Ticket}
          title="No tickets yet"
          description="Connect your support email and every message your customers send becomes a ticket here. You can also create one by hand."
          actions={
            <>
              <Button>Connect support email</Button>
              <Button variant="outline" icon={<Plus aria-hidden className="size-4" />}>
                Create ticket
              </Button>
            </>
          }
          footnote='A filtered list with no results uses the same block: "No tickets match these filters" and "Clear filters".'
        />
      </div>
      <div className="mb-6">
        <ErrorState
          what="your tickets"
          code="LD-503"
          retrying={retrying}
          onRetry={() => {
            setRetrying(true);
            window.setTimeout(() => {
              setRetrying(false);
            }, 1500);
          }}
        />
      </div>
      <NoAccessState
        area="Settings"
        explanation="Only Admins can change workspace settings. Ask an Admin, like Arun Kumar, to update your role."
        action={<Button variant="outline">Back to tickets</Button>}
      />
    </>
  );
}
