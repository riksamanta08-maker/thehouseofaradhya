// src/components/ScrollToTop.jsx
import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const STORAGE_PREFIX = 'aradhya:scroll:';

const getScrollKey = (pathname, search) => `${STORAGE_PREFIX}${pathname}${search || ''}`;

const saveScrollPosition = (pathname, search) => {
  if (typeof window === 'undefined' || !window.sessionStorage) return;

  try {
    window.sessionStorage.setItem(
      getScrollKey(pathname, search),
      JSON.stringify({
        x: window.scrollX || 0,
        y: window.scrollY || 0,
      }),
    );
  } catch {
    // Ignore storage failures
  }
};

const readScrollPosition = (pathname, search) => {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;

  try {
    const raw = window.sessionStorage.getItem(getScrollKey(pathname, search));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const y = Number(parsed?.y);
    const x = Number(parsed?.x);
    if (!Number.isFinite(y)) return null;
    return {
      x: Number.isFinite(x) ? x : 0,
      y,
    };
  } catch {
    return null;
  }
};

const restoreScrollPosition = (position) => {
  if (!position) return;

  const restore = () => {
    window.scrollTo({
      left: position.x,
      top: position.y,
      behavior: 'instant' in window ? 'instant' : 'auto',
    });
  };

  // Product grids hydrate/load asynchronously, so we retry scrolling at intervals to guarantee success.
  [0, 50, 100, 200, 300, 500, 800, 1200, 1800].forEach((delay) => {
    window.setTimeout(restore, delay);
  });
};

const ScrollToTop = () => {
  const { pathname, search } = useLocation();
  const navigationType = useNavigationType();
  const isRestoringRef = useRef(false);

  // 1. Listen for scroll events to save position dynamically (avoiding the cleanup race condition)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let timeoutId = null;
    const handleScroll = () => {
      if (isRestoringRef.current) return;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!isRestoringRef.current) {
          saveScrollPosition(window.location.pathname, window.location.search);
        }
      }, 80);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [pathname, search]);

  // 2. Handle scroll restoration on POP, scroll to top on PUSH
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const previousRestoration = window.history.scrollRestoration;
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    let restoreTimeoutId = null;

    if (navigationType === 'POP') {
      const savedPosition = readScrollPosition(pathname, search);
      if (savedPosition) {
        isRestoringRef.current = true;
        restoreScrollPosition(savedPosition);
        restoreTimeoutId = setTimeout(() => {
          isRestoringRef.current = false;
        }, 1500); // 1.5s is safe to cover async product loads
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    }

    return () => {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = previousRestoration;
      }
      if (restoreTimeoutId) {
        clearTimeout(restoreTimeoutId);
      }
    };
  }, [pathname, search, navigationType]);

  return null;
};

export default ScrollToTop;
