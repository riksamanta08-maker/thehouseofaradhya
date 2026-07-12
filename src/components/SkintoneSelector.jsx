import React from 'react';
import OptimizedImage from './OptimizedImage';

const skintones = [
  {
    id: 'fair-skin',
    label: 'FAIR SKINTONE',
    image: '/images/skintone-fair.jpg',
    webp: '/images/skintone-fair.webp',
  },
  {
    id: 'neutral-skin',
    label: 'NEUTRAL SKINTONE',
    image: '/images/skintone-neutral.jpg',
    webp: '/images/skintone-neutral.webp',
  },
  {
    id: 'dark-skin',
    label: 'DARK SKINTONE',
    image: '/images/skintone-dark.jpg',
    webp: '/images/skintone-dark.webp',
  },
];

export default function SkintoneSelector({ onSelect }) {
  return (
    <section className="bg-white py-6 sm:py-8 md:py-10">
      <div className="mx-auto max-w-7xl px-3 space-y-5 sm:px-4 sm:space-y-6">
        <h2 className="mx-auto max-w-5xl text-center text-[clamp(1.85rem,6.2vw,3.5rem)] font-semibold uppercase leading-[1.08] tracking-[0.08em] text-slate-900 sm:tracking-[0.12em]">
          Select Your Skintone & Get Perfect Combination
        </h2>

        <div className="grid gap-3 sm:gap-4 md:grid-cols-3">
          {skintones.map((tone) => (
            <button
              key={tone.id}
              type="button"
              onClick={() => onSelect?.(tone.id)}
              className="block w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-md"
            >
              <OptimizedImage
                src={tone.image}
                sources={[{ srcSet: tone.webp, type: 'image/webp' }]}
                alt={`${tone.label} outfit combinations for men`}
                className="block aspect-[1600/666] w-full object-cover"
                width={1600}
                height={666}
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
