// src/components/NotificationProvider.jsx
/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

const NotificationContext = createContext(undefined);

const defaultDuration = 4000;

const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
};

const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const timeoutsRef = useRef(new Map());

  const removeNotification = useCallback((id) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      window.clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    ({ title, message, actionLabel, onAction, duration = defaultDuration }) => {
      const id = generateId();
      setNotifications((current) => [
        ...current,
        {
          id,
          title,
          message,
          actionLabel,
          onAction,
        },
      ]);

      if (duration !== null) {
        const timeout = window.setTimeout(() => removeNotification(id), duration);
        timeoutsRef.current.set(id, timeout);
      }

      return id;
    },
    [removeNotification],
  );

  const value = useMemo(
    () => ({
      notify,
      remove: removeNotification,
    }),
    [notify, removeNotification],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-20 z-[1000] flex w-full max-w-md -translate-x-1/2 flex-col gap-3 px-4 sm:top-24">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className="pointer-events-auto rounded-2xl border border-neutral-200 bg-white/95 p-4 shadow-lg backdrop-blur"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                {notification.title && (
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-neutral-900">
                    {notification.title}
                  </p>
                )}
                {notification.message && (
                  <p className="mt-2 text-xs tracking-[0.22em] text-neutral-600">
                    {notification.message}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeNotification(notification.id)}
                className="text-xs uppercase tracking-[0.25em] text-neutral-400 transition hover:text-neutral-900"
              >
                Close
              </button>
            </div>
            {notification.actionLabel && notification.onAction && (
              <button
                type="button"
                onClick={() => {
                  removeNotification(notification.id);
                  notification.onAction?.();
                }}
                className="mt-4 inline-flex rounded-full border border-neutral-900 px-4 py-2 text-[10px] uppercase tracking-[0.32em] text-neutral-900 transition hover:bg-neutral-900 hover:text-white"
              >
                {notification.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

export default NotificationProvider;
