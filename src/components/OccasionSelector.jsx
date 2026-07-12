import React from 'react';
import { Link } from 'react-router-dom';
import OptimizedImage from './OptimizedImage';

const image = (file) => `${import.meta.env?.BASE_URL ?? '/'}images/${file}`;
const imageWebp = (file) =>
  `${import.meta.env?.BASE_URL ?? '/'}images/${file.replace(/\.(jpg|jpeg|png)$/i, '.webp')}`;

const occasions = [
    {
        id: 'casual',
        title: 'Casual Wear',
        tag: 'Casual Wear',
        image: image('occasion-casual.jpg'),
        webp: imageWebp('occasion-casual.jpg'),
    },
    {
        id: 'formal',
        title: 'Formal Wear',
        tag: 'Formal Wear',
        image: image('occasion-formal.jpg'),
        webp: imageWebp('occasion-formal.jpg'),
    },
    {
        id: 'ethnic',
        title: 'Ethnic Wear',
        tag: 'Ethnic Wear',
        image: image('occasion-ethnic.jpg'),
        webp: imageWebp('occasion-ethnic.jpg'),
    }
];

export default function OccasionSelector({ selectedSkintone }) {
    // If no skintone is selected, we can either hide this component (handled by parent) 
    // or show default links. The user wants it to show ONLY when skintone is chosen.

    return (
        <section className="site-shell py-8 sm:py-10 md:py-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="mb-6 text-[clamp(2rem,6vw,3.2rem)] font-semibold text-[#001f3f] md:mb-8">
                Select your occasion
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                {occasions.map((occasion) => (
                    <Link
                        key={occasion.id}
                        to={`/products?category=${selectedSkintone || 'all'}&occasion=${encodeURIComponent(occasion.tag)}`}
                        className="group block overflow-hidden rounded-2xl border border-white/40 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                        aria-label={occasion.title}
                    >
                        <OptimizedImage
                            src={occasion.image}
                            sources={[{ srcSet: occasion.webp, type: 'image/webp' }]}
                            alt={`${occasion.title} outfit ideas for men in India`}
                            className="block aspect-[1600/666] w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                            width={1600}
                            height={666}
                        />
                    </Link>
                ))}
            </div>
        </section>
    );
}
