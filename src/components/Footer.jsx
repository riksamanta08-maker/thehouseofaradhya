import React from 'react';
import { Link } from 'react-router-dom';
import {
  Facebook,
  Instagram,
  MessageCircle,
  Truck,
  CreditCard,
  RotateCcw,
  Headphones,
  ArrowUp,
} from 'lucide-react';

const Footer = () => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="relative bg-[var(--color-bg-dark)] pb-20 pt-12 font-sans text-slate-100 md:pb-6 md:pt-14">
      <div className="site-shell">
        <div className="mb-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:mb-12 lg:grid-cols-3 lg:gap-10">
          <div>
            <h3 className="mb-4 text-3xl font-semibold tracking-tight">Quick Links</h3>
            <ul className="flex flex-col gap-3 text-sm text-slate-300">
              <li><Link to="/" className="transition-colors hover:text-white">Home</Link></li>
              <li><Link to="/contact" className="transition-colors hover:text-white">Contact Us</Link></li>
              <li><Link to="/products" className="transition-colors hover:text-white">Shop</Link></li>
              <li><Link to="/men-outfit-combination" className="transition-colors hover:text-white">Style Guide</Link></li>
              <li><Link to="/men-outfit-under-2500" className="transition-colors hover:text-white">Budget Looks</Link></li>
              <li><Link to="/blog" className="transition-colors hover:text-white">Journal</Link></li>
              <li><Link to="/contact" className="transition-colors hover:text-white">Our Location</Link></li>
              <li><Link to="/faq" className="transition-colors hover:text-white">Help Center</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-3xl font-semibold tracking-tight">Policies</h3>
            <ul className="flex flex-col gap-3 text-sm text-slate-300">
              <li><Link to="/legal/privacy-policy" className="transition-colors hover:text-white">Privacy Policy</Link></li>
              <li><Link to="/legal/money-back-policy" className="transition-colors hover:text-white">Refund Policy</Link></li>
              <li><Link to="/legal/terms-of-use" className="transition-colors hover:text-white">Shipping Policy</Link></li>
              <li><Link to="/legal/money-back-policy" className="transition-colors hover:text-white">Return & Exchange Policy</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-3xl font-semibold tracking-tight">Follow Us</h3>
            <div className="flex gap-4">
              <a
                href="#"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-slate-100 transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href="#"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-slate-100 transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                aria-label="Facebook"
              >
                <Facebook className="h-5 w-5" />
              </a>
              <a
                href="#"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-slate-100 transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                aria-label="WhatsApp"
              >
                <MessageCircle className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-white/15 pt-6 text-xs text-slate-300 md:grid-cols-2 md:text-sm lg:grid-cols-4">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <Truck className="h-4 w-4 text-[var(--color-primary)]" />
            <span>Fast, Free Shipping Across India</span>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <CreditCard className="h-4 w-4 text-[var(--color-primary)]" />
            <span>COD Available With No Extra Fee</span>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <RotateCcw className="h-4 w-4 text-[var(--color-primary)]" />
            <span>7-Day Easy Returns On Eligible Orders</span>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <Headphones className="h-4 w-4 text-[var(--color-primary)]" />
            <span>Customer Support Available Daily</span>
          </div>
        </div>
      </div>

      <button
        onClick={scrollToTop}
        className="fixed bottom-24 right-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-gray-800 bg-black shadow-lg text-white transition-transform hover:scale-110 md:bottom-8 md:right-8"
        aria-label="Scroll to top"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </footer>
  );
};

export default Footer;
