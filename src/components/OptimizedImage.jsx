import { useEffect } from 'react';

const upsertPreloadLink = (href) => {
  if (!href || typeof document === 'undefined') return;

  let link = document.head.querySelector(`link[rel="preload"][as="image"][href="${href}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = href;
    document.head.appendChild(link);
  }
  link.setAttribute('fetchpriority', 'high');
};

export default function OptimizedImage({
  src,
  alt,
  title,
  sources = [],
  priority = false,
  className = '',
  pictureClassName = '',
  sizes,
  width,
  height,
  ...props
}) {
  useEffect(() => {
    if (priority) {
      upsertPreloadLink(src);
    }
  }, [priority, src]);

  const imageTitle =
    typeof title === 'string' && title.trim()
      ? title.trim()
      : typeof alt === 'string' && alt.trim()
        ? alt.trim()
        : undefined;

  return (
    <picture className={pictureClassName}>
      {sources.map((source) => (
        <source
          key={`${source.srcSet}-${source.type || 'source'}`}
          srcSet={source.srcSet}
          type={source.type}
          media={source.media}
          sizes={source.sizes || sizes}
        />
      ))}
      <img
        src={src}
        alt={alt}
        title={imageTitle}
        className={className}
        sizes={sizes}
        width={width}
        height={height}
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        {...props}
      />
    </picture>
  );
}
