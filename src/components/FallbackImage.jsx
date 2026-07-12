import { useEffect, useState } from 'react';

export default function FallbackImage({
  src,
  alt = '',
  className = '',
  fallbackClassName = '',
  fallbackText = 'Image unavailable',
  ...props
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 text-center text-xs uppercase tracking-[0.2em] text-gray-300 ${fallbackClassName || className}`}
      >
        {fallbackText}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      {...props}
    />
  );
}
