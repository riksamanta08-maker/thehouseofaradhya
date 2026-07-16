import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import FallbackImage from './FallbackImage';
import { useWishlist } from '../contexts/wishlist-context';
import { useNotifications } from './NotificationProvider';

const formatAmount = (amount, currency = 'INR') => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
};

const ProductCard = ({ item, enableImageScroller = false }) => {
const {
  handle,
  title,
  featuredImage,
  price,
  compareAtPrice,
  vendor,
  img,
  images,
  hoverImg,
  badge,
} = item || {};

console.log("========== PRODUCT ==========");
console.log("Title:", title);
console.log("featuredImage:", featuredImage);
console.log("img:", img);
console.log("images:", images);
console.log("media:", item?.media);
console.log("Full Item:", item);

  const { toggleItem, isWishlisted } = useWishlist();
  const { notify } = useNotifications();

  const inWishlist = useMemo(() => isWishlisted(handle), [isWishlisted, handle]);

  const handleWishlistClick = (event) => {
    event.preventDefault();
    if (!handle) return;
    const nextStateIsAdded = !inWishlist;
    toggleItem(handle, item);
    notify({
      title: 'Wishlist',
      message: nextStateIsAdded ? 'Saved to your wishlist.' : 'Removed from wishlist.',
    });
  };

  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const imageList = useMemo(() => {
    const list = [];
    const seen = new Set();

    const pushImage = (value) => {
      const url = typeof value === 'string' ? value : value?.url;
      if (!url || seen.has(url)) return;
      seen.add(url);
      list.push(url);
    };

    pushImage(img);
    pushImage(featuredImage?.url);
    if (Array.isArray(images)) {
      images.forEach((entry) => pushImage(entry));
    }
    pushImage(hoverImg);
    return list;
  }, [featuredImage?.url, hoverImg, images, img]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [handle, imageList.length]);

  const hasScroller = enableImageScroller && imageList.length > 1;
  const imageUrl =
    hasScroller && imageList[activeImageIndex]
      ? imageList[activeImageIndex]
      : imageList[0] || img || featuredImage?.url;

      console.log("IMAGE DEBUG", {
  title,
  imageUrl,
  img,
  featuredImage,
  images,
  imageList,
});


  const imageAlt =
    featuredImage?.alt ||
    featuredImage?.altText ||
    (title ? `${title} by ${vendor || 'Aradhya'}` : 'Aradhya product image');
  const currencyCode =
    price?.currencyCode ||
    price?.currency ||
    compareAtPrice?.currencyCode ||
    compareAtPrice?.currency ||
    'INR';

  const displayPrice =
    typeof price === 'string'
      ? price
      : price?.amount != null
        ? formatAmount(price.amount, currencyCode)
        : '';

  const displayComparePrice =
    typeof compareAtPrice === 'string'
      ? compareAtPrice
      : compareAtPrice?.amount != null
        ? formatAmount(compareAtPrice.amount, currencyCode)
        : null;

  let discount = 0;
  if (compareAtPrice?.amount && price?.amount) {
    discount = Math.round(((compareAtPrice.amount - price.amount) / compareAtPrice.amount) * 100);
  }

  const showPrevImage = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveImageIndex((current) =>
      current === 0 ? imageList.length - 1 : current - 1,
    );
  };

  const showNextImage = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveImageIndex((current) =>
      current === imageList.length - 1 ? 0 : current + 1,
    );
  };

  const goToImage = (event, index) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveImageIndex(index);
  };

  return (
    <div className="group relative cursor-pointer bg-white transition-shadow duration-300 hover:shadow-lg">
      {handle ? (
        <Link to={`/product/${handle}`} className="relative block overflow-hidden">
          <div className="aspect-[3/4] w-full bg-gray-100">
            {imageUrl ? (
              <FallbackImage
                src={imageUrl}
                alt={imageAlt}
                title={imageAlt}
                className="h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
                loading="lazy"
                decoding="async"
                fallbackClassName="h-full w-full"
                fallbackText="No Image"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gray-50 text-gray-300">
                No Image
              </div>
            )}
          </div>

          {hasScroller ? (
            <>
              <button
                type="button"
                onClick={showPrevImage}
                className="absolute left-2 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-gray-700 shadow-sm transition hover:bg-white md:opacity-0 md:group-hover:opacity-100"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={showNextImage}
                className="absolute right-2 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-gray-700 shadow-sm transition hover:bg-white md:opacity-0 md:group-hover:opacity-100"
                aria-label="Next image"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/70 px-2 py-1 backdrop-blur-sm">
                {imageList.map((image, index) => (
                  <button
                    key={`${handle || title || 'product'}-dot-${image}`}
                    type="button"
                    onClick={(event) => goToImage(event, index)}
                    className={`h-1.5 w-1.5 rounded-full transition ${activeImageIndex === index ? 'bg-black' : 'bg-gray-400/80'
                      }`}
                    aria-label={`Show image ${index + 1}`}
                  />
                ))}
              </div>
            </>
          ) : null}

          <button
            className="absolute bottom-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md opacity-0 transition-opacity duration-200 hover:bg-pink-50 group-hover:opacity-100"
            onClick={handleWishlistClick}
            aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            <Heart
              className="h-4 w-4"
              fill={inWishlist ? 'currentColor' : 'none'}
              color={inWishlist ? '#ff3f6c' : '#374151'}
            />
          </button>

          {badge && (
            <div className="absolute left-2 top-2 bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {badge}
            </div>
          )}
        </Link>
      ) : (
        <div className="relative block overflow-hidden">
          <div className="flex aspect-[3/4] w-full items-center justify-center bg-gray-100 text-gray-400">
            Product Unavailable
          </div>
        </div>
      )}

      <div className="p-3">
        <h3 className="mb-0.5 truncate text-sm font-bold text-[#282c3f]">{vendor || 'Brand'}</h3>
        <p className="mb-2 truncate text-xs font-normal text-[#535766]">{title || 'Product'}</p>

        <div className="flex items-center gap-2 text-sm">
          <span className="font-bold text-[#282c3f]">{displayPrice}</span>
          {displayComparePrice && (
            <>
              <span className="text-xs text-[#7e818c] line-through decoration-gray-400">
                {displayComparePrice}
              </span>
              <span className="text-xs font-normal text-[#ff905a]">
                {discount > 0 ? `(${discount}% OFF)` : ''}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
