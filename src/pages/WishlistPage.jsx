import React, { useMemo } from 'react';
import { Heart, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { useWishlist } from '../contexts/wishlist-context';

const WishlistPage = () => {
  const { items, count, clear } = useWishlist();

  const wishlistCards = useMemo(
    () =>
      items.map((entry) => {
        const card = entry.card ?? {};
        return {
          handle: entry.handle,
          title: card.title || 'Saved item',
          vendor: card.vendor || 'Aradhya',
          price: card.price || '',
          img: card.img || card.featuredImage?.url || null,
          hoverImg: card.hoverImg,
          badge: card.badge,
          compareAtPrice: card.compareAtPrice,
        };
      }),
    [items],
  );

  return (
    <div className="bg-white min-h-screen">
      <div className="site-shell py-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-gray-500">Wishlist</p>
          <h1 className="text-2xl font-semibold text-gray-900">
            Saved items{' '}
            <span className="text-sm text-gray-500 font-normal">
              ({count})
            </span>
          </h1>
        </div>
        {count > 0 && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-gray-600 hover:text-black"
          >
            <Trash2 className="w-4 h-4" />
            Clear all
          </button>
        )}
      </div>

      {count === 0 ? (
        <div className="site-shell py-20 text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <Heart className="w-7 h-7 text-gray-500" />
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-800">Your wishlist is empty</p>
            <p className="text-sm text-gray-500">
              Tap the heart on any product to save it for later.
            </p>
          </div>
          <Link
            to="/products"
            className="mt-2 px-6 py-3 border border-gray-900 uppercase tracking-[0.2em] text-sm font-bold hover:bg-gray-900 hover:text-white transition-colors"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <div className="site-shell pb-16">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {wishlistCards.map((card) => (
              <ProductCard key={card.handle} item={card} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WishlistPage;
