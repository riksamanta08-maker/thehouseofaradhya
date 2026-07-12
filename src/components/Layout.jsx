// src/components/Layout.jsx
import React, { Suspense, lazy, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import CatalogProvider from '../contexts/catalog-context';
import CartProvider from '../contexts/cart-context';
import WishlistProvider from '../contexts/wishlist-context';
import NotificationProvider from './NotificationProvider';
import BottomNav from './BottomNav';

const SearchOverlay = lazy(() => import('./SearchOverlay'));
const CartDrawer = lazy(() => import('./CartDrawer'));

const normalizeTitleText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const deriveLinkTitle = (anchor) => {
  if (!anchor) return '';

  const explicitLabel = normalizeTitleText(anchor.getAttribute('aria-label'));
  if (explicitLabel) return explicitLabel;

  const textLabel = normalizeTitleText(anchor.textContent);
  if (textLabel) return textLabel;

  const imageAlt = normalizeTitleText(anchor.querySelector('img[alt]')?.getAttribute('alt'));
  if (imageAlt) return imageAlt;

  const href = anchor.getAttribute('href') || '';
  if (!href) return '';
  if (href === '#') return 'Section link';

  try {
    const url = new URL(href, window.location.origin);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/') return 'Home';

    const label = path
      .split('/')
      .filter(Boolean)
      .join(' ')
      .replace(/[-_]+/g, ' ');

    return normalizeTitleText(decodeURIComponent(label));
  } catch {
    return normalizeTitleText(href.replace(/[-_/#?=&]+/g, ' '));
  }
};

const syncMissingLinkTitles = () => {
  if (typeof document === 'undefined') return;

  document.querySelectorAll('a[href]').forEach((anchor) => {
    if (normalizeTitleText(anchor.getAttribute('title'))) return;
    const title = deriveLinkTitle(anchor);
    if (title) {
      anchor.setAttribute('title', title);
    }
  });
};

const marqueeItems = [
  'THE HOUSE OF ARADHYA',
  'NEW ARRIVALS WEEKLY',
  'EXPRESS SHIPPING',
  'PREMIUM QUALITY',
  'PAN INDIA DELIVERY',
];

const TopAnnouncement = () => (
  <div
    className="relative h-6 w-full overflow-hidden bg-neutral-900 text-white"
    role="marquee"
    aria-label="Site announcements vertical marquee"
  >
    <div className="marquee-vertical group h-full text-[10px] uppercase tracking-[0.35em]">
      <div className="marquee-vertical__group">
        {marqueeItems.map((item, idx) => (
          <span className="marquee-vertical__item" key={item || idx}>
            {item}
          </span>
        ))}
      </div>

      <div aria-hidden className="marquee-vertical__group">
        {marqueeItems.map((item, idx) => (
          <span className="marquee-vertical__item" key={`${item || idx}-duplicate`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  </div>
);

const Layout = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const location = useLocation();

  React.useEffect(() => {
    const handleOpenSearch = () => setSearchOpen(true);
    document.addEventListener('open-search', handleOpenSearch);
    return () => document.removeEventListener('open-search', handleOpenSearch);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    let frameId = 0;
    const runSync = () => {
      frameId = 0;
      syncMissingLinkTitles();
    };
    const scheduleSync = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(runSync);
    };

    scheduleSync();

    const observer = new MutationObserver(() => {
      scheduleSync();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'aria-label'],
    });

    return () => {
      observer.disconnect();
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [location.pathname, location.search, searchOpen, cartOpen]);

  const outletContext = useMemo(
    () => ({
      openCartDrawer: () => setCartOpen(true),
      closeCartDrawer: () => setCartOpen(false),
    }),
    [],
  );

  return (
    <CatalogProvider>
      <WishlistProvider>
        <CartProvider>
          <NotificationProvider>
            <div className="min-h-screen flex flex-col bg-[var(--color-bg-page)] text-[var(--color-text-main)]">
              <div className="sticky top-0 z-50 hidden md:block">
                <Navbar
                  onSearchClick={() => setSearchOpen(true)}
                  onCartClick={() => setCartOpen(true)}
                />
              </div>

              <main className="flex-grow pb-20 md:pb-0">
                <Outlet context={outletContext} />
              </main>

              <Footer />

              <Suspense fallback={null}>
                {searchOpen ? (
                  <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
                ) : null}
                {cartOpen ? (
                  <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
                ) : null}
              </Suspense>
              <BottomNav onSearchClick={() => setSearchOpen(true)} onCartClick={() => setCartOpen(true)} />
            </div>
          </NotificationProvider>
        </CartProvider>
      </WishlistProvider>
    </CatalogProvider>
  );
};

export default Layout;
