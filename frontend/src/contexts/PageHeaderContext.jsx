import React, { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';

const EMPTY_HEADER = { subtitle: null, actions: null };

let headerSnapshot = EMPTY_HEADER;
const listeners = new Set();

function emitHeaderChange() {
  listeners.forEach((listener) => listener());
}

function subscribeHeader(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getHeaderSnapshot() {
  return headerSnapshot;
}

function setPageHeader(next) {
  const nextHeader = {
    subtitle: next?.subtitle ?? null,
    actions: next?.actions ?? null,
  };
  if (headerSnapshot.subtitle === nextHeader.subtitle && headerSnapshot.actions === nextHeader.actions) {
    return;
  }
  headerSnapshot = nextHeader;
  emitHeaderChange();
}

function clearPageHeader() {
  if (headerSnapshot.subtitle === null && headerSnapshot.actions === null) {
    return;
  }
  headerSnapshot = EMPTY_HEADER;
  emitHeaderChange();
}

const PageHeaderApiContext = createContext(null);

export function PageHeaderProvider({ children }) {
  const apiRef = useRef({ setPageHeader, clearPageHeader });
  return <PageHeaderApiContext.Provider value={apiRef.current}>{children}</PageHeaderApiContext.Provider>;
}

/** Header bar only — subscribing here does not re-render page content. */
export function usePageHeader() {
  return useSyncExternalStore(subscribeHeader, getHeaderSnapshot, getHeaderSnapshot);
}

export function usePageHeaderActions() {
  const ctx = useContext(PageHeaderApiContext);
  if (!ctx) {
    throw new Error('usePageHeaderActions must be used within PageHeaderProvider');
  }
  return ctx;
}

/**
 * Register page subtitle + action buttons in the top app header (cleared on unmount).
 * Pass stable `actions` via useMemo when possible.
 */
export function useRegisterPageHeader({ subtitle = null, actions = null, enabled = true }) {
  const { setPageHeader: applyHeader, clearPageHeader: resetHeader } = usePageHeaderActions();
  const hasRegisteredRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      if (hasRegisteredRef.current) {
        resetHeader();
        hasRegisteredRef.current = false;
      }
      return undefined;
    }

    applyHeader({ subtitle, actions });
    hasRegisteredRef.current = true;
    return undefined;
  }, [subtitle, actions, enabled, applyHeader, resetHeader]);

  useEffect(
    () => () => {
      if (hasRegisteredRef.current) {
        resetHeader();
      }
    },
    [resetHeader],
  );
}
