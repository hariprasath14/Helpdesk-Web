import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Ticket } from 'lucide-react';
import { useState } from 'react';
import { createMemoryRouter, Link, MemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { initials } from '../lib/initials';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { Button, IconButton } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { Drawer } from './Drawer';
import { Menu, MenuItem } from './Menu';
import { PageHeader } from './PageHeader';
import { TableSkeleton } from './Skeleton';
import { TextField } from './TextField';
import { EmptyState, ErrorState, NoAccessState } from './StateMessage';
import { SwitchField } from './Switch';
import { ToastProvider } from './Toast';
import { useToast } from './toast-context';
import { UnsavedChangesGuard } from './UnsavedChangesGuard';

describe('Button', () => {
  it('blocks clicks and announces itself as busy while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading disabled={false} onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is a plain button by default, so it never submits a form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('gives icon-only buttons an accessible name', () => {
    render(
      <IconButton label="Download">
        <svg />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
  });
});

describe('Avatar and Badge', () => {
  it.each([
    ['Ravi Shankar', 'RS'],
    ['Meena', 'M'],
    ['priya.iyer@acme.com', 'PI'],
    ['  arun   kumar  raj ', 'AR'],
    ['', '?'],
  ])('initials(%j) is %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it('hides the avatar from screen readers, since the name is shown next to it', () => {
    const { container } = render(<Avatar name="Ravi Shankar" />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the label with an optional dot', () => {
    render(
      <Badge tone="danger" dot>
        Breached
      </Badge>,
    );
    expect(screen.getByText('Breached')).toBeInTheDocument();
  });
});

describe('states', () => {
  it('error state offers a retry and a support code, without technical details', async () => {
    const onRetry = vi.fn();
    render(<ErrorState what="your tickets" code="LD-503" onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load your tickets");
    expect(screen.getByRole('alert')).toHaveTextContent('LD-503');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('empty and no-access states show their title, text and action', () => {
    render(
      <>
        <EmptyState
          icon={Ticket}
          title="No tickets yet"
          description="Connect your support email."
          actions={<Button>Connect support email</Button>}
        />
        <NoAccessState area="Settings" explanation="Only Admins can change workspace settings." />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'No tickets yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect support email' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: "You don't have access to Settings" }),
    ).toBeInTheDocument();
  });

  it('loading skeleton is announced to screen readers', () => {
    render(<TableSkeleton rows={2} label="Loading tickets" />);
    expect(screen.getByRole('status', { name: 'Loading tickets' })).toBeInTheDocument();
  });
});

describe('PageHeader', () => {
  it('shows breadcrumbs, marking the current page', () => {
    render(
      <MemoryRouter>
        <PageHeader
          title="All tickets"
          meta="128 tickets"
          breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Tickets' }]}
        />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toHaveTextContent('Home/Tickets');
    expect(screen.getByText('Tickets')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1, name: 'All tickets' })).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  function Harness({ pending = false, onConfirm = vi.fn() }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button
          onClick={() => {
            setOpen(true);
          }}
        >
          Delete
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Delete 3 tickets?"
          description="This can't be undone."
          confirmLabel="Delete 3 tickets"
          destructive
          pending={pending}
          onConfirm={onConfirm}
        />
      </>
    );
  }

  it('starts on Cancel, and Escape closes it without confirming', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Delete 3 tickets?' });
    expect(dialog).toHaveAccessibleDescription("This can't be undone.");
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm from the named confirm button', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete 3 tickets' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('cannot be closed while the action is running', async () => {
    render(<Harness pending />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete 3 tickets' })).toBeDisabled();
  });
});

describe('Drawer', () => {
  it('shows its title and footer, and the close button closes it', async () => {
    const onOpenChange = vi.fn();
    render(
      <Drawer open onOpenChange={onOpenChange} title="New ticket" footer={<Button>Create</Button>}>
        Fields
      </Drawer>,
    );

    expect(screen.getByRole('dialog', { name: 'New ticket' })).toHaveTextContent('Fields');
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('asks before closing once something was typed, and stays open on Cancel', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <Drawer open onOpenChange={onOpenChange} title="New ticket">
            <TextField label="Subject" />
          </Drawer>
        ),
      },
    ]);
    render(<RouterProvider router={router} />);

    await user.type(screen.getByRole('textbox', { name: 'Subject' }), 'Payroll');
    await user.keyboard('{Escape}');
    const ask = await screen.findByRole('alertdialog', { name: 'Discard your changes?' });
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'New ticket' })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('UnsavedChangesGuard', () => {
  it('asks before leaving the page, and leaves only when told to', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <>
            <Link to="/other">Other page</Link>
            <UnsavedChangesGuard />
          </>
        ),
      },
      { path: '/other', element: <h1>Other page</h1> },
    ]);
    render(<RouterProvider router={router} />);

    await user.click(screen.getByRole('link', { name: 'Other page' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(router.state.location.pathname).toBe('/');

    await user.click(screen.getByRole('link', { name: 'Other page' }));
    await user.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    expect(await screen.findByRole('heading', { name: 'Other page' })).toBeInTheDocument();
  });
});

describe('Menu', () => {
  it('opens from its trigger and runs the chosen item', async () => {
    const onProfile = vi.fn();
    render(
      <Menu trigger={<Button>Account</Button>} header={<span>Ravi Shankar</span>}>
        <MenuItem onSelect={onProfile}>My profile</MenuItem>
        <MenuItem onSelect={vi.fn()} danger>
          Log out
        </MenuItem>
      </Menu>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByRole('menu')).toHaveTextContent('Ravi Shankar');
    await userEvent.click(screen.getByRole('menuitem', { name: 'My profile' }));
    expect(onProfile).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('SwitchField', () => {
  it('can keep its label for screen readers only, without losing its name', () => {
    render(<SwitchField hideLabel label="Billing rule on" checked onCheckedChange={vi.fn()} />);
    const toggle = screen.getByRole('switch', { name: 'Billing rule on' });
    expect(toggle).toBeChecked();
    expect(screen.getByText('Billing rule on').parentElement).toHaveClass('sr-only');
  });
});

describe('toasts', () => {
  function Trigger({ withAction = false }) {
    const toast = useToast();
    return (
      <Button
        onClick={() => {
          toast({
            tone: 'success',
            message: 'Ticket #1042 assigned to Ravi',
            ...(withAction ? { action: { label: 'Undo', onClick: undoSpy } } : {}),
          });
        }}
      >
        Assign
      </Button>
    );
  }
  const undoSpy = vi.fn();

  it('shows the message with its one action, and can be dismissed', async () => {
    render(
      <ToastProvider>
        <Trigger withAction />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));

    expect(await screen.findByText('Ticket #1042 assigned to Ravi')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(undoSpy).toHaveBeenCalledOnce();
  });

  it('closes with the dismiss button', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));

    await waitFor(() => {
      expect(screen.queryByText('Ticket #1042 assigned to Ravi')).not.toBeInTheDocument();
    });
  });

  it('must be used inside the provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/);
    consoleError.mockRestore();
  });
});
