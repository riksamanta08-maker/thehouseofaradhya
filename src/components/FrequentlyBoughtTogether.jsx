import React from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { formatMoney } from '../lib/api';
import FallbackImage from './FallbackImage';

/**
 * FrequentlyBoughtTogether - Professional section for related products
 * @param {Object} props
 * @param {Array} props.products - Array of product objects from same collection
 * @param {Function} props.openCartDrawer - Callback to open cart drawer after adding items
 */
const FrequentlyBoughtTogether = ({
    products = [],
    selectedHandles = new Set(),
    onSelectionChange,
    title = 'Frequently Bought Together',
    subtitle
}) => {

    // Toggle selection helper
    const toggleSelection = (handle) => {
        const next = new Set(selectedHandles);
        if (next.has(handle)) {
            next.delete(handle);
        } else {
            next.add(handle);
        }
        onSelectionChange(next);
    };

    if (!products.length) return null;

    return (
        <div className="bg-white py-6 mb-6 border-t border-gray-100">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                    {title}
                </h2>
                {subtitle ? (
                    <span className="text-xs text-gray-500">{subtitle}</span>
                ) : null}
            </div>

            {/* Product List */}
            <div className="space-y-4">
                {products.map((item) => {
                    const isSelected = selectedHandles.has(item.handle);
                    // Use featuredImage or first image
                    const imageUrl = item.featuredImage?.url || item.images?.[0]?.url;
                    // Properly format money
                    const price = formatMoney(
                        item.price ?? item.priceRange?.minVariantPrice?.amount,
                        item.currencyCode ?? item.priceRange?.minVariantPrice?.currencyCode
                    );

                    return (
                        <div
                            key={item.handle}
                            className="flex items-center gap-4 p-3 border border-gray-200 rounded-lg bg-white shadow-sm hover:shadow-md transition-all"
                        >
                            {/* Checkbox (Left side) */}
                            <button
                                onClick={() => toggleSelection(item.handle)}
                                className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center transition-all ${isSelected
                                    ? 'bg-black border-black text-white'
                                    : 'border-2 border-gray-300 bg-white hover:border-black'
                                    }`}
                                aria-label={isSelected ? 'Deselect product' : 'Select product'}
                            >
                                {isSelected && <Check className="w-4 h-4" />}
                            </button>

                            {/* Product Info Wrapper */}
                            <div className="flex-1 flex items-center gap-3 min-w-0">
                                {/* Product Image */}
                                <Link
                                    to={`/product/${item.handle}`}
                                    className="flex-shrink-0 w-16 h-16 bg-gray-100 rounded-md overflow-hidden border border-gray-100"
                                >
                                    {imageUrl ? (
                                        <FallbackImage
                                            src={imageUrl}
                                            alt={item.title}
                                            className="w-full h-full object-contain"
                                            fallbackClassName="w-full h-full"
                                            fallbackText="No img"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-300 text-[10px]">
                                            No img
                                        </div>
                                    )}
                                </Link>

                                {/* Text Details */}
                                <Link
                                    to={`/product/${item.handle}`}
                                    className="flex-1 min-w-0"
                                >
                                    {item.vendor && (
                                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
                                            {item.vendor}
                                        </p>
                                    )}
                                    <p className="text-sm font-semibold text-gray-900 truncate">
                                        {item.title}
                                    </p>
                                    <p className="text-sm font-bold text-gray-900 mt-0.5">{price}</p>
                                </Link>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default FrequentlyBoughtTogether;
