import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import ToastStack from '../components/ui/Toast.jsx';

const ToastContext = createContext(null);

let nextId = 1;

/**
 * Lightweight toast stack. Auto-dismisses after ~5s unless the toast carries an
 * action button (those stay until dismissed or acted on).
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast) => {
      const id = toast.id ?? `toast-${nextId++}`;
      const entry = {
        id,
        message: toast.message,
        actionLabel: toast.actionLabel ?? null,
        onAction: toast.onAction ?? null,
        tone: toast.tone ?? 'neutral',
      };
      setToasts((current) => [...current.filter((t) => t.id !== id), entry]);

      const sticky = Boolean(entry.actionLabel) || Boolean(toast.sticky);
      if (!sticky) {
        const existing = timers.current.get(id);
        if (existing) clearTimeout(existing);
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), toast.durationMs ?? 5000),
        );
      }
      return id;
    },
    [dismiss],
  );

  const update = useCallback((id, patch) => {
    setToasts((current) =>
      current.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
    if (patch.actionLabel) {
      const timer = timers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    } else if (patch.actionLabel === null && patch.message) {
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), 4000),
      );
    }
  }, [dismiss]);

  const value = useMemo(() => ({ push, dismiss, update }), [push, dismiss, update]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
