import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  flushPendingAnalyticsEvents,
  getAnalyticsMeasurementId,
  initializeAnalytics,
  trackPageView,
} from '../lib/googleAnalytics';
import {
  ensureMetaPixelReady,
  syncMetaDebugQueryParams,
  trackMetaPageView,
} from '../lib/metaPixel';

const scheduleNonCriticalWork = (callback, timeout = 1800) => {
  if (typeof window === 'undefined') return () => {};

  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(id);
  }

  const id = window.setTimeout(callback, Math.min(timeout, 1200));
  return () => window.clearTimeout(id);
};

const AnalyticsTracker = () => {
  const { pathname, search } = useLocation();
  const hasTrackedInitialPage = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const hasGoogleAnalytics = Boolean(getAnalyticsMeasurementId());

    if (hasGoogleAnalytics) {
      initializeAnalytics();
      trackPageView({ pathname, search });
      hasTrackedInitialPage.current = true;
    }

    const cleanupIdleTask = scheduleNonCriticalWork(() => {
      if (cancelled) return;

      ensureMetaPixelReady();
      syncMetaDebugQueryParams();
      trackMetaPageView({ pathname, search });
      hasTrackedInitialPage.current = true;
    }, hasTrackedInitialPage.current ? 600 : 2200);

    const flushTimer = window.setTimeout(() => {
      if (!cancelled) {
        flushPendingAnalyticsEvents();
      }
    }, 3500);

    return () => {
      cancelled = true;
      cleanupIdleTask();
      window.clearTimeout(flushTimer);
    };
  }, [pathname, search]);

  return null;
};

export default AnalyticsTracker;
