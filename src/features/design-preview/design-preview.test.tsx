import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderRoute } from '../../test/render';

afterEach(() => {
  document.documentElement.dataset.brand = 'forest';
});

describe('design preview', () => {
  it('does not exist when the setting is off, as in prod', async () => {
    renderRoute('/design');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('shows every component and switches the brand colour', async () => {
    renderRoute('/design', { designPreview: true });

    expect(await screen.findByRole('heading', { name: 'Design preview' })).toBeInTheDocument();
    await userEvent.click(screen.getByText('Indigo'));
    expect(document.documentElement.dataset.brand).toBe('indigo');

    await userEvent.click(screen.getByRole('button', { name: 'Confirm dialog' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete 3 tickets?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete 3 tickets' }));

    await userEvent.click(screen.getByRole('button', { name: 'Side drawer' }));
    expect(screen.getByRole('dialog', { name: 'New ticket' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await userEvent.click(screen.getByRole('button', { name: 'Success toast' }));
    expect(await screen.findByText('Ticket #1042 assigned to Ravi')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Error toast' }));
    expect(await screen.findByText(/Couldn't save the reply/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
  });

  it('previews the full shell in each state', async () => {
    renderRoute('/design/shell?state=empty', { designPreview: true });

    expect(await screen.findByRole('heading', { name: 'No tickets yet' })).toBeInTheDocument();
    expect(screen.getByText('Trial · 12 days left')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'loading' }));
    expect(await screen.findByRole('status', { name: 'Loading tickets' })).toBeInTheDocument();
    for (const [state, text] of [
      ['error', "We couldn't load your tickets"],
      ['no-access', "You don't have access to Settings"],
      ['content', 'Page content'],
    ] as const) {
      await userEvent.click(screen.getByRole('button', { name: state }));
      expect(await screen.findByText((content) => content.includes(text))).toBeInTheDocument();
    }

    await userEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(await screen.findByText('Upgrade arrives with F30.')).toBeInTheDocument();
  });
});
