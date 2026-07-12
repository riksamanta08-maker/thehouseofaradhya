import React from 'react';
import { Mail, Phone, MapPin } from 'lucide-react';

const ContactPage = () => {
    return (
        <div className="pt-24 pb-16 min-h-screen site-shell">
            <h1 className="text-4xl font-extrabold mb-8 text-center">Contact Us</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-4xl mx-auto">
                <div className="space-y-6">
                    <h2 className="text-2xl font-bold">Get in Touch</h2>
                    <p className="text-gray-600">
                        Have questions or need assistance? Reach out to us.
                    </p>

                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <Mail className="w-5 h-5 text-gray-700" />
                            <span className="text-gray-700">aradhyaclothing09@gmail.com</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Phone className="w-5 h-5 text-gray-700" />
                            <span className="text-gray-700">7602455773</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <MapPin className="w-5 h-5 text-gray-700 mt-1" />
                            <span className="text-gray-700 max-w-xs">
                                Village Sarada, PO Sarada, PS Amta, District: Howrah, West Bengal, PIN 711413
                            </span>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50 p-6 rounded-lg">
                    <form className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Name</label>
                            <input type="text" className="w-full border border-gray-300 rounded p-2 text-sm" placeholder="Your Name" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Email</label>
                            <input type="email" className="w-full border border-gray-300 rounded p-2 text-sm" placeholder="your@email.com" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Message</label>
                            <textarea className="w-full border border-gray-300 rounded p-2 text-sm h-32" placeholder="How can we help?"></textarea>
                        </div>
                        <button className="w-full bg-black text-white py-3 font-bold text-sm uppercase">Send Message</button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ContactPage;
