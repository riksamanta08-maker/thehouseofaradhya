import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { extractSizeOptions, fetchProductByHandle, findVariantForSize } from '../lib/api';

const getSizeOptions = (item) => extractSizeOptions(item);

const getSizeAvailability = (item, size) => {
    const variant = findVariantForSize(item, size);
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

const SizeSelectionModal = ({ isOpen, onClose, items = [], onConfirm }) => {
    const [selections, setSelections] = useState({});
    const selectionsRef = useRef({});
    const [resolvedItems, setResolvedItems] = useState(items);
    const [loadingItems, setLoadingItems] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        let cancelled = false;
        const resolveItems = async () => {
            setLoadingItems(true);
            const hydratedItems = await Promise.all(
                items.map(async (item) => {
                    const sizes = getSizeOptions(item);
                    if (sizes.length > 0 || !item?.handle) {
                        return item;
                    }
                    try {
                        const fullProduct = await fetchProductByHandle(item.handle);
                        return fullProduct || item;
                    } catch {
                        return item;
                    }
                }),
            );

            if (cancelled) return;
            setResolvedItems(hydratedItems);

            const initial = {};
            hydratedItems.forEach((item) => {
                const sizes = getSizeOptions(item);
                if (sizes.length > 0) {
                    const firstInStock = sizes.find((size) => getSizeAvailability(item, size).inStock);
                    if (firstInStock) {
                        initial[item.handle] = firstInStock;
                    }
                }
            });
            selectionsRef.current = initial;
            setSelections(initial);
            setLoadingItems(false);
        };

        resolveItems();
        return () => {
            cancelled = true;
        };
    }, [isOpen, items]);

    if (!isOpen) return null;

    const handleSelection = (handle, size) => {
        selectionsRef.current = {
            ...selectionsRef.current,
            [handle]: size,
        };
        setSelections(prev => ({ ...prev, [handle]: size }));
    };

    const handleConfirm = () => {
        const finalItems = resolvedItems.map((item) => {
            const sizes = getSizeOptions(item);
            const hasSizes = sizes.length > 0;
            const selected = selectionsRef.current[item.handle] || selections[item.handle];
            const fallbackSize = hasSizes
                ? (sizes.find((size) => getSizeAvailability(item, size).inStock) ?? null)
                : null;
            const size = selected || fallbackSize;
            const availability = getSizeAvailability(item, size);
            if (!availability.inStock) return null;
            return {
                handle: item.handle,
                size,
                quantity: 1,
            };
        }).filter(Boolean);
        if (finalItems.length === 0) return;
        onConfirm(finalItems);
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-white rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h2 className="text-xl font-bold text-gray-900">Select Options</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-6 h-6 text-gray-500" />
                    </button>
                </div>

                <div className="p-4 max-h-[60vh] overflow-y-auto space-y-6">
                    {resolvedItems.map(item => {
                        const sizes = getSizeOptions(item);
                        const hasSizes = sizes.length > 0;
                        const currentSize = selections[item.handle];
                        const selectedAvailability = hasSizes
                            ? (currentSize ? getSizeAvailability(item, currentSize) : null)
                            : getSizeAvailability(item, null);

                        return (
                            <div key={item.handle} className="space-y-2">
                                <p className="font-semibold text-gray-900">{item.title}</p>
                                {hasSizes ? (
                                    <div className="flex flex-wrap gap-2">
                                        {sizes.map(size => {
                                            const availability = getSizeAvailability(item, size);
                                            const isOut = !availability.inStock;
                                            const isSelected = currentSize === size;
                                            const sizeButtonClasses = isOut
                                                ? 'border-gray-300 bg-gray-100 text-gray-600 line-through cursor-not-allowed hover:border-gray-300'
                                                : isSelected
                                                    ? 'border-black bg-black text-white'
                                                    : 'border-gray-200 text-gray-700 hover:border-black';
                                            return (
                                                <button
                                                    key={size}
                                                    onClick={() => handleSelection(item.handle, size)}
                                                    disabled={isOut}
                                                    className={`relative min-w-[40px] h-10 px-3 border rounded text-sm font-medium transition-all ${sizeButtonClasses}`}
                                                    title={isOut ? 'Out of stock' : availability.lowStock ? 'Low stock' : 'In stock'}
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
                                ) : (
                                    <p className="text-sm text-gray-500">One Size</p>
                                )}
                                {selectedAvailability?.inStock ? (
                                    selectedAvailability.lowStock ? (
                                        <p className="text-xs text-orange-600">
                                            {Number.isFinite(selectedAvailability.quantity)
                                                ? `Only ${selectedAvailability.quantity} left`
                                                : 'Low stock'}
                                        </p>
                                    ) : null
                                ) : (
                                    <p className="text-xs text-rose-600">Out of stock</p>
                                )}
                            </div>
                        );
                    })}
                    {loadingItems ? (
                        <p className="text-xs text-gray-500">Loading size options...</p>
                    ) : null}
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50">
                    <button
                        onClick={handleConfirm}
                        disabled={loadingItems || resolvedItems.every((item) => {
                            const sizes = getSizeOptions(item);
                            if (!sizes.length) return !getSizeAvailability(item, null).inStock;
                            return sizes.every((size) => !getSizeAvailability(item, size).inStock);
                        })}
                        className="w-full bg-[#1a1a2e] text-white font-bold text-sm py-4 uppercase tracking-widest hover:bg-gray-900 transition-colors rounded-sm disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                    >
                        Confirm and Add to Cart
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SizeSelectionModal;
