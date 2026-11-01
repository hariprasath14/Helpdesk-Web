import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { config } from './config';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

// The demo answers its own API calls (src/demo); its code loads only in the demo build.
if (config.demo) await (await import('./demo/start')).startDemo();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
