import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProductCard from './ProductCard';

const SectionHeader = ({ title, ctaHref, ctaLabel }) => (
  <div className="flex flex-col gap-4 border-t border-neutral-200 py-4 uppercase md:flex-row md:items-center md:justify-between">
    <h2 className="max-w-[18rem] text-[10px] leading-5 tracking-[0.24em] text-neutral-600 sm:max-w-none sm:text-xs sm:tracking-[0.35em]">
      {title}
    </h2>
    <Link
      to={ctaHref}
      className="flex items-center gap-2 self-start rounded-full border border-neutral-900 px-4 py-2 text-[10px] tracking-[0.18em] transition hover:bg-neutral-900 hover:text-white sm:self-end sm:px-5 sm:tracking-[0.32em] md:self-auto"
    >
      {ctaLabel}
      <ChevronRight className="h-3 w-3" />
    </Link>
  </div>
);

const ProductCardSkeleton = () => (
  <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
    <div className="aspect-[3/4] w-full animate-pulse bg-neutral-200" />
    <div className="space-y-2 p-3">
      <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-200" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-neutral-200" />
      <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-200" />
    </div>
  </div>
);

export default function ProductGrid({
  title,
  products = [],
  ctaHref = '/products',
  ctaLabel = 'Discover More',
  loading = false,
  enableImageScroller = false,
}) {
  const hasProducts = Array.isArray(products) && products.length > 0;
  const showSkeleton = loading && !hasProducts;
  const skeletonItems = Array.from({ length: 4 }, (_, idx) => idx);

  return (
    // Keep desktop width capped so the four-up layout keeps similar card widths
    <section className="site-shell section-gap">
      <SectionHeader title={title} ctaHref={ctaHref} ctaLabel={ctaLabel} />

      {/* Four-up on large screens with consistent spacing */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-4 sm:gap-y-8 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-10">
        {showSkeleton
          ? skeletonItems.map((item) => <ProductCardSkeleton key={`skeleton-${item}`} />)
          : products.map((item, idx) => (
              <div key={item.title + idx} className="h-full">
                <ProductCard item={item} enableImageScroller={enableImageScroller} />
              </div>
            ))}
      </div>

      {!loading && !hasProducts ? (
        <p className="py-5 text-center text-sm text-neutral-500">Products will appear here shortly.</p>
      ) : null}

      <div className="flex justify-center py-5">
        <Link
          to={ctaHref}
          className="rounded-full border border-neutral-900 px-6 py-3 text-[10px] uppercase tracking-[0.18em] transition hover:bg-neutral-900 hover:text-white sm:px-8 sm:text-[11px] sm:tracking-[0.3em]"
        >
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}
