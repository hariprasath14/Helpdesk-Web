import { useCallback, useState, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'helpdesk.sidebarCollapsed';
const WIDE = '(min-width: 1024px)';

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    // Storage can be blocked (private mode, browser settings); fall back to expanded.
    return false;
  }
}

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

/** True from 1024px; also where the browser cannot tell (tests). */
const isWide = () => typeof window.matchMedia !== 'function' || window.matchMedia(WIDE).matches;

/**
 * The desktop sidebar's collapsed state. From 1024px it is remembered on this device. On tablets
 * (768–1023px) it starts as icons to leave room for the page (Step 5b); expanding it there lasts
 * for the visit only.
 */
export function useSidebarCollapsed(): [boolean, () => void] {
  const wide = useSyncExternalStore(subscribe, isWide);
  const [collapsed, setCollapsed] = useState(read);
  const [tabletOpen, setTabletOpen] = useState(false);
  const toggle = useCallback(() => {
    if (!isWide()) {
      setTabletOpen((current) => !current);
      return;
    }
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Not remembered, but the toggle still works for this visit.
      }
      return next;
    });
  }, []);
  return [wide ? collapsed : !tabletOpen, toggle];
}
