import React, { useEffect, useRef, useState } from 'react';

export default function LazyVideo({
  className = '',
  src,
  poster,
  rootMargin = '300px',
  priority = false,
  ...props
}) {
  const containerRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(Boolean(priority));

  useEffect(() => {
    if (priority || shouldLoad) return undefined;

    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [priority, rootMargin, shouldLoad]);

  return (
    <div ref={containerRef} className={className}>
      {shouldLoad ? (
        <video className={className} src={src} poster={poster} {...props} />
      ) : (
        <div className={`${className} bg-black`} aria-hidden="true" />
      )}
    </div>
  );
}
