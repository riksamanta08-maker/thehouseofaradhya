import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ShoppingBag, User, Heart, Menu, X } from 'lucide-react';
import { useCart } from '../contexts/cart-context';
import { useAuth } from '../contexts/auth-context';
import { useWishlist } from '../contexts/wishlist-context';

const Navbar = ({ onSearchClick, onCartClick }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { totalItems } = useCart();
  const { isAuthenticated } = useAuth();
  const { count: wishlistCount } = useWishlist();
  const navigate = useNavigate();

  const navLinks = [
    { label: 'HOME', href: '/' },
    { label: 'SHOP', href: '/products' },
    { label: 'BLOG', href: '/blog' },
    { label: 'ABOUT US', href: '/about' },
    { label: 'CONTACT US', href: '/contact' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] shadow-sm font-sans">
      <div className="site-shell flex h-20 items-center gap-3 md:h-[88px] md:gap-4">
        <div className="flex flex-shrink-0 items-center gap-2 md:gap-3">
          <button
            className="lg:hidden rounded-md p-2 text-[var(--color-text-main)] hover:bg-[var(--color-bg-surface-muted)]"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>

          <Link to="/" className="flex-shrink-0 block">
            <img
              src="/aradhya-logo.png"
              alt="Aradhya"
              title="Aradhya"
              className="h-12 w-auto object-contain md:h-14"
            />
          </Link>
        </div>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-6 lg:flex xl:gap-10">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              to={link.href}
              className="relative whitespace-nowrap py-8 text-[12px] font-semibold tracking-[0.24em] text-gray-800 transition-colors hover:text-black xl:text-[13px] xl:tracking-[0.3em]"
            >
              {link.label}
              {link.isNew && (
                <span className="absolute -right-2 top-0 text-[10px] font-bold uppercase text-[var(--color-primary)]">
                  New
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex flex-shrink-0 items-center gap-2 md:gap-3">
          <div className="group relative hidden items-center rounded-full bg-gray-100 transition-shadow focus-within:ring-1 focus-within:ring-black lg:flex lg:w-48 xl:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search for items..."
              className="block w-full rounded-full bg-transparent py-2.5 pl-10 pr-3 text-[13px] font-medium text-gray-900 placeholder-gray-500 focus:outline-none"
              onClick={onSearchClick}
              onFocus={onSearchClick}
              readOnly
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              className="lg:hidden flex items-center justify-center rounded-md p-1.5 text-[var(--color-text-main)] hover:bg-[var(--color-bg-surface-muted)]"
              onClick={onSearchClick}
              aria-label="Search"
            >
              <Search className="h-5 w-5" />
            </button>

            <button
              type="button"
              className="group flex flex-col items-center gap-1 rounded-md p-1 text-[var(--color-text-main)] hover:text-[var(--color-primary)]"
              onClick={() => navigate(isAuthenticated ? '/profile' : '/login')}
              aria-label="Profile"
            >
              <User className="h-5 w-5" />
              <span className="hidden text-[11px] font-bold xl:block">Profile</span>
            </button>

            <Link
              to="/wishlist"
              className="group relative flex flex-col items-center gap-1 rounded-md p-1 text-[var(--color-text-main)] hover:text-[var(--color-primary)]"
            >
              <Heart
                className="h-5 w-5"
                fill={wishlistCount > 0 ? 'currentColor' : 'none'}
                color={
                  wishlistCount > 0
                    ? 'var(--color-primary)'
                    : 'var(--color-text-main)'
                }
              />
              {wishlistCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] font-bold text-white">
                  {wishlistCount}
                </span>
              )}
              <span className="hidden text-[11px] font-bold xl:block">Wishlist</span>
            </Link>

            <button
              type="button"
              className="group relative flex flex-col items-center gap-1 rounded-md p-1 text-[var(--color-text-main)] hover:text-[var(--color-primary)]"
              onClick={onCartClick}
              aria-label="Bag"
            >
              <ShoppingBag className="h-5 w-5" />
              {totalItems > 0 && (
                <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] font-bold text-white">
                  {totalItems}
                </span>
              )}
              <span className="hidden text-[11px] font-bold xl:block">Bag</span>
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="absolute left-0 top-full z-40 w-full border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] px-5 py-4 shadow-lg lg:hidden">
          <div className="flex flex-col gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                to={link.href}
                className="rounded-md border border-transparent px-2 py-2 text-sm font-semibold tracking-[0.08em] text-[var(--color-text-main)] hover:border-[var(--color-border)] hover:bg-[var(--color-bg-surface-muted)]"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
