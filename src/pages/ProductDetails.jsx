import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Share2,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import PincodeChecker from '../components/PincodeChecker';
import MobilePageHeader from '../components/MobilePageHeader';
import FrequentlyBoughtTogether from '../components/FrequentlyBoughtTogether';
import ProductGrid from '../components/ProductGrid';
import SizeSelectionModal from '../components/SizeSelectionModal';
import SeoHead from '../components/SeoHead';
import FallbackImage from '../components/FallbackImage';
import { useCatalog } from '../contexts/catalog-context';
import { useCart } from '../contexts/cart-context';
import { useWishlist } from '../contexts/wishlist-context';
import { useNotifications } from '../components/NotificationProvider';
import { useAuth } from '../contexts/auth-context';
import {
  extractOptionValues,
  extractSizeOptions,
  fetchReviews,
  fetchProductsPage,
  fetchProductByHandle,
  fetchProductsFromCollection,
  findVariantForSize,
  formatMoney,
  getProductImageUrl,
  isSizeOptionName,
  submitReview,
  uploadUserImage,
  toProductCard,
  normaliseTokenValue,
  searchProducts,
} from '../lib/api';
import { trackAddToCart } from '../lib/googleAnalytics';
import { appendMetaDebugParams, trackMetaAddToCart } from '../lib/metaPixel';
import {
  buildAggregateRatingSchema,
  buildBreadcrumbSchema,
  buildOrganizationSchema,
  buildProductSchema,
  SITE_URL,
  stripHtml,
  truncateText,
} from '../lib/seo';

const AccordionItem = ({ title, isOpen, onClick, children }) => (
  <div className="border-b border-gray-200">
    <button
      onClick={onClick}
      className="w-full flex justify-between items-center py-4 text-left"
    >
      <span className="text-sm font-bold text-gray-900 uppercase tracking-wider">
        {title}
      </span>
      <span className="text-gray-500 text-sm">{isOpen ? '-' : '+'}</span>
    </button>
    {isOpen && <div className="pb-4 text-sm text-gray-700">{children}</div>}
  </div>
);

const parseReviewPayload = (raw) => {
  if (!raw) return { items: [], summary: null };
  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.reviews)
        ? parsed.reviews
        : Array.isArray(parsed?.items)
          ? parsed.items
          : [];
    const average =
      parsed?.averageRating ??
      parsed?.avgRating ??
      parsed?.ratingAverage ??
      parsed?.rating ??
      parsed?.average ??
      null;
    const count =
      parsed?.reviewCount ??
      parsed?.count ??
      parsed?.totalReviews ??
      parsed?.total ??
      (items.length ? items.length : null);
    return {
      items,
      summary: average != null || count != null ? { average, count } : null,
    };
  } catch {
    return { items: [], summary: null };
  }
};

const buildMetaCartItem = (item, size, quantity = 1) => {
  if (!item) return null;

  const variant = findVariantForSize(item, size);
  const productId = String(
    variant?.sku || variant?.id || item?.id || item?.handle || item?.title || '',
  ).trim();

  return {
    id: variant?.id ?? item?.id ?? item?.handle ?? null,
    productId: productId || null,
    sku: variant?.sku ?? null,
    slug: item?.handle ?? null,
    handle: item?.handle ?? null,
    name: item?.title || item?.handle || 'Product',
    price: Number(variant?.price ?? item?.price ?? 0),
    currency: variant?.currencyCode ?? item?.currencyCode ?? 'INR',
    quantity,
    size: size ?? null,
  };
};

const pickReviewField = (review, keys) => {
  if (!review || typeof review !== 'object') return '';
  for (const key of keys) {
    const value = review[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
};

const formatReviewDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const normalizeMetafieldText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '').trim()).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const readCustomMetafield = (metafields, keys) => {
  const keySet = new Set(keys.map((key) => normaliseTokenValue(key)));
  const fields = Array.isArray(metafields) ? metafields : [];
  const match = fields.find((field) => {
    if (normaliseTokenValue(field?.namespace) !== 'custom') return false;
    return keySet.has(normaliseTokenValue(field?.key));
  });
  return normalizeMetafieldText(match?.value);
};

const SIZE_CHART_IMAGE_KEYS = ['size_chart_image', 'size_chart_url'];
const SIZE_CHART_TEXT_KEYS = ['size_chart_text', 'size_guide'];

const readSizeChartData = (item) => ({
  imageUrl: readCustomMetafield(item?.metafields, SIZE_CHART_IMAGE_KEYS),
  text: readCustomMetafield(item?.metafields, SIZE_CHART_TEXT_KEYS),
});

const buildSizeGuideEntry = (item, fallbackTitle = 'Size Guide') => {
  if (!item) return null;
  const sizeChartData = readSizeChartData(item);
  const sizes = extractSizeOptions(item);
  const hasGuide =
    Boolean(sizeChartData.imageUrl?.trim()) ||
    Boolean(sizeChartData.text?.trim()) ||
    sizes.length > 0;

  if (!hasGuide) return null;

  return {
    handle: item.handle || fallbackTitle.toLowerCase(),
    title: item.title || fallbackTitle,
    imageUrl: sizeChartData.imageUrl,
    text: sizeChartData.text,
    sizes,
  };
};

const ProductDetails = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const outletContext = useOutletContext() || {};
  const openCartDrawer = outletContext?.openCartDrawer ?? (() => { });

  const { getProduct } = useCatalog();
  const { addItem } = useCart();
  const { isWishlisted, toggleItem } = useWishlist();
  const { notify } = useNotifications();
  const { isAuthenticated, getAuthToken, customer } = useAuth();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const recommendedSignatureRef = useRef(null);

  const [images, setImages] = useState([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const [selectedSize, setSelectedSize] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);
  const [openAccordion, setOpenAccordion] = useState('details');
  const [selectedComboItems, setSelectedComboItems] = useState(new Set());
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [recommendedProducts, setRecommendedProducts] = useState([]);
  const [selectedFbtItems, setSelectedFbtItems] = useState(new Set());
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [showSizeChart, setShowSizeChart] = useState(false);
  const [comboSizeGuideEntries, setComboSizeGuideEntries] = useState([]);
  const [loadingComboSizeGuides, setLoadingComboSizeGuides] = useState(false);
  const [liveReviewItems, setLiveReviewItems] = useState([]);
  const [liveReviewSummary, setLiveReviewSummary] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [hasLoadedReviews, setHasLoadedReviews] = useState(false);
  const [reviewSubmitError, setReviewSubmitError] = useState('');
  const [reviewSubmitSuccess, setReviewSubmitSuccess] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewImageUploading, setReviewImageUploading] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    title: '',
    comment: '',
    media: [],
  });
  const comboSizeGuideSignatureRef = useRef('');

  const productHandle = product?.handle || '';
  const productDescriptionText = useMemo(
    () => stripHtml(product?.descriptionHtml || product?.description || ''),
    [product?.description, product?.descriptionHtml],
  );
  const reviewData = useMemo(
    () => parseReviewPayload(product?.reviewsJson),
    [product?.reviewsJson],
  );
  const reviewItems = useMemo(
    () => (hasLoadedReviews ? liveReviewItems : reviewData.items ?? []),
    [hasLoadedReviews, liveReviewItems, reviewData.items],
  );
  const reviewSummary = useMemo(
    () => (hasLoadedReviews ? liveReviewSummary : reviewData.summary),
    [hasLoadedReviews, liveReviewSummary, reviewData.summary],
  );
  const reviewSummaryText = useMemo(() => {
    if (!reviewSummary) return '';
    const averageValue = reviewSummary.average;
    const countValue = reviewSummary.count;
    const averageNumber = Number(averageValue);
    const averageLabel = Number.isFinite(averageNumber)
      ? averageNumber.toFixed(1)
      : averageValue != null
        ? String(averageValue)
        : '';
    const countLabel = countValue != null ? String(countValue) : '';
    if (averageLabel && countLabel) {
      return `Average rating: ${averageLabel}/5 (${countLabel} reviews)`;
    }
    if (averageLabel) return `Average rating: ${averageLabel}/5`;
    if (countLabel) return `${countLabel} reviews`;
    return '';
  }, [reviewSummary]);
  const heroImageUrl = useMemo(() => getProductImageUrl(product), [product]);
  const productSeoImage = useMemo(() => {
    if (!heroImageUrl) return `${SITE_URL}/favicon.png`;
    return heroImageUrl.startsWith('http')
      ? heroImageUrl
      : `${SITE_URL}${heroImageUrl.startsWith('/') ? heroImageUrl : `/${heroImageUrl}`}`;
  }, [heroImageUrl]);
  const productSeoTitle = product?.title
    ? `${product.title} Designer Wear for Men`
    : 'Designer Wear for Men';
  const productSeoDescription = product?.title
    ? truncateText(
      `${product.title} by Aradhya designer wear for men. ${productDescriptionText || 'Discover premium fits, refined fabrics, and polished styling for India.'}`,
      160,
    )
    : 'Aradhya designer wear for men in India with refined product styling.';
  const stylingNote = product?.title
    ? `${product.title} is designed for premium menswear styling with clean structure, refined fabric direction, and versatile Indian dressing in mind.`
    : '';
  const productPageUrl = `${SITE_URL}/product/${product?.handle || slug}`;
  const aggregateRatingSchema = useMemo(
    () => buildAggregateRatingSchema(reviewSummary),
    [reviewSummary],
  );

  useEffect(() => {
    let cancelled = false;

    const loadReviews = async () => {
      if (!product?.id) {
        setLiveReviewItems([]);
        setLiveReviewSummary(null);
        setHasLoadedReviews(false);
        return;
      }
      setReviewLoading(true);
      setHasLoadedReviews(false);
      try {
        const response = await fetchReviews({ productId: product.id });
        if (cancelled) return;
        const normalizedItems = (response?.items || []).map((review) => ({
          ...review,
          author:
            review?.user?.name ||
            review?.user?.email ||
            review?.author ||
            'Customer',
          body: review?.comment || review?.body || '',
          date: review?.createdAt || review?.date || '',
          media: Array.isArray(review?.media) ? review.media : [],
        }));
        setLiveReviewItems(normalizedItems);
        setLiveReviewSummary({
          average: response?.meta?.averageRating ?? null,
          count: response?.meta?.publishedCount ?? normalizedItems.length,
        });
        setHasLoadedReviews(true);
      } catch (loadError) {
        if (!cancelled) {
          console.error('Failed to load product reviews', loadError);
          setHasLoadedReviews(false);
        }
      } finally {
        if (!cancelled) {
          setReviewLoading(false);
        }
      }
    };

    loadReviews();
    return () => {
      cancelled = true;
    };
  }, [product?.id]);

  const handleReviewFieldChange = (field, value) => {
    setReviewForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleReviewImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setReviewSubmitError('Image must be smaller than 10MB.');
      return;
    }

    try {
      setReviewImageUploading(true);
      setReviewSubmitError('');
      
      const token = getAuthToken ? getAuthToken() : null;
      if (!token) {
        throw new Error('Session expired. Please log in again.');
      }

      const data = await uploadUserImage(token, file);
      if (data.url) {
        setReviewForm((prev) => ({
          ...prev,
          media: [...(prev.media || []), { url: data.url }],
        }));
      }
    } catch (err) {
      console.error('Image upload error:', err);
      setReviewSubmitError(err.message || 'Unable to upload image.');
    } finally {
      setReviewImageUploading(false);
      event.target.value = '';
    }
  };

  const handleRemoveReviewImage = (indexToRemove) => {
    setReviewForm((prev) => ({
      ...prev,
      media: (prev.media || []).filter((_, index) => index !== indexToRemove),
    }));
  };

  const handleReviewSubmit = async (event) => {
    event.preventDefault();
    setReviewSubmitError('');
    setReviewSubmitSuccess('');

    if (!isAuthenticated) {
      navigate(`/login?redirect=/product/${productHandle || slug}`);
      return;
    }

    const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
    if (!token) {
      setReviewSubmitError('Session expired. Please log in again.');
      return;
    }

    if (!product?.id) {
      setReviewSubmitError('Unable to submit review right now.');
      return;
    }

    try {
      setReviewSubmitting(true);
      await submitReview(token, {
        productId: product.id,
        rating: Number(reviewForm.rating),
        title: reviewForm.title?.trim() || undefined,
        comment: reviewForm.comment?.trim() || undefined,
        media: (reviewForm.media || []).map((item) => ({ url: item.url })).filter((item) => item.url),
      });

      setReviewForm({
        rating: 5,
        title: '',
        comment: '',
        media: [],
      });
      setReviewSubmitSuccess('Thanks. Your review was submitted for moderation.');
    } catch (submitError) {
      setReviewSubmitError(submitError?.message || 'Unable to submit your review.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const inWishlist = useMemo(
    () => (productHandle ? isWishlisted(productHandle) : false),
    [isWishlisted, productHandle],
  );

  const handleToggleWishlist = () => {
    if (!productHandle) return;
    const nextStateIsAdded = !inWishlist;
    toggleItem(productHandle, toProductCard(product));
    notify({
      title: 'Wishlist',
      message: nextStateIsAdded ? 'Saved to your wishlist.' : 'Removed from wishlist.',
    });
  };

  const handleShare = async () => {
    if (!productHandle) return;
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/product/${productHandle}`
        : `/product/${productHandle}`;
    const shareData = {
      title: product?.title || 'Check this out',
      text: product?.vendor ? `${product.vendor} - ${product.title}` : product?.title,
      url,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        notify({ title: 'Share', message: 'Shared successfully.' });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      notify({ title: 'Link copied', message: 'Product link copied to clipboard.' });
    } catch (err) {
      console.error('Share failed', err);
      notify({
        title: 'Share failed',
        message: 'Unable to share right now. Try copying the link manually.',
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!slug) return;

    async function loadProduct() {
      setLoading(true);
      setError(null);

      const local = getProduct(slug);
      if (local && !cancelled) {
        setProduct(local);
        setLoading(false);
      }

      try {
        const fetched = await fetchProductByHandle(slug);
        if (!cancelled) {
          if (fetched) {
            setProduct(fetched);
            setLoading(false);
          } else {
            if (!local) setError('Product not found');
          }
        }
      } catch (err) {
        console.error(`Failed to load product "${slug}"`, err);
        if (!cancelled && !local) setError('Product unavailable right now.');
      } finally {
        if (!cancelled && !local) setLoading(false);
      }
    }

    loadProduct();
    return () => {
      cancelled = true;
    };
  }, [slug, getProduct]);

  useEffect(() => {
    if (!product) return;
    const media = [];
    const hero = getProductImageUrl(product);
    if (hero) media.push({ url: hero, alt: product.title });
    (product.images || []).forEach((img) => {
      if (img?.url && !media.find((m) => m.url === img.url)) {
        media.push(img);
      }
    });
    setImages(media);
    setActiveImageIndex(0);
    setShowSizeChart(false);
  }, [product]);

  const sizeOptions = useMemo(() => extractSizeOptions(product), [product]);
  const colorOptions = useMemo(() => {
    const primary = extractOptionValues(product, 'Color');
    const alt = extractOptionValues(product, 'Colour');
    const metaColors = Array.isArray(product?.metafields)
      ? product.metafields
        .filter((m) => {
          const key = normaliseTokenValue(m?.key);
          const ns = normaliseTokenValue(m?.namespace);
          return (
            (key === 'color' || key === 'colour') &&
            ['custom', 'details', 'info', 'global', 'theme'].includes(ns)
          );
        })
        .map((m) => m?.value)
        .filter(Boolean)
      : [];
    const merged = [...primary, ...alt, ...metaColors].filter(Boolean);
    return Array.from(new Set(merged));
  }, [product]);
  const hasSizes = sizeOptions.length > 0;
  const hasColors = colorOptions.length > 0;
  const comboItems = useMemo(() => product?.comboItems ?? [], [product]);
  const hasComboItems = comboItems.length > 0;
  const mainSizeGuideEntry = useMemo(
    () => buildSizeGuideEntry(product, 'Product size guide'),
    [product],
  );
  const fallbackComboSizeGuideEntries = useMemo(
    () =>
      comboItems
        .map((item) => buildSizeGuideEntry(item, item?.title || 'Combo item'))
        .filter(Boolean),
    [comboItems],
  );
  const sizeGuideEntries = useMemo(() => {
    const entries = [];

    if (mainSizeGuideEntry) {
      entries.push(mainSizeGuideEntry);
    }

    const comboEntries =
      comboSizeGuideEntries.length > 0
        ? comboSizeGuideEntries
        : fallbackComboSizeGuideEntries;

    comboEntries.forEach((entry) => {
      if (!entry?.handle) return;
      if (entries.some((item) => item.handle === entry.handle)) return;
      entries.push(entry);
    });

    return entries;
  }, [comboSizeGuideEntries, fallbackComboSizeGuideEntries, mainSizeGuideEntry]);
  const showStandaloneSizeChartButton =
    !hasSizes && (hasComboItems || Boolean(mainSizeGuideEntry));
  const enableFrequentlyBoughtTogether = false;
  const isBundleLikeProduct = useMemo(() => {
    if (!product) return false;
    const hasBundleMetafield = Array.isArray(product.metafields)
      ? product.metafields.some((field) => {
        const namespace = normaliseTokenValue(field?.namespace);
        const key = normaliseTokenValue(field?.key);
        return (
          namespace === 'custom' &&
          (key === 'combo_items' || key === 'bundle_items')
        );
      })
      : false;
    if (hasBundleMetafield) return true;

    const bundleText = [
      product.title,
      product.productType,
      Array.isArray(product.tags) ? product.tags.join(' ') : '',
    ]
      .filter(Boolean)
      .join(' ');
    const token = normaliseTokenValue(bundleText);
    return ['bundle', 'combo', 'combination', 'set', 'outfit'].some((keyword) =>
      token.includes(keyword),
    );
  }, [product]);
  const selectedComboList = useMemo(
    () => comboItems.filter((item) => selectedComboItems.has(item.handle)),
    [comboItems, selectedComboItems],
  );
  const comboSelectionLabel = hasComboItems
    ? `${selectedComboList.length}/${comboItems.length} selected`
    : '';

  const selectedVariant = useMemo(() => {
    if (!product) return null;
    const variants = product.variants || [];
    const targetSize = normaliseTokenValue(selectedSize);
    const targetColor = normaliseTokenValue(selectedColor);

    const matchOption = (variant, matcher) =>
      variant?.selectedOptions?.some((opt) => matcher(opt)) ?? false;

    const matchByBoth = variants.find((variant) => {
      const sizeMatch =
        !targetSize ||
        matchOption(
          variant,
          (opt) =>
            isSizeOptionName(opt?.name) &&
            normaliseTokenValue(opt?.value) === targetSize,
        );
      const colorMatch =
        !targetColor ||
        matchOption(
          variant,
          (opt) => {
            const name = normaliseTokenValue(opt?.name);
            return (
              (name.includes('color') || name.includes('colour')) &&
              normaliseTokenValue(opt?.value) === targetColor
            );
          },
        );
      return sizeMatch && colorMatch;
    });

    return matchByBoth || findVariantForSize(product, selectedSize);
  }, [product, selectedSize, selectedColor]);
  const productStructuredData = useMemo(
    () =>
      buildProductSchema({
        name: product?.title,
        description: productSeoDescription,
        image: images.map((image) => image?.url).filter(Boolean),
        sku: String(selectedVariant?.sku || selectedVariant?.id || product?.id || product?.handle || ''),
        url: productPageUrl,
        price: Number(selectedVariant?.price ?? product?.price ?? 0),
        currency: selectedVariant?.currencyCode || product?.currencyCode || 'INR',
        availability:
          selectedVariant?.availableForSale === false
            ? 'https://schema.org/OutOfStock'
            : 'https://schema.org/InStock',
        aggregateRating: aggregateRatingSchema,
        reviews: reviewItems,
      }),
    [
      aggregateRatingSchema,
      images,
      product?.currencyCode,
      product?.handle,
      product?.id,
      product?.price,
      product?.title,
      productPageUrl,
      productSeoDescription,
      reviewItems,
      selectedVariant?.availableForSale,
      selectedVariant?.currencyCode,
      selectedVariant?.id,
      selectedVariant?.price,
      selectedVariant?.sku,
    ],
  );

  const getVariantForOptions = useMemo(() => {
    return (item, { size, color }) => {
      if (!item?.variants?.length) return null;
      const targetSize = normaliseTokenValue(size);
      const targetColor = normaliseTokenValue(color);
      const matches = item.variants.find((variant) => {
        const sizeMatch =
          !targetSize ||
          variant?.selectedOptions?.some(
            (opt) =>
              isSizeOptionName(opt?.name) &&
              normaliseTokenValue(opt?.value) === targetSize,
          );
        const colorMatch =
          !targetColor ||
          variant?.selectedOptions?.some((opt) => {
            const name = normaliseTokenValue(opt?.name);
            return (
              (name.includes('color') || name.includes('colour')) &&
              normaliseTokenValue(opt?.value) === targetColor
            );
          });
        return sizeMatch && colorMatch;
      });
      return matches || null;
    };
  }, []);

  const getAvailability = useMemo(() => {
    return (item, { size, color }) => {
      const variant = getVariantForOptions(item, { size, color });
      if (!variant) {
        const fallback = item?.availableForSale ?? true;
        return { inStock: fallback, lowStock: false, quantity: null };
      }
      const qty = Number.isFinite(variant.quantityAvailable)
        ? variant.quantityAvailable
        : null;
      const inStock = Boolean(variant.availableForSale) && (qty == null || qty > 0);
      const lowStock = inStock && qty != null && qty <= 5;
      return { inStock, lowStock, quantity: qty };
    };
  }, [getVariantForOptions]);

  const price = useMemo(() => {
    if (!product) return '';
    const amount =
      selectedVariant?.price ??
      product.price ??
      product.priceRange?.minVariantPrice?.amount ??
      0;
    const currency =
      selectedVariant?.currencyCode ??
      product.currencyCode ??
      product.priceRange?.minVariantPrice?.currencyCode;
    return formatMoney(amount, currency);
  }, [product, selectedVariant]);

  useEffect(() => {
    if (!product) return;

    const firstVariant = product.variants?.[0];
    const variantSize =
      firstVariant?.selectedOptions?.find((opt) =>
        isSizeOptionName(opt?.name),
      )?.value;
    const variantColor =
      firstVariant?.selectedOptions?.find((opt) => {
        const name = normaliseTokenValue(opt?.name);
        return name.includes('color') || name.includes('colour');
      })?.value;

    if (hasSizes && !selectedSize && sizeOptions.length) {
      const firstAvailable = sizeOptions.find((size) =>
        getAvailability(product, { size, color: selectedColor }).inStock,
      );
      setSelectedSize(firstAvailable || variantSize || sizeOptions[0]);
    }
    if (hasColors && !selectedColor && colorOptions.length) {
      setSelectedColor(variantColor || colorOptions[0]);
    }
  }, [
    product,
    hasSizes,
    sizeOptions,
    selectedSize,
    hasColors,
    colorOptions,
    selectedColor,
    getAvailability,
  ]);

  const sizeAvailability = useMemo(() => {
    if (!product || !hasSizes) return {};
    return sizeOptions.reduce((acc, size) => {
      acc[size] = getAvailability(product, { size, color: selectedColor });
      return acc;
    }, {});
  }, [product, hasSizes, sizeOptions, selectedColor, getAvailability]);

  const firstAvailableSize = useMemo(
    () => sizeOptions.find((size) => sizeAvailability[size]?.inStock) || null,
    [sizeOptions, sizeAvailability],
  );

  const primarySelectedSize = hasSizes
    ? (selectedSize || firstAvailableSize || null)
    : null;

  const currentAvailability = useMemo(() => {
    if (!product) return { inStock: false, lowStock: false, quantity: null };
    if (hasSizes) {
      return primarySelectedSize
        ? sizeAvailability[primarySelectedSize] ?? { inStock: false, lowStock: false, quantity: null }
        : { inStock: false, lowStock: false, quantity: null };
    }
    return getAvailability(product, { size: null, color: selectedColor });
  }, [
    product,
    hasSizes,
    primarySelectedSize,
    sizeAvailability,
    getAvailability,
    selectedColor,
  ]);

  const canAddCurrentProduct = Boolean(product?.handle && currentAvailability?.inStock);

  const toggleAccordion = (key) =>
    setOpenAccordion((current) => (current === key ? null : key));

  const nextImage = () =>
    setActiveImageIndex((idx) => (idx + 1) % Math.max(images.length, 1));
  const prevImage = () =>
    setActiveImageIndex((idx) =>
      images.length ? (idx - 1 + images.length) % images.length : 0,
    );

  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches ? e.targetTouches[0].clientX : e.clientX);
    setIsDragging(true);
  };

  const onTouchMove = (e) => {
    if (!isDragging) return;
    setTouchEnd(e.targetTouches ? e.targetTouches[0].clientX : e.clientX);
  };

  const onTouchEnd = () => {
    setIsDragging(false);
    if (touchStart === null || touchEnd === null) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance) nextImage();
    else if (distance < -minSwipeDistance) prevImage();
    setTouchStart(null);
    setTouchEnd(null);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') prevImage();
      if (e.key === 'ArrowRight') nextImage();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, activeImageIndex]);

  const handleAddToCart = () => {
    if (!product?.handle) return;
    const primarySize = primarySelectedSize;

    if (!canAddCurrentProduct && !hasComboItems) {
      notify({
        title: 'Out of stock',
        message: hasSizes
          ? 'Selected size is not available. Please choose another size.'
          : 'This product is not available right now.',
      });
      return;
    }

    if (hasComboItems) {
      if (selectedComboList.length === 0) {
        notify({
          title: 'Select items',
          message: 'Choose at least one item from this combo.',
        });
        return;
      }
      setShowSizeModal(true);
      return;
    }

    if (isBundleLikeProduct) {
      notify({
        title: 'Bundle unavailable',
        message: 'Single-product selection is not linked for this bundle yet.',
      });
      return;
    }

    const analyticsItem = buildMetaCartItem(product, primarySize, 1);
    const analyticsValue = Number(selectedVariant?.price ?? product?.price ?? 0);
    const analyticsCurrency =
      selectedVariant?.currencyCode ?? product?.currencyCode ?? 'INR';

    // Otherwise, just add main product and go to cart
    addItem(product.handle, { size: primarySize, quantity: 1 });
    console.info('[GA4] add_to_cart event firing', {
      value: analyticsValue,
      currency: analyticsCurrency,
      items: analyticsItem ? [analyticsItem] : [],
    });
    trackAddToCart(
      analyticsItem,
      {
        value: analyticsValue,
        currency: analyticsCurrency,
      },
      { deferUntilNextPage: true },
    );
    trackMetaAddToCart(analyticsItem, {
      value: analyticsValue,
      currency: analyticsCurrency,
    });
    navigate(appendMetaDebugParams('/cart'));
  };

  const handleOpenSizeChart = () => {
    if (!mainSizeGuideEntry && !hasComboItems) {
      notify({
        title: 'Size chart unavailable',
        message: 'No size chart is available for this product yet.',
      });
      return;
    }
    setShowSizeChart(true);
  };

  useEffect(() => {
    if (!showSizeChart || !hasComboItems) return undefined;

    const signature = comboItems
      .map((item) => item?.handle)
      .filter(Boolean)
      .sort()
      .join('|');

    if (!signature) {
      setComboSizeGuideEntries([]);
      comboSizeGuideSignatureRef.current = '';
      return undefined;
    }

    if (comboSizeGuideSignatureRef.current === signature) {
      return undefined;
    }

    let cancelled = false;

    const loadComboSizeGuides = async () => {
      setLoadingComboSizeGuides(true);
      try {
        const hydratedItems = await Promise.all(
          comboItems.map(async (item) => {
            if (!item?.handle) return item;
            try {
              const fullProduct = await fetchProductByHandle(item.handle);
              return fullProduct || item;
            } catch {
              return item;
            }
          }),
        );

        if (cancelled) return;

        setComboSizeGuideEntries(
          hydratedItems
            .map((item) => buildSizeGuideEntry(item, item?.title || 'Combo item'))
            .filter(Boolean),
        );
        comboSizeGuideSignatureRef.current = signature;
      } finally {
        if (!cancelled) {
          setLoadingComboSizeGuides(false);
        }
      }
    };

    loadComboSizeGuides();
    return () => {
      cancelled = true;
    };
  }, [comboItems, hasComboItems, showSizeChart]);

  const handleConfirmSizes = (itemsWithSizes) => {
    const primarySize = primarySelectedSize;

    if (hasComboItems) {
      const metaItems = itemsWithSizes
        .map(({ handle, size, quantity }) => {
          const comboItem = comboItems.find((item) => item?.handle === handle);
          return buildMetaCartItem(comboItem, size, quantity ?? 1);
        })
        .filter(Boolean);

      itemsWithSizes.forEach(({ handle, size, quantity }) => {
        addItem(handle, { size, quantity: quantity ?? 1 });
      });

      if (metaItems.length) {
        const totalValue = metaItems.reduce(
          (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
          0,
        );
        const totalCurrency = metaItems[0]?.currency || 'INR';

        console.info('[GA4] add_to_cart event firing', {
          value: totalValue,
          currency: totalCurrency,
          items: metaItems,
        });
        trackAddToCart(
          metaItems,
          {
            value: totalValue,
            currency: totalCurrency,
          },
          { deferUntilNextPage: true },
        );
        trackMetaAddToCart(metaItems, {
          value: totalValue,
          currency: totalCurrency,
        });
      }
    } else {
      const analyticsItem = buildMetaCartItem(product, primarySize, 1);
      const analyticsValue = Number(selectedVariant?.price ?? product?.price ?? 0);
      const analyticsCurrency =
        selectedVariant?.currencyCode ?? product?.currencyCode ?? 'INR';

      // Add the main product for single-product pages.
      addItem(product.handle, { size: primarySize, quantity: 1 });
      console.info('[GA4] add_to_cart event firing', {
        value: analyticsValue,
        currency: analyticsCurrency,
        items: analyticsItem ? [analyticsItem] : [],
      });
      trackAddToCart(
        analyticsItem,
        {
          value: analyticsValue,
          currency: analyticsCurrency,
        },
        { deferUntilNextPage: true },
      );
      trackMetaAddToCart(analyticsItem, {
        value: analyticsValue,
        currency: analyticsCurrency,
      });
    }

    // Close & redirect after cart updates.
    setShowSizeModal(false);
    navigate(appendMetaDebugParams('/cart'));
  };

  useEffect(() => {
    if (!hasComboItems) {
      setSelectedComboItems(new Set());
      return;
    }
    const next = new Set(
      comboItems.map((item) => item?.handle).filter(Boolean),
    );
    setSelectedComboItems(next);
  }, [comboItems, hasComboItems]);

  useEffect(() => {
    if (!enableFrequentlyBoughtTogether) {
      return undefined;
    }

    let cancelled = false;

    // Helper to check if product is a combo
    const isComboProduct = (item) => {
      const productType = String(item?.productType || item?.type || '').toLowerCase();
      const title = String(item?.title || '').toLowerCase();
      const tags = Array.isArray(item?.tags) ? item.tags.map((tag) => String(tag).toLowerCase()) : [];
      return (
        productType.includes('bundle') ||
        productType.includes('combo') ||
        productType.includes('set') ||
        title.includes('bundle') ||
        title.includes('combo') ||
        title.includes('combination') ||
        title.includes('set') ||
        tags.some((tag) => tag.includes('bundle')) ||
        tags.some((tag) => tag.includes('combo')) ||
        tags.some((tag) => tag.includes('combination')) ||
        tags.some((tag) => tag.includes('set'))
      );
    };

    // Helper to check category
    const isAllowedCategory = (item) => {
      const type = String(item?.productType || item?.type || '').toLowerCase();
      const title = String(item?.title || '').toLowerCase();
      // Also check tags just in case
      const tags = Array.isArray(item?.tags) ? item.tags.map(t => String(t).toLowerCase()) : [];

      const allowed = ['casual shirt', 'pant', 't-shirt', 'shirt', 'jeans', 'trousers', 'tshirt', 'tee', 'polo', 'shoe', 'sneaker', 'footwear', 'combo', 'combination', 'set'];

      return allowed.some(cat =>
        type.includes(cat) ||
        title.includes(cat) ||
        tags.some(t => t.includes(cat))
      );
    };

    const getCategory = (item) => {
      const text = (String(item?.productType || '') + ' ' + String(item?.title || '') + ' ' + (item?.tags || []).join(' ')).toLowerCase();
      if (text.includes('combo') || text.includes('combination')) return 'combo';
      if (text.includes('pant') || text.includes('trouser') || text.includes('jeans')) return 'bottom';
      if (text.includes('shirt') || text.includes('t-shirt') || text.includes('tee') || text.includes('polo') || text.includes('top')) return 'top';
      if (text.includes('shoe') || text.includes('sneaker') || text.includes('footwear')) return 'shoe';
      return 'other';
    };

    async function loadRelated() {
      if (!product) return;
      if (hasComboItems || isBundleLikeProduct) {
        setRelatedProducts([]);
        return;
      }

      const currentCat = getCategory(product);

      // Define limits: "Under like this combo" -> likely means 1 bottom, 1 shoe, 1 other top?
      // User said: "if single tshirt then show pants and shirt and shoes"
      // So targeting: Bottoms, Shoes, and other Tops (maybe layering).

      // 1. Check if CURRENT product is in allowed category
      if (!isAllowedCategory(product)) {
        setRelatedProducts([]);
        return;
      }

      let related = [];

      try {
        let pool = [];
        if (product.productType) {
          const typeRecs = await searchProducts(product.productType, 24);
          pool = typeRecs;
        }

        if (pool.length < 12) {
          const { items } = await fetchProductsPage({ limit: 36, page: 1 });
          pool = [...pool, ...items];
        }

        // Helper to shuffle array
        const shuffle = (array) => array.sort(() => 0.5 - Math.random());

        // Candidates: Exclude current, exclude combos (from being recommended), ensure available
        const candidates = pool.filter((item) =>
          item?.handle &&
          item.handle !== product.handle &&
          !isComboProduct(item)
        );

        // Bucket candidates
        const buckets = {
          top: [],
          bottom: [],
          shoe: [],
          other: []
        };

        candidates.forEach(item => {
          buckets[getCategory(item)].push(item);
        });

        // Determine priority of categories to pick from
        let priorityCats = [];
        if (currentCat === 'top') {
          // T-shirt -> suggest Pants, Shoes
          priorityCats = ['bottom', 'shoe', 'top', 'other'];
        } else if (currentCat === 'bottom') {
          // Pant -> suggest Tops, Shoes
          priorityCats = ['top', 'shoe', 'bottom', 'other'];
        } else if (currentCat === 'shoe') {
          // Shoes -> suggest Tops, Bottoms
          priorityCats = ['top', 'bottom', 'shoe', 'other'];
        } else if (currentCat === 'combo') {
          // Combo -> suggest Shoes first, then others
          priorityCats = ['shoe', 'top', 'bottom', 'other'];
        } else {
          // Other -> suggest mix
          priorityCats = ['top', 'bottom', 'shoe', 'other'];
        }

        const selection = [];
        const seenHandles = new Set();

        // 1. Try to pick one unique product from each priority category
        priorityCats.forEach(cat => {
          if (selection.length >= 3) return;
          const pool = shuffle(buckets[cat]);
          const item = pool.find(p => !seenHandles.has(p.handle));
          if (item) {
            selection.push(item);
            seenHandles.add(item.handle);
          }
        });

        // 2. If still need items, fill with randoms from any allowed complementary category
        if (selection.length < 3) {
          const leftovers = shuffle(candidates.filter(p => !seenHandles.has(p.handle)));
          for (const item of leftovers) {
            if (selection.length >= 3) break;
            selection.push(item);
            seenHandles.add(item.handle);
          }
        }

        // 3. Sort the final selection: Top -> Bottom -> Shoe -> Other
        const sortOrder = ['top', 'bottom', 'shoe', 'other'];
        selection.sort((a, b) => {
          const catA = getCategory(a);
          const catB = getCategory(b);
          return sortOrder.indexOf(catA) - sortOrder.indexOf(catB);
        });

        related = selection;

        // Pre-select first item if available
        if (!cancelled && related.length > 0) {
          setSelectedFbtItems(new Set([related[0].handle]));
        }

      } catch (err) {
        console.warn('Failed to load products for Frequently Bought Together', err);
      }

      if (!cancelled && related.length) {
        setRelatedProducts(related);
      }
    }
    loadRelated();
    return () => {
      cancelled = true;
    };
  }, [product, hasComboItems, isBundleLikeProduct, enableFrequentlyBoughtTogether]);

  // Fetch "You Might Also Like" products (Same Collection or Category)
  useEffect(() => {
    let cancelled = false;
    async function loadRecommended() {
      if (!product) return;

      try {
        const signature = [
          product.handle,
          product.collections?.[0]?.handle ?? '',
          product.productType ?? '',
        ].join('|');
        if (recommendedSignatureRef.current === signature) return;
        recommendedSignatureRef.current = signature;

        let recs = [];
        // 1. Try Primary Collection
        const primaryCollection = product.collections?.[0]?.handle;
        if (primaryCollection) {
          const items = await fetchProductsFromCollection(primaryCollection, 8);
          recs = items;
        }

        // 2. Fallback to Search by Type if no collection or few results
        if ((!recs || recs.length < 4) && product.productType) {
          const typeRecs = await searchProducts(product.productType, 8);
          recs = [...recs, ...typeRecs];
        }

        // 3. Fallback to generic "Latest" if still nothing (paged list)
        if (!recs || recs.length < 4) {
          const { items } = await fetchProductsPage({ limit: 12, page: 1 });
          recs = [...recs, ...items];
        }

        if (cancelled) return;

        // Filter out current product and duplicates
        const unique = [];
        const seen = new Set();
        seen.add(product.handle); // Exclude current

        recs.forEach(item => {
          if (item?.handle && !seen.has(item.handle)) {
            unique.push(item);
            seen.add(item.handle);
          }
        });

        // Limit to 4 for desktop, 4 for mobile (or 8?)
        // Let's show 4-8.
        setRecommendedProducts(unique.slice(0, 8).map(toProductCard));

      } catch (e) {
        console.warn('Failed to load recommended products', e);
      }
    }
    loadRecommended();
    return () => { cancelled = true; };
  }, [product]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading product...</div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-gray-700">{error || 'Product not found.'}</p>
        <button
          onClick={() => navigate('/products')}
          className="px-4 py-2 text-sm font-bold border border-gray-900 uppercase tracking-[0.18em]"
        >
          Back to products
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen pb-40">
      <SeoHead
        title={productSeoTitle}
        description={productSeoDescription}
        keywords={['Aradhya product', product?.title, product?.vendor || 'Aradhya'].filter(Boolean)}
        canonicalPath={`/product/${product.handle || slug}`}
        type="product"
        image={productSeoImage}
        imageAlt={product?.title || 'Product image'}
        structuredData={[
          buildOrganizationSchema(),
          buildBreadcrumbSchema([
            {
              name: 'Home',
              url: SITE_URL,
            },
            {
              name: 'Products',
              url: `${SITE_URL}/products`,
            },
            ...(product?.collections?.[0]?.title
              ? [
                {
                  name: product.collections[0].title,
                  url: `${SITE_URL}/collections/${product.collections[0].handle}`,
                },
              ]
              : []),
            {
              name: product.title,
              url: productPageUrl,
            },
          ]),
          productStructuredData,
        ]}
      />

      {/* Mobile Top Section: Image, Overlay Header */}
      <div className="lg:hidden relative w-full bg-white mb-4">
        {/* Overlay Header */}
        <div className="absolute top-0 left-0 right-0 z-20 p-4 flex justify-between items-start pointer-events-none">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center pointer-events-auto"
          >
            <ChevronLeft className="w-8 h-8 text-black" />
          </button>
          <div className="flex flex-col gap-4 pointer-events-auto">
            <button onClick={openCartDrawer} className="w-10 h-10 flex items-center justify-center relative">
              <ShoppingBag className="w-6 h-6 text-black" />
              {outletContext?.cartItemCount > 0 && (
                <span className="absolute top-0 right-0 bg-red-600 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full">
                  {outletContext.cartItemCount}
                </span>
              )}
            </button>
            <button
              className="w-10 h-10 flex items-center justify-center"
              onClick={handleToggleWishlist}
              aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              <Heart
                className="w-6 h-6"
                fill={inWishlist ? 'currentColor' : 'none'}
                color={inWishlist ? '#ff3f6c' : '#111827'}
              />
            </button>
            <button
              className="w-10 h-10 flex items-center justify-center"
              onClick={handleShare}
              aria-label="Share this product"
            >
              <Share2 className="w-6 h-6 text-black" />
            </button>
          </div>
        </div>

        {/* Mobile Image Carousel - Auto Height for full view */}
        <div 
          className="relative w-full overflow-hidden min-h-[400px] touch-pan-y select-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={onTouchStart}
          onMouseMove={onTouchMove}
          onMouseUp={onTouchEnd}
          onMouseLeave={onTouchEnd}
        >
          {images.length > 0 ? (
            <FallbackImage
              src={images[activeImageIndex]?.url}
              alt={`${product.title} by Aradhya designer wear for men`}
              className="w-full h-auto object-cover"
              fallbackClassName="w-full aspect-[3/4]"
            />
          ) : (
            <div className="w-full aspect-[3/4] flex items-center justify-center text-gray-200 bg-gray-50">
              No Image
            </div>
          )}

          {/* Navigation Zones */}
          {images.length > 1 && (
            <>
              <div
                className="absolute top-0 left-0 w-1/3 h-full z-10"
                onClick={(e) => { e.stopPropagation(); prevImage(); }}
              />
              <div
                className="absolute top-0 right-0 w-1/3 h-full z-10"
                onClick={(e) => { e.stopPropagation(); nextImage(); }}
              />
            </>
          )}

          {/* Dots */}
          {images.length > 1 && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 z-20 pointer-events-none">
              {images.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${idx === activeImageIndex ? 'bg-black w-3' : 'bg-black/20'
                    }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hidden lg:block">
        <MobilePageHeader
          title={product?.title}
          onSearch={() => document.dispatchEvent(new CustomEvent('open-search'))}
        />
      </div>

      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
          <div className="hidden lg:flex lg:w-[62%] gap-5 lg:min-h-[70vh] lg:max-h-[85vh] h-auto lg:sticky lg:top-24">
            <div className="hidden lg:flex flex-col gap-4 w-24 overflow-y-auto no-scrollbar py-1">
              {images.map((img, idx) => (
                <button
                  key={img.url || idx}
                  onClick={() => setActiveImageIndex(idx)}
                  className={`w-full aspect-[3/4] border transition-all ${activeImageIndex === idx
                    ? 'border-black opacity-100'
                    : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                >
                  <FallbackImage
                    src={img.url}
                    alt={img.alt || `${product.title} designer wear for men by Aradhya`}
                    className="w-full h-full object-contain bg-white"
                    fallbackClassName="w-full h-full"
                    fallbackText="No Image"
                  />
                </button>
              ))}
            </div>

            <div 
              className="flex-1 relative bg-gray-50 h-full overflow-hidden group rounded select-none touch-pan-y"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onMouseDown={onTouchStart}
              onMouseMove={onTouchMove}
              onMouseUp={onTouchEnd}
              onMouseLeave={onTouchEnd}
            >
              {images.length ? (
                <FallbackImage
                  src={images[activeImageIndex]?.url}
                  alt={`${product.title} by Aradhya designer wear for men`}
                  className="w-full h-full object-contain object-center bg-white"
                  fallbackClassName="w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  No image
                </div>
              )}

              {images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}

              <div className="absolute top-4 right-4 flex flex-col gap-3">
                <button
                  className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
                  onClick={handleToggleWishlist}
                  aria-label={inWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
                >
                  <Heart
                    className="w-5 h-5"
                    fill={inWishlist ? 'currentColor' : 'none'}
                    color={inWishlist ? '#ff3f6c' : '#374151'}
                  />
                </button>
                <button
                  className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
                  onClick={handleShare}
                  aria-label="Share this product"
                >
                  <Share2 className="w-5 h-5 text-gray-700" />
                </button>
              </div>
            </div>
          </div>

          <div className="lg:w-[38%] pt-2 lg:pl-2">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-gray-500">Aradhya</p>
                <h1 className="text-xl md:text-2xl font-semibold text-gray-900">
                  {product.title}
                </h1>
                {stylingNote ? (
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600">
                    {stylingNote}
                  </p>
                ) : null}
              </div>
              <span className="text-xl font-bold text-gray-900">{price}</span>
            </div>

            {hasColors && (
              <div className="mb-3 text-sm text-gray-700">
                <span className="font-semibold">Color: </span>
                <span>{selectedColor || colorOptions[0]}</span>
              </div>
            )}

            {hasColors && (
              <div className="mb-8">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Colors
                  </span>
                  <span className="text-xs text-gray-500">
                    {colorOptions.length} option{colorOptions.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {colorOptions.map((color) => {
                    const active = selectedColor === color;
                    return (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={`flex items-center gap-2 px-3 h-10 border text-sm font-medium transition-all ${active
                          ? 'border-black bg-black text-white'
                          : 'border-gray-300 text-gray-900 hover:border-black'
                          }`}
                      >
                        <span
                          className="w-4 h-4 rounded-full border border-gray-200"
                          style={{ backgroundColor: color.toLowerCase() }}
                          aria-hidden
                        />
                        {color}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {hasSizes && (
              <div className="mb-8">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Sizes
                  </span>
                  <button
                    type="button"
                    onClick={handleOpenSizeChart}
                    className="text-xs font-medium text-gray-500 underline hover:text-black"
                  >
                    SIZE CHART
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {sizeOptions.map((size) => {
                    const availability = sizeAvailability[size];
                    const isOut = availability ? !availability.inStock : false;
                    const isSelected = selectedSize === size;
                    const sizeButtonClasses = isOut
                      ? 'border-gray-300 bg-gray-100 text-gray-600 line-through cursor-not-allowed hover:border-gray-300'
                      : isSelected
                        ? 'border-black bg-black text-white'
                        : 'border-gray-300 text-gray-900 hover:border-black';
                    return (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        disabled={isOut}
                        className={`relative min-w-[48px] h-10 px-2 border flex items-center justify-center text-sm font-medium transition-all ${sizeButtonClasses}`}
                        title={isOut ? 'Out of stock' : availability?.lowStock ? 'Low stock' : 'In stock'}
                      >
                        {size}
                        {isOut ? (
                          <>
                            <span
                              className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[120%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-gray-500"
                              aria-hidden="true"
                            />
                            <span
                              className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-rose-500"
                              aria-hidden="true"
                            />
                          </>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {selectedSize && !sizeAvailability[selectedSize]?.inStock ? (
                  <p className="mt-3 text-xs text-rose-600">Out of stock</p>
                ) : selectedSize && sizeAvailability[selectedSize]?.lowStock ? (
                  <p className="mt-3 text-xs text-orange-600">
                    {Number.isFinite(sizeAvailability[selectedSize]?.quantity)
                      ? `Only ${sizeAvailability[selectedSize].quantity} left`
                      : 'Low stock'}
                  </p>
                ) : null}
                <p className="text-xs text-orange-600 mt-3 flex items-center gap-1">
                  <Truck className="w-3 h-3" /> FREE 1-2 day delivery on 5k+
                  pincodes
                </p>
              </div>
            )}

            {showStandaloneSizeChartButton && (
              <div className="mb-6">
                <button
                  type="button"
                  onClick={handleOpenSizeChart}
                  className="text-xs font-medium text-gray-500 underline hover:text-black"
                >
                  SIZE CHART
                </button>
              </div>
            )}

            {/* Desktop Add to Bag - Hidden on Mobile, rendered as sticky footer instead */}
            <button
              onClick={handleAddToCart}
              disabled={!hasComboItems && !canAddCurrentProduct}
              className="hidden lg:block w-full bg-black text-white font-bold text-sm py-4 uppercase tracking-widest hover:bg-gray-900 transition-colors mb-6 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            >
              {!hasComboItems && !canAddCurrentProduct ? 'Out of Stock' : 'Add to Bag'}
            </button>



            {hasComboItems && (
              <FrequentlyBoughtTogether
                title="Choose items in this combo"
                subtitle={comboSelectionLabel}
                products={comboItems}
                selectedHandles={selectedComboItems}
                onSelectionChange={setSelectedComboItems}
              />
            )}

            {isBundleLikeProduct && !hasComboItems ? (
              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Bundle item selection is not available for this product yet.
              </div>
            ) : null}

            {enableFrequentlyBoughtTogether && relatedProducts.length > 0 && !hasComboItems && (
              <FrequentlyBoughtTogether
                products={relatedProducts}
                selectedHandles={selectedFbtItems}
                onSelectionChange={setSelectedFbtItems}
              />
            )}






            {showSizeChart && (
              <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                <div className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl">
                  <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                    <p className="text-sm font-bold uppercase tracking-wide text-gray-900">
                      Size Chart
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowSizeChart(false)}
                      className="rounded border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                    >
                      Close
                    </button>
                  </div>
                  <div className="max-h-[75vh] space-y-4 overflow-y-auto p-4">
                    {loadingComboSizeGuides ? (
                      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                        Loading bundle size guide...
                      </div>
                    ) : null}

                    {!loadingComboSizeGuides && sizeGuideEntries.length === 0 ? (
                      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                        No size chart is available for this product yet.
                      </div>
                    ) : null}

                    {sizeGuideEntries.map((entry) => (
                      <div
                        key={entry.handle}
                        className="space-y-3 rounded border border-gray-200 bg-gray-50 p-3"
                      >
                        {sizeGuideEntries.length > 1 ? (
                          <p className="text-xs font-bold uppercase tracking-wide text-gray-900">
                            {entry.title}
                          </p>
                        ) : null}
                        {entry.imageUrl ? (
                          <div className="overflow-hidden rounded border border-gray-200 bg-white p-2">
                            <FallbackImage
                              src={entry.imageUrl}
                              alt={`${entry.title} size chart`}
                              className="max-h-[60vh] w-full object-contain"
                              fallbackClassName="min-h-48 w-full"
                            />
                          </div>
                        ) : null}
                        {entry.sizes.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                              Available Sizes
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {entry.sizes.map((size) => (
                                <span
                                  key={`${entry.handle}-${size}`}
                                  className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700"
                                >
                                  {size}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {entry.text ? (
                          <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-700 whitespace-pre-line">
                            {entry.text}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <SizeSelectionModal
              isOpen={showSizeModal}
              onClose={() => setShowSizeModal(false)}
              items={
                hasComboItems
                  ? selectedComboList
                  : []
              }
              onConfirm={handleConfirmSizes}
            />

            <div className="border-t border-gray-200">
              <AccordionItem
                title="Details"
                isOpen={openAccordion === 'details'}
                onClick={() => toggleAccordion('details')}
              >
                <div
                  dangerouslySetInnerHTML={{
                    __html: product.descriptionHtml || product.description,
                  }}
                />
              </AccordionItem>

              <AccordionItem
                title="Delivery"
                isOpen={openAccordion === 'delivery'}
                onClick={() => toggleAccordion('delivery')}
              >
                <PincodeChecker />
              </AccordionItem>

              <AccordionItem
                title="Returns"
                isOpen={openAccordion === 'returns'}
                onClick={() => toggleAccordion('returns')}
              >
                <p>
                  Easy 14 days returns and exchanges. Return Policies may vary
                  based on products and promotions.
                </p>
              </AccordionItem>

              <AccordionItem
                title="Review"
                isOpen={openAccordion === 'reviews'}
                onClick={() => toggleAccordion('reviews')}
              >
                {reviewSummaryText ? (
                  <p className="mb-3 text-sm text-gray-600">{reviewSummaryText}</p>
                ) : null}
                {reviewLoading ? (
                  <p className="text-sm text-gray-500 mb-3">Loading reviews...</p>
                ) : null}
                {reviewItems.length ? (
                  <div className="space-y-3">
                    {reviewItems.slice(0, 3).map((review, index) => {
                      const reviewObject =
                        review && typeof review === 'object' ? review : { body: review };
                      const author =
                        pickReviewField(reviewObject, ['author', 'name', 'reviewer', 'customer', 'user']) ||
                        'Anonymous';
                      const body = pickReviewField(reviewObject, [
                        'body',
                        'text',
                        'content',
                        'review',
                        'comment',
                        'message',
                      ]);
                      const ratingValue = pickReviewField(reviewObject, [
                        'rating',
                        'stars',
                        'score',
                        'value',
                      ]);
                      const ratingNumber = Number(ratingValue);
                      const ratingLabel = ratingValue
                        ? Number.isFinite(ratingNumber)
                          ? `Rating: ${ratingNumber}/5`
                          : `Rating: ${ratingValue}`
                        : '';
                      const rawDate = pickReviewField(reviewObject, [
                        'created_at',
                        'createdAt',
                        'date',
                        'created',
                      ]);
                      const formattedDate = formatReviewDate(rawDate);
                      const reviewMedia = Array.isArray(reviewObject.media) ? reviewObject.media : [];

                      return (
                        <div key={`review-${index}`} className="rounded-lg border border-gray-200 p-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            <span className="font-semibold text-gray-700">{author}</span>
                            {ratingLabel ? <span>{ratingLabel}</span> : null}
                            {formattedDate ? <span>{formattedDate}</span> : null}
                          </div>
                          {body ? <p className="mt-2 text-sm text-gray-700">{body}</p> : null}
                          {reviewMedia.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {reviewMedia.slice(0, 6).map((media, mediaIndex) => (
                                <a
                                  key={media.id || media.url || `review-media-${mediaIndex}`}
                                  href={media.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block h-16 w-16 overflow-hidden rounded border border-gray-200 bg-gray-50"
                                >
                                  <FallbackImage
                                    src={media.url}
                                    alt="Customer review"
                                    className="h-full w-full object-cover"
                                    fallbackClassName="h-full w-full"
                                    fallbackText="No Image"
                                  />
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">No reviews yet.</p>
                )}

                <div className="mt-5 border-t border-gray-200 pt-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Write a review</h4>
                  {isAuthenticated ? (
                    <form onSubmit={handleReviewSubmit} className="space-y-3">
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-2">Rating</p>
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((value) => (
                            <button
                              key={`rating-${value}`}
                              type="button"
                              onClick={() => handleReviewFieldChange('rating', value)}
                              className={`h-9 w-9 rounded border text-sm font-semibold transition ${Number(reviewForm.rating) === value
                                ? 'border-black bg-black text-white'
                                : 'border-gray-300 text-gray-700 hover:border-gray-900'
                                }`}
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          Title (optional)
                        </label>
                        <input
                          type="text"
                          value={reviewForm.title}
                          onChange={(event) => handleReviewFieldChange('title', event.target.value)}
                          placeholder="Short headline"
                          maxLength={150}
                          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          Review
                        </label>
                        <textarea
                          value={reviewForm.comment}
                          onChange={(event) => handleReviewFieldChange('comment', event.target.value)}
                          placeholder="Share your experience"
                          maxLength={1000}
                          rows={4}
                          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          Photos (optional)
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          {(reviewForm.media || []).map((media, index) => (
                            <div
                              key={media.url || `review-upload-${index}`}
                              className="relative h-16 w-16 overflow-hidden rounded border border-gray-200 bg-gray-50"
                            >
                              <FallbackImage
                                src={media.url}
                                alt="Review upload"
                                className="h-full w-full object-cover"
                                fallbackClassName="h-full w-full"
                                fallbackText="No Image"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveReviewImage(index)}
                                className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          {(reviewForm.media || []).length < 6 ? (
                            <label className="flex h-16 min-w-28 cursor-pointer items-center justify-center rounded border border-dashed border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:border-gray-900">
                              {reviewImageUploading ? 'Uploading...' : 'Upload photo'}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={reviewImageUploading}
                                onChange={handleReviewImageUpload}
                              />
                            </label>
                          ) : null}
                        </div>
                      </div>

                      {reviewSubmitError ? (
                        <p className="text-xs text-rose-600">{reviewSubmitError}</p>
                      ) : null}
                      {reviewSubmitSuccess ? (
                        <p className="text-xs text-emerald-600">{reviewSubmitSuccess}</p>
                      ) : null}

                      <button
                        type="submit"
                        disabled={reviewSubmitting || reviewImageUploading || !reviewForm.comment.trim()}
                        className="rounded bg-black px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-gray-900 disabled:cursor-not-allowed disabled:bg-gray-300"
                      >
                        {reviewSubmitting ? 'Submitting...' : reviewImageUploading ? 'Uploading...' : 'Submit Review'}
                      </button>
                      {customer?.email ? (
                        <p className="text-xs text-gray-500">
                          Posting as {customer.name || customer.email}
                        </p>
                      ) : null}
                    </form>
                  ) : (
                    <div className="text-sm text-gray-600">
                      <Link
                        to={`/login?redirect=/product/${productHandle || slug}`}
                        className="font-semibold text-gray-900 underline hover:no-underline"
                      >
                        Sign in
                      </Link>{' '}
                      to submit a review.
                    </div>
                  )}
                </div>
              </AccordionItem>
            </div>
          </div>
        </div>
      </div>

      {/* You Might Also Like Section - Moved Outside */}
      {recommendedProducts.length > 0 && (
        <div className="mb-8">
          <ProductGrid
            title="You Might Also Like"
            products={recommendedProducts}
            ctaHref={`/collections/${product?.collections?.[0]?.handle || 'all'}`}
            ctaLabel="View Collection"
          />
        </div>
      )}

      <div className="fixed bottom-[48px] left-0 right-0 z-40 bg-white/90 backdrop-blur-md px-4 pb-3 pt-3 flex items-center justify-center border-t border-gray-100 shadow-[0_-8px_20px_rgba(0,0,0,0.06)] lg:hidden">
        <button
          onClick={handleAddToCart}
          disabled={!hasComboItems && !canAddCurrentProduct}
          className="flex h-12 w-[90%] md:w-[60%] lg:w-full max-w-sm items-center justify-center rounded-full bg-black text-white shadow-lg transition-transform active:scale-[0.98] hover:bg-gray-900 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
        >
          <span className="text-sm font-bold uppercase tracking-[0.15em]">
            {!hasComboItems && !canAddCurrentProduct ? 'Out of Stock' : 'Add to Bag'}
          </span>
        </button>
      </div>

    </div>
  );
};

export default ProductDetails;
