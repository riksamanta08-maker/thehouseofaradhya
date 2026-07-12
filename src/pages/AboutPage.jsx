import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, Globe, MapPin, Heart, Shirt, Palette, Calendar, Users, Target, Award } from 'lucide-react';

const AboutPage = () => {
    return (
        <div className="pt-24 pb-16 min-h-screen">
            {/* Hero Section */}
            <div className="site-shell">
                <div className="text-center mb-16">
                    <h1 className="text-4xl md:text-5xl font-extrabold text-[#1a1a1a] mb-4">About Us</h1>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                        Curated outfit combinations for the modern Indian man
                    </p>
                </div>

                {/* Brand Story */}
                <div className="max-w-4xl mx-auto mb-16">
                    <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-8 md:p-12 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center">
                                <Shirt className="w-6 h-6 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900">Who We Are</h2>
                        </div>
                        <p className="text-gray-600 leading-relaxed mb-6">
                            <strong>Aradhya</strong> is an Indian men's fashion brand focused on delivering curated outfit
                            combinations based on individual skin tone and occasion needs.
                        </p>
                        <p className="text-gray-600 leading-relaxed">
                            Our goal is to simplify men's fashion by offering ready-to-wear outfit bundles
                            that are thoughtfully styled, practical, and affordable. Each product is carefully
                            selected to ensure comfort, style, and everyday usability.
                        </p>
                    </div>
                </div>

                {/* What Makes Us Different */}
                <div className="max-w-4xl mx-auto mb-16">
                    <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">What Makes Us Different</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mb-4">
                                <Palette className="w-5 h-5 text-amber-600" />
                            </div>
                            <h3 className="font-bold text-gray-900 mb-2">Skin Tone Based Styling</h3>
                            <p className="text-sm text-gray-600">
                                We understand that colors look different on different skin tones. Our outfit recommendations
                                are tailored to complement your unique complexion - Fair, Neutral, or Dark.
                            </p>
                        </div>

                        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                                <Calendar className="w-5 h-5 text-blue-600" />
                            </div>
                            <h3 className="font-bold text-gray-900 mb-2">Occasion Perfect Outfits</h3>
                            <p className="text-sm text-gray-600">
                                Whether it's a casual date, religious ceremony, or office meeting - we have
                                curated bundles ready for every occasion in your life.
                            </p>
                        </div>

                        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                                <Award className="w-5 h-5 text-green-600" />
                            </div>
                            <h3 className="font-bold text-gray-900 mb-2">Quality Assured</h3>
                            <p className="text-sm text-gray-600">
                                Every product is carefully inspected and selected to ensure comfort,
                                durability, and style that lasts.
                            </p>
                        </div>

                        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                                <Heart className="w-5 h-5 text-purple-600" />
                            </div>
                            <h3 className="font-bold text-gray-900 mb-2">Affordable Fashion</h3>
                            <p className="text-sm text-gray-600">
                                Looking good shouldn't break the bank. We offer stylish outfit bundles
                                at prices that make sense for everyday Indians.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Our Mission */}
                <div className="max-w-4xl mx-auto mb-16">
                    <div className="bg-black text-white rounded-2xl p-8 md:p-12">
                        <div className="flex items-center gap-3 mb-6">
                            <Target className="w-8 h-8" />
                            <h2 className="text-2xl font-bold">Our Mission</h2>
                        </div>
                        <p className="text-gray-300 leading-relaxed text-lg">
                            To make men's fashion simple, accessible, and personalized. We believe every man deserves
                            to look his best without spending hours figuring out what goes with what.
                            That's why we do the styling for you.
                        </p>
                    </div>
                </div>

                {/* Business Info */}
                <div className="max-w-4xl mx-auto mb-16">
                    <div className="bg-gray-50 rounded-2xl p-8">
                        <div className="flex items-center gap-3 mb-6">
                            <Users className="w-6 h-6 text-gray-700" />
                            <h2 className="text-xl font-bold text-gray-900">Business Details</h2>
                        </div>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div>
                                <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">Business Name</p>
                                <p className="font-semibold text-gray-900">The House of Aradhya</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">Business Type</p>
                                <p className="font-semibold text-gray-900">Sole Proprietorship (India)</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">Service Area</p>
                                <p className="font-semibold text-gray-900">Pan India Delivery</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">Founded</p>
                                <p className="font-semibold text-gray-900">2025</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Contact Section */}
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-2xl font-bold text-center text-gray-900 mb-8">Get In Touch</h2>
                    <div className="grid md:grid-cols-3 gap-6">
                        <a
                            href="https://thehouseofaradhya.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-white border border-gray-100 rounded-xl p-6 text-center hover:shadow-md transition-shadow group"
                        >
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-black group-hover:text-white transition-colors">
                                <Globe className="w-5 h-5" />
                            </div>
                            <p className="text-sm text-gray-500 mb-1">Website</p>
                            <p className="font-semibold text-gray-900 text-sm">thehouseofaradhya.com</p>
                        </a>

                        <a
                            href="mailto:aradhyaclothing09@gmail.com"
                            className="bg-white border border-gray-100 rounded-xl p-6 text-center hover:shadow-md transition-shadow group"
                        >
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-black group-hover:text-white transition-colors">
                                <Mail className="w-5 h-5" />
                            </div>
                            <p className="text-sm text-gray-500 mb-1">Email</p>
                            <p className="font-semibold text-gray-900 text-sm break-all">aradhyaclothing09@gmail.com</p>
                        </a>

                        <a
                            href="tel:7602455773"
                            className="bg-white border border-gray-100 rounded-xl p-6 text-center hover:shadow-md transition-shadow group"
                        >
                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-black group-hover:text-white transition-colors">
                                <Phone className="w-5 h-5" />
                            </div>
                            <p className="text-sm text-gray-500 mb-1">Phone</p>
                            <p className="font-semibold text-gray-900 text-sm">7602455773</p>
                        </a>
                    </div>

                    {/* Address */}
                    <div className="mt-8 bg-white border border-gray-100 rounded-xl p-6 text-center">
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <MapPin className="w-5 h-5 text-gray-500" />
                            <p className="text-sm text-gray-500">Registered Address</p>
                        </div>
                        <p className="text-gray-900">
                            Village Sarada, PO Sarada, PS Amta, District: Howrah, West Bengal, PIN 711413
                        </p>
                    </div>
                </div>

                {/* CTA */}
                <div className="max-w-4xl mx-auto mt-16 text-center">
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Ready to Find Your Perfect Outfit?</h3>
                    <p className="text-gray-600 mb-6">
                        Select your skin tone and occasion to discover curated outfit combinations made just for you.
                    </p>
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 bg-black text-white px-8 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
                    >
                        Start Shopping
                        <span>→</span>
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default AboutPage;
