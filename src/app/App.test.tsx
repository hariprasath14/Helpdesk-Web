import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { PRODUCT_NAME } from '../product';

describe('App', () => {
  it('starts with its real providers and sends the main address to sign-up', async () => {
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: `Create your ${PRODUCT_NAME} workspace` }),
    ).toBeInTheDocument();
  });
});
