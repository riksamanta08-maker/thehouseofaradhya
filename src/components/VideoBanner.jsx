// src/components/VideoBanner.jsx
import React from 'react';
import LazyVideo from './LazyVideo';

export default function VideoBanner({ videoSrc = '/videos/banner-loop.mp4' }) {
  return (
    <section className="section-gap">
      <div className="site-shell">
        <div className="flex flex-col gap-4 border-t border-[var(--color-border)] py-4 uppercase md:flex-row md:items-center md:justify-between">
          <h2 className="text-xs tracking-[0.35em] text-[var(--color-text-muted)]">
            Extension Of Your Expression
          </h2>
          <button className="flex items-center gap-2 self-start rounded-full border border-[var(--color-text-main)] px-4 py-2 text-[10px] tracking-[0.35em] text-[var(--color-text-main)] transition hover:bg-[var(--color-primary)] hover:border-[var(--color-primary)] hover:text-white md:self-auto">
            Discover More
          </button>
        </div>
      </div>
      <div className="site-shell">
        <div className="relative mt-4 h-[52vh] min-h-[320px] w-full overflow-hidden rounded-2xl bg-black sm:h-[58vh] md:h-[62vh] lg:h-[70vh]">
          <LazyVideo
            className="h-full w-full object-cover"
            src={videoSrc}
            autoPlay
            muted
            loop
            playsInline
            preload="none"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/30 to-transparent" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-white">
            <span className="border border-white/60 px-4 py-2 text-[10px] uppercase tracking-[0.35em] text-white/80">
              Discover More
            </span>
            <span className="text-3xl font-black tracking-[0.5em] sm:text-4xl md:text-5xl lg:text-6xl">
              ARADHYA
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
