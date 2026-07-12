import React, { useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const slides = [
    {
        id: 1,
        image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=2070&auto=format&fit=crop',
        title: 'Style That Starts With You',
        subtitle: 'Versatile styles, endless pairings'
    },
    {
        id: 2,
        image: 'https://images.unsplash.com/photo-1490481651871-732d88521760?q=80&w=2070&auto=format&fit=crop',
        title: 'Fresh Fits for Every Mood',
        subtitle: 'Be the first to wear them'
    },
    {
        id: 3,
        image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?q=80&w=2071&auto=format&fit=crop',
        title: 'Your Perfect Pair Awaits',
        subtitle: 'Trousers that fit your every move'
    }
];

export default function HeroCarousel() {
    const [currentIndex, setCurrentIndex] = useState(0);

    const nextSlide = () => {
        setCurrentIndex((prev) => (prev + 1) % slides.length);
    };

    const prevSlide = () => {
        setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
    };

    const getSlideIndex = (offset) => {
        return (currentIndex + offset + slides.length) % slides.length;
    };

    return (
        <div className="relative w-full overflow-hidden bg-white py-12">
            <div className="site-shell relative h-[400px] flex items-center justify-center">

                {/* Previous Slide (Left) */}
                <div className="absolute left-0 w-[60%] h-[320px] opacity-40 transform -translate-x-[20%] scale-90 z-0 rounded-2xl overflow-hidden hidden md:block">
                    <img
                        src={slides[getSlideIndex(-1)].image}
                        alt=""
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-white/30" />
                </div>

                {/* Next Slide (Right) */}
                <div className="absolute right-0 w-[60%] h-[320px] opacity-40 transform translate-x-[20%] scale-90 z-0 rounded-2xl overflow-hidden hidden md:block">
                    <img
                        src={slides[getSlideIndex(1)].image}
                        alt=""
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-white/30" />
                </div>

                {/* Active Slide (Center) */}
                <div className="relative w-full md:w-[70%] h-full z-10 rounded-3xl overflow-hidden shadow-2xl">
                    <AnimatePresence mode='wait'>
                        <Motion.div
                            key={currentIndex}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.5 }}
                            className="w-full h-full relative"
                        >
                            <img
                                src={slides[currentIndex].image}
                                alt={slides[currentIndex].title}
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-gradient-to-r from-white/10 via-white/50 to-white/80 flex flex-col justify-center items-end pr-12 text-right">
                                <h2 className="text-4xl md:text-5xl font-serif font-bold text-[#4a2c2c] mb-2 max-w-md leading-tight">
                                    {slides[currentIndex].title}
                                </h2>
                                <p className="text-[#4a2c2c] text-lg font-medium">
                                    {slides[currentIndex].subtitle}
                                </p>
                            </div>
                        </Motion.div>
                    </AnimatePresence>
                </div>

                {/* Navigation Buttons */}
                <button
                    onClick={prevSlide}
                    className="absolute left-4 md:left-12 z-20 w-12 h-12 bg-[#5d2e46] rounded-full flex items-center justify-center text-white hover:bg-[#4a2438] transition-colors"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>

                <button
                    onClick={nextSlide}
                    className="absolute right-4 md:right-12 z-20 w-12 h-12 bg-[#5d2e46] rounded-full flex items-center justify-center text-white hover:bg-[#4a2438] transition-colors"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>

                {/* Dots */}
                <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2">
                    {slides.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setCurrentIndex(idx)}
                            className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentIndex ? 'w-8 bg-[#5d2e46]' : 'w-4 bg-gray-300'
                                }`}
                        />
                    ))}
                </div>

            </div>
        </div>
    );
}
