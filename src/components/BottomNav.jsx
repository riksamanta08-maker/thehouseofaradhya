import React from 'react';
import { Heart, Home, Search, ShoppingBag, User } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../contexts/cart-context';
import { useWishlist } from '../contexts/wishlist-context';

import { useAuth } from '../contexts/auth-context';

export default function BottomNav({ onSearchClick, onCartClick }) {
    const location = useLocation();
    const { totalItems } = useCart();
    const { count: wishlistCount } = useWishlist();
    const { isAuthenticated } = useAuth();

    const isActive = (path) =>
        location.pathname === path ||
        (path === '/products' && location.pathname.startsWith('/product'));

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3 pb-safe md:hidden">
            <Link to="/" className="flex flex-col items-center justify-center gap-1 text-[var(--color-text-main)]">
                <Home
                    className={`h-6 w-6 ${isActive('/') ? 'stroke-[2.4px] text-[var(--color-primary)]' : 'stroke-[1.6px] text-[var(--color-text-muted)]'}`}
                    fill={isActive('/') ? 'currentColor' : 'none'}
                />
            </Link>

            <button onClick={onSearchClick} className="flex flex-col items-center justify-center gap-1 text-[var(--color-text-main)]">
                <Search className="h-6 w-6 stroke-[1.6px] text-[var(--color-text-muted)]" />
            </button>

            <Link to="/products" className="flex flex-col items-center justify-center gap-1">
                <span
                    className={`text-xs font-bold tracking-widest ${isActive('/products') ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}
                >
                    SHOP
                </span>
            </Link>

            <Link to="/wishlist" className="relative flex flex-col items-center justify-center gap-1 text-[var(--color-text-main)]">
                <Heart
                    className={`h-6 w-6 ${isActive('/wishlist') ? 'stroke-[2.4px] text-[var(--color-primary)]' : 'stroke-[1.6px] text-[var(--color-text-muted)]'}`}
                    fill={wishlistCount > 0 ? 'currentColor' : 'none'}
                />
                {wishlistCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] font-bold text-white">
                        {wishlistCount}
                    </span>
                )}
            </Link>

            <button onClick={onCartClick} className="relative flex flex-col items-center justify-center gap-1 text-[var(--color-text-main)]">
                <ShoppingBag className="h-6 w-6 stroke-[1.6px] text-[var(--color-text-muted)]" />
                {totalItems > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] font-bold text-white">
                        {totalItems}
                    </span>
                )}
            </button>

            <Link to={isAuthenticated ? "/profile" : "/login"} className="flex flex-col items-center justify-center gap-1 text-[var(--color-text-main)]">
                <User
                    className={`h-6 w-6 ${isActive('/profile') || isActive('/login') ? 'stroke-[2.4px] text-[var(--color-primary)]' : 'stroke-[1.6px] text-[var(--color-text-muted)]'}`}
                    fill={isActive('/profile') ? 'currentColor' : 'none'}
                />
            </Link>
        </div>
    );
}
