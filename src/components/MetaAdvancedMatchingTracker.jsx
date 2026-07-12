import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/auth-context';
import { getCheckoutDraft } from '../lib/checkout';
import { applyMetaAdvancedMatching } from '../lib/metaPixel';

const scheduleIdleTask = (callback, timeout = 1500) => {
  if (typeof window === 'undefined') return () => {};

  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(id);
  }

  const id = window.setTimeout(callback, Math.min(timeout, 1000));
  return () => window.clearTimeout(id);
};

const MetaAdvancedMatchingTracker = () => {
  const { customer } = useAuth();
  const { pathname, search } = useLocation();

  useEffect(() => {
    const checkoutDraft = getCheckoutDraft();
    let cancelled = false;

    const cleanup = scheduleIdleTask(async () => {
      if (cancelled) return;
      await applyMetaAdvancedMatching({
        customer,
        shipping: checkoutDraft?.shipping || null,
      });
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [customer, pathname, search]);

  return null;
};

export default MetaAdvancedMatchingTracker;
