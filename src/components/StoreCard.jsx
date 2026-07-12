// src/components/StoreCard.jsx
import React from 'react';

export default function StoreCard({ store }) {
  return (
    <div className="group">
      {/* Flat tile: no radius, no shadow, no ring */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-neutral-100">
        <img
          src={store.img}
          alt={`${store.city} storefront`}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />

        {/* No gradient overlay (kept flat to match the video) */}
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <div className="translate-y-1 transition-transform duration-300 group-hover:translate-y-0">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.4em]">
              {store.city?.toUpperCase()} Store
            </h3>
            <p className="mt-1 max-w-xs text-[11px] uppercase tracking-[0.25em] opacity-80">
              {store.address}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
