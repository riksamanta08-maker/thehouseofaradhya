import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';

const SimilarProductCard = ({ item }) => {
    if (!item) return null;

    const {
        handle,
        title,
        price,
        img,
        vendor
    } = item;

    return (
        <div className="group relative w-full bg-white flex flex-col">
            {/* Image Container */}
            <Link to={`/product/${handle}`} className="block relative aspect-[4/5] bg-[#f0f0f0] overflow-hidden mb-4">
                {/* Hot Badge */}
                <div className="absolute top-4 left-4 z-10">
                    <span className="bg-[#ff6b00] text-white text-[10px] font-bold px-3 py-1 uppercase tracking-wider">
                        Hot
                    </span>
                </div>

                {img ? (
                    <img
                        src={img}
                        alt={title}
                        className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                        No Image
                    </div>
                )}
            </Link>

            {/* Details */}
            <div className="flex flex-col gap-1 px-1">
                <p className="text-[11px] text-gray-500 uppercase tracking-widest">
                    {vendor || 'Aradhya'}
                </p>

                <Link to={`/product/${handle}`}>
                    <h3 className="text-base font-bold text-slate-900 truncate group-hover:text-gray-700 transition-colors">
                        {title}
                    </h3>
                </Link>

                <div className="flex items-center justify-between mt-1">
                    <span className="text-base font-bold text-slate-900">
                        {price}
                    </span>

                    <button
                        className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center hover:bg-gray-800 transition-colors shadow-sm"
                        aria-label="Add to cart"
                    >
                        <ShoppingCart className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SimilarProductCard;
