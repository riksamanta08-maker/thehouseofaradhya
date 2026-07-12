import React from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { Shield, Cookie, RefreshCw, Lock, Package, Truck, MapPin, XCircle, RotateCcw } from 'lucide-react';

const LegalPage = () => {
    const { section } = useParams();

    const links = [
        { name: 'Terms of Use', path: 'terms-of-use' },
        { name: 'Privacy Policy', path: 'privacy-policy' },
        { name: 'Money Back Policy', path: 'money-back-policy' },
        { name: 'Refund & Return Policy', path: 'refund-return-policy' },
        { name: 'Refund Process', path: 'refund-process' },
        { name: 'Cancellation Process', path: 'cancellation-process' },
        { name: 'Packaging Details', path: 'packaging-details' },
        { name: 'Delivery Timelines', path: 'delivery-timelines' },
        { name: 'Tracking Details', path: 'tracking-details' },
        { name: 'Accessibility', path: 'accessibility' },
        { name: 'Cookie Policy', path: 'cookie-policy' },
        { name: 'Security Overview', path: 'security-overview', isSeparator: true },
    ];

    const renderContent = () => {
        switch (section) {
            case 'refund-return-policy':
                return (
                    <div className="space-y-8 animate-fade-in">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
                                <RotateCcw className="w-6 h-6 text-blue-500" />
                                Refund and Return Policy
                            </h1>
                            <p className="text-xs text-gray-500 font-bold mb-4">Last Updated: January 2026</p>
                        </div>

                        <section>
                            <h2 className="text-xl font-bold mb-2">Return Eligibility</h2>
                            <p className="text-gray-600 text-sm leading-relaxed mb-4">
                                Returns are accepted within <strong>7 days</strong> from the date of delivery.
                            </p>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>Products must be <strong>unused, unwashed, and in original condition</strong> with all tags and packaging intact.</li>
                                <li>Both prepaid and Cash on Delivery (COD) orders are eligible for return, subject to quality inspection.</li>
                                <li>Refunds will be issued only after the returned product passes inspection.</li>
                                <li>If the product fails quality checks, the refund request may be declined.</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-red-500">🚫</span>
                                Non-Returnable Items
                            </h2>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>Products that have been used, worn, or washed</li>
                                <li>Products with missing tags or damaged packaging</li>
                                <li>Customized or altered outfits</li>
                                <li>Items damaged due to customer misuse</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-blue-500">📬</span>
                                How to Initiate a Return
                            </h2>
                            <p className="text-gray-600 text-sm leading-relaxed mb-2">
                                To request a return, contact our support team:
                            </p>
                            <ul className="text-sm text-gray-700 space-y-1">
                                <li><strong>Email:</strong> aradhyaclothing09@gmail.com</li>
                                <li><strong>Phone:</strong> 7602455773</li>
                            </ul>
                            <p className="text-gray-600 text-sm leading-relaxed mt-4">
                                Please include your order ID and reason for return in your request.
                            </p>
                        </section>
                    </div>
                );

            case 'refund-process':
                return (
                    <div className="space-y-8 animate-fade-in">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-green-500">💳</span>
                                Refund Process
                            </h1>
                            <p className="text-xs text-gray-500 font-bold mb-4">Last Updated: January 2026</p>
                        </div>

                        <section>
                            <h2 className="text-xl font-bold mb-2">Processing Timeline</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Once a returned product is received and inspected, the refund will be initiated within <strong>5–7 working days</strong>.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">Refund Methods</h2>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>Refunds are processed only to the <strong>original payment method</strong> used during purchase.</li>
                                <li>For <strong>Cash on Delivery (COD)</strong> orders, refunds will be processed via bank transfer or UPI after verification.</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-orange-500">⚠️</span>
                                Non-Refundable Charges
                            </h2>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>Shipping charges are <strong>non-refundable</strong></li>
                                <li>COD charges (if applicable) are <strong>non-refundable</strong></li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">Refund Notification</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Customers will be notified via email once the refund has been processed. Please allow 2-3 business days for the amount to reflect in your account after processing.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-blue-500">📬</span>
                                Need Help?
                            </h2>
                            <ul className="text-sm text-gray-700 space-y-1">
                                <li><strong>Email:</strong> aradhyaclothing09@gmail.com</li>
                                <li><strong>Phone:</strong> 7602455773</li>
                            </ul>
                        </section>
                    </div>
                );

            case 'cancellation-process':
                return (
                    <div className="space-y-8 animate-fade-in">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
                                <XCircle className="w-6 h-6 text-red-500" />
                                Cancellation Process
                            </h1>
                            <p className="text-xs text-gray-500 font-bold mb-4">Last Updated: January 2026</p>
                        </div>

                        <section>
                            <h2 className="text-xl font-bold mb-2">When Can You Cancel?</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Orders can be cancelled <strong>only before they are dispatched</strong> from our warehouse.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-orange-500">⚠️</span>
                                After Dispatch
                            </h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Once an order has been shipped, cancellation requests will <strong>not be accepted</strong>. In such cases, customers may follow the return or exchange process after delivery, as per our return policy.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">Seller-Initiated Cancellation</h2>
                            <p className="text-gray-600 text-sm leading-relaxed mb-2">
                                Aradhya reserves the right to cancel any order due to:
                            </p>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>Inventory issues or stock unavailability</li>
                                <li>Pricing errors on the website</li>
                                <li>Suspected fraudulent activity</li>
                            </ul>
                            <p className="text-gray-600 text-sm leading-relaxed mt-4">
                                In case of seller-initiated cancellation, a full refund will be processed to the original payment method.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-blue-500">📬</span>
                                Request Cancellation
                            </h2>
                            <p className="text-gray-600 text-sm leading-relaxed mb-2">
                                To cancel an order, contact us immediately:
                            </p>
                            <ul className="text-sm text-gray-700 space-y-1">
                                <li><strong>Email:</strong> aradhyaclothing09@gmail.com</li>
                                <li><strong>Phone:</strong> 7602455773</li>
                            </ul>
                        </section>
                    </div>
                );

            case 'packaging-details':
                return (
                    <div className="space-y-8 animate-fade-in">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
                                <Package className="w-6 h-6 text-amber-600" />
                                Packaging Details
                            </h1>
                            <p className="text-xs text-gray-500 font-bold mb-4">Last Updated: January 2026</p>
                        </div>

                        <section>
                            <h2 className="text-xl font-bold mb-2">Secure Packaging</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                All orders are <strong>securely packed</strong> to ensure product safety during transit. Each item is checked before dispatch and packed using protective packaging materials to prevent damage.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-green-500">✓</span>
                                Quality Control
                            </h2>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>Each product undergoes inspection before dispatch</li>
                                <li>Protective materials used to prevent transit damage</li>
                                <li>Standard hygiene measures followed during packing</li>
                                <li>Products packed to arrive in best possible condition</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">What's Included</h2>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>Your ordered product(s)</li>
                                <li>Invoice/receipt</li>
                                <li>Care instructions (where applicable)</li>
                                <li>Return/exchange information</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-blue-500">📬</span>
                                Packaging Issues?
                            </h2>
                            <p className="text-gray-600 text-sm leading-relaxed mb-2">
                                If you receive a damaged package, please contact us immediately with photos:
                            </p>
                            <ul className="text-sm text-gray-700 space-y-1">
                                <li><strong>Email:</strong> aradhyaclothing09@gmail.com</li>
                                <li><strong>Phone:</strong> 7602455773</li>
                            </ul>
                        </section>
                    </div>
                );

            case 'delivery-timelines':
                return (
                    <div className="space-y-8 animate-fade-in">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
                                <Truck className="w-6 h-6 text-blue-600" />
                                Delivery Timelines
                            </h1>
                            <p className="text-xs text-gray-500 font-bold mb-4">Last Updated: January 2026</p>
                        </div>

                        <section>
                            <h2 className="text-xl font-bold mb-2">Standard Delivery</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Orders are typically delivered within <strong>3–8 working days</strong> from the date of dispatch.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-orange-500">⚠️</span>
                                Factors Affecting Delivery
                            </h2>
                            <p className="text-gray-600 text-sm leading-relaxed mb-2">
                                Delivery timelines may vary depending on:
                            </p>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>Customer location and pin code serviceability</li>
                                <li>Courier partner operations</li>
                                <li>Weather conditions</li>
                                <li>Unforeseen circumstances (holidays, strikes, etc.)</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">Important Note</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Aradhya is <strong>not responsible for delays</strong> caused by courier partners once the order has been handed over for delivery. However, we work closely with our logistics partners to ensure timely deliveries.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-green-500">🚀</span>
                                Order Processing
                            </h2>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>Orders are processed within 1-2 business days</li>
                                <li>You'll receive a confirmation email once your order is dispatched</li>
                                <li>Tracking details will be shared via SMS and email</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-blue-500">📬</span>
                                Delivery Queries?
                            </h2>
                            <ul className="text-sm text-gray-700 space-y-1">
                                <li><strong>Email:</strong> aradhyaclothing09@gmail.com</li>
                                <li><strong>Phone:</strong> 7602455773</li>
                            </ul>
                        </section>
                    </div>
                );

            case 'tracking-details':
                return (
                    <div className="space-y-8 animate-fade-in">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
                                <MapPin className="w-6 h-6 text-green-600" />
                                Tracking Details
                            </h1>
                            <p className="text-xs text-gray-500 font-bold mb-4">Last Updated: January 2026</p>
                        </div>

                        <section>
                            <h2 className="text-xl font-bold mb-2">How to Track Your Order</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Once an order is shipped, customers will receive tracking details via <strong>SMS or email</strong>.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-blue-500">📱</span>
                                Tracking Information
                            </h2>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>You will receive a <strong>tracking ID</strong> and courier partner details</li>
                                <li>Use the tracking ID to monitor shipment status on the courier's website</li>
                                <li>Real-time updates on package location and delivery status</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">What You Can Track</h2>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>Order dispatch confirmation</li>
                                <li>In-transit updates</li>
                                <li>Out for delivery notification</li>
                                <li>Delivery confirmation</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-orange-500">❓</span>
                                Tracking Issues?
                            </h2>
                            <p className="text-gray-600 text-sm leading-relaxed mb-2">
                                In case of any tracking issues or if your tracking information is not updating, please contact our support team for assistance:
                            </p>
                            <ul className="text-sm text-gray-700 space-y-1">
                                <li><strong>Email:</strong> aradhyaclothing09@gmail.com</li>
                                <li><strong>Phone:</strong> 7602455773</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">Our Delivery Partner</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                We work with <strong>Shiprocket</strong> and other trusted courier partners to ensure safe and timely delivery of your orders across India.
                            </p>
                        </section>
                    </div>
                );

            case 'security-overview':
                return (
                    <div className="space-y-8 animate-fade-in">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
                                <Shield className="w-6 h-6 text-blue-500" />
                                Security Overview
                            </h1>
                            <p className="text-xs text-gray-500 font-bold mb-4">Last Updated: January 2026</p>
                        </div>

                        <section>
                            <h2 className="text-xl font-bold mb-2">1. Website Protection</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Our website <strong>thehouseofaradhya.com</strong> is hosted on secure servers with up-to-date SSL encryption (HTTPS), ensuring that all data transferred between your browser and our site remains private and secure.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">2. Secure Payments</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                We do not store any payment information on our servers. All transactions are processed through trusted and PCI-DSS compliant payment gateways. Your credit/debit card data is fully encrypted and handled with maximum security.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">3. Account Protection</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Customer accounts are protected by unique login credentials. We recommend using a strong password and avoiding sharing your account details with anyone else.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">4. Data Access Control</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Only authorized staff at The House of Aradhya can access your personal information. All such access is logged, monitored, and handled strictly for service-related purposes such as order fulfillment and customer support.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">5. Software Updates</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                We regularly update our website platform, plugins, and server-side applications to protect against known vulnerabilities and ensure smooth operation.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">6. Reporting Issues</h2>
                            <p className="text-gray-600 text-sm leading-relaxed mb-2">
                                If you notice any suspicious activity or believe your account may have been compromised, please notify us immediately at:
                            </p>
                            <ul className="text-sm text-gray-700 space-y-1">
                                <li>📧 aradhyaclothing09@gmail.com</li>
                                <li>📞 7602455773</li>
                            </ul>
                            <p className="text-gray-600 text-sm leading-relaxed mt-4">
                                We are committed to keeping your information safe while you shop confidently at The House of Aradhya.
                            </p>
                        </section>
                    </div>
                );

            case 'cookie-policy':
                return (
                    <div className="space-y-8 animate-fade-in">
                        <div>
                            <h1 className="text-2xl font-bold mb-2">Cookie Policy</h1>
                            <p className="text-xs text-gray-500 font-bold mb-4">Last Revised: January 2026</p>
                        </div>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <Cookie className="w-5 h-5 text-orange-400" />
                                Why We Use Cookies
                            </h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                At <strong>The House of Aradhya</strong>, we use cookies to enhance your shopping experience, personalize content, track website performance, and remember your preferences (like outfit selections based on skin tone, occasion, or bundles).
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-red-500">📌</span>
                                Types of Cookies We Use
                            </h2>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li><strong>Essential Cookies:</strong> These enable core site functionality, like navigation and secure checkout.</li>
                                <li><strong>Performance Cookies:</strong> Help us understand how visitors interact with our site — so we can improve design and product offerings.</li>
                                <li><strong>Preference Cookies:</strong> Remember your skin tone, last viewed items, or bundle preferences.</li>
                                <li><strong>Marketing Cookies:</strong> Used to deliver offers on platforms like Facebook, Instagram, and Google Ads.</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-gray-500">⚙️</span>
                                How You Can Control Cookies
                            </h2>
                            <p className="text-gray-600 text-sm leading-relaxed mb-2">
                                You can accept or decline cookies through your browser settings. Most browsers allow you to:
                            </p>
                            <ul className="list-disc pl-5 space-y-1 text-gray-600 text-sm">
                                <li>Clear cookies manually</li>
                                <li>Block third-party cookies</li>
                                <li>Get notifications before cookies are stored</li>
                            </ul>
                            <p className="text-gray-600 text-sm leading-relaxed mt-2">
                                However, blocking some cookies may affect site functionality — especially outfit recommendation and quick checkout.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <Lock className="w-5 h-5 text-yellow-500" />
                                Third-Party Cookies
                            </h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                We may allow trusted partners like Facebook Pixel or Google Analytics to set cookies for retargeting and performance insights. These are governed by their own policies.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-blue-500">📬</span>
                                Contact Us
                            </h2>
                            <p className="text-gray-600 text-sm leading-relaxed mb-2">
                                If you have questions about this Cookie Policy or need help adjusting your settings:
                            </p>
                            <ul className="text-sm text-gray-700 space-y-1">
                                <li><strong>Email:</strong> aradhyaclothing09@gmail.com</li>
                                <li><strong>Phone:</strong> 7602455773</li>
                            </ul>
                            <p className="text-gray-600 text-sm leading-relaxed mt-4">
                                We update our Cookie Policy from time to time. Check back for updates.
                            </p>
                        </section>
                    </div>
                );

            case 'money-back-policy':
                return (
                    <div className="space-y-8 animate-fade-in">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-green-500">💸</span>
                                Money Back Policy
                            </h1>
                            <p className="text-xs text-gray-500 font-bold mb-4">Last Updated: January 2026</p>
                        </div>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <RefreshCw className="w-6 h-6 text-blue-500" />
                                7-Day Money Back Guarantee
                            </h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                We offer a 7-day money back policy for products that meet the return eligibility. If you're not satisfied, you can request a refund within <strong>7 days of delivery</strong>.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-green-500">✅</span>
                                Eligibility for Refund
                            </h2>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>Product must be unused and in original condition</li>
                                <li>Must include original packaging (if any)</li>
                                <li>Refund request must be raised within 7 days of delivery</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-red-500">🚫</span>
                                Non-Refundable Situations
                            </h2>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>Product was used or worn</li>
                                <li>Customized or altered outfits</li>
                                <li>Return requested after the 7-day window</li>
                                <li>Items damaged due to misuse</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-blue-500">💳</span>
                                Refund Process
                            </h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Once we receive and inspect the returned product, your refund will be processed within <strong>5–7 business days</strong> to the original payment method.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-orange-900">📦</span>
                                Return Shipping
                            </h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Return pickup will be arranged through our logistics partner (<strong>Shiprocket</strong>) if eligible. Otherwise, you may be asked to self-ship the item.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-blue-500">📬</span>
                                Need Help?
                            </h2>
                            <p className="text-gray-600 text-sm leading-relaxed mb-2">
                                We're here to help you at every step. Contact us:
                            </p>
                            <ul className="text-sm text-gray-700 space-y-1">
                                <li><strong>Email:</strong> aradhyaclothing09@gmail.com</li>
                                <li><strong>Phone:</strong> 7602455773</li>
                            </ul>
                            <p className="text-xs text-gray-500 mt-4">
                                Note: Aradhya reserves the right to reject returns that do not meet the policy terms.
                            </p>
                        </section>
                    </div>
                );

            case 'accessibility':
                return (
                    <div className="space-y-8 animate-fade-in">
                        <div>
                            <h1 className="text-2xl font-bold mb-4">Accessibility Statement</h1>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                The House of Aradhya is committed to ensuring digital accessibility for everyone — including individuals with disabilities. We are continually improving the user experience for all visitors and applying the relevant accessibility standards.
                            </p>
                        </div>

                        <section>
                            <h2 className="text-xl font-bold mb-2">Our Efforts</h2>
                            <ul className="space-y-2 text-gray-600 text-sm">
                                <li className="flex items-center gap-2"><span className="text-green-500">✓</span> We follow WCAG 2.1 Level AA guidelines.</li>
                                <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Our website is navigable by keyboard.</li>
                                <li className="flex items-center gap-2"><span className="text-green-500">✓</span> All images include descriptive alt text.</li>
                                <li className="flex items-center gap-2"><span className="text-green-500">✓</span> We maintain readable font sizes and high color contrast.</li>
                                <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Forms are labeled for screen readers and mobile accessibility.</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">Feedback & Assistance</h2>
                            <p className="text-gray-600 text-sm leading-relaxed mb-2">
                                If you face any accessibility barriers while using our site, please let us know. We aim to respond within 24–48 hours.
                            </p>
                            <ul className="text-sm text-gray-700 space-y-1">
                                <li><strong>Email:</strong> aradhyaclothing09@gmail.com</li>
                                <li><strong>Phone:</strong> 7602455773</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">Third-Party Content</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                While we strive for full accessibility, some third-party content or integrations (like embedded videos or payment gateways) may not fully comply. We are working with partners to ensure compatibility.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">Ongoing Commitment</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                We regularly audit and improve our website's accessibility features. As our brand grows, so will our focus on inclusivity — making sure fashion is truly for everyone.
                            </p>
                            <p className="text-xs text-gray-500 mt-4">Last updated: January 2026</p>
                        </section>

                    </div>
                );

            case 'privacy-policy':
                return (
                    <div className="space-y-8 animate-fade-in">
                        <div>
                            <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
                                <span className="text-yellow-600">🔒</span>
                                Privacy Policy
                            </h1>
                            <p className="text-xs text-gray-500 font-bold mb-4">Last Updated: January 2026</p>
                        </div>

                        <section>
                            <h2 className="text-xl font-bold mb-2">1. Introduction</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                At <strong>The House of Aradhya</strong>, we value your privacy. This policy outlines how we collect, use, and protect your personal information when you visit or make a purchase from our website: thehouseofaradhya.com.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">2. What Information We Collect</h2>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>Name, email address, phone number</li>
                                <li>Shipping and billing address</li>
                                <li>Payment information (secured via payment gateway)</li>
                                <li>Browser/device details (for analytics)</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">3. How We Use Your Information</h2>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>To process and deliver your orders</li>
                                <li>To communicate order status or promotions</li>
                                <li>To improve your shopping experience</li>
                                <li>To comply with legal obligations</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">4. Sharing Your Information</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                We do <strong>not sell or rent</strong> your personal information. We only share it with trusted services such as payment processors and delivery partners like <strong>Shiprocket</strong>, solely for order fulfillment.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">5. Data Security</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                We use secure protocols (HTTPS) and encrypted payment gateways to ensure your data is safe. However, no online transmission is ever 100% secure.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">6. Cookies</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                We use cookies to enhance your shopping experience and track website performance. You may disable cookies via browser settings.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">7. Your Rights</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                You can request to access, correct, or delete your personal data by contacting us via email or phone.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">8. Contact Us</h2>
                            <ul className="text-sm text-gray-700 space-y-1">
                                <li><strong>Email:</strong> aradhyaclothing09@gmail.com</li>
                                <li><strong>Phone:</strong> 7602455773</li>
                                <li><strong>Address:</strong> Village Sarada, PO Sarada, PS Amta, District: Howrah, West Bengal, PIN 711413</li>
                            </ul>
                        </section>

                        <p className="text-xs text-gray-500 mt-4">
                            By using our website, you agree to this Privacy Policy.
                        </p>
                    </div>
                );

            default:
                // Terms of Use default
                return (
                    <div className="space-y-8 animate-fade-in">
                        <h1 className="text-2xl font-bold mb-4">Terms of Use</h1>
                        <p className="text-gray-600 text-sm leading-relaxed">
                            Welcome to The House of Aradhya. By accessing our website, you agree to these terms and conditions.
                            Please read them carefully before using our services.
                        </p>

                        <section>
                            <h2 className="text-xl font-bold mb-2">1. Acceptance of Terms</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                By accessing and using <strong>thehouseofaradhya.com</strong>, you accept and agree to be bound by these Terms of Use and our Privacy Policy. If you do not agree, please do not use our website.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">2. Use of Website</h2>
                            <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-600 text-sm">
                                <li>You must be at least 18 years old to make purchases</li>
                                <li>You agree to provide accurate and complete information</li>
                                <li>You are responsible for maintaining account confidentiality</li>
                                <li>Commercial use without permission is prohibited</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">3. Products and Pricing</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                We strive to display accurate product information and pricing. However, errors may occur. We reserve the right to correct any errors and cancel orders placed at incorrect prices.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">4. Order Acceptance</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                All orders are subject to acceptance and availability. We may refuse or cancel orders at our discretion for reasons including suspected fraud, pricing errors, or inventory issues.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">5. Intellectual Property</h2>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                All content on this website, including text, images, logos, and designs, is the property of The House of Aradhya and is protected by copyright laws.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold mb-2">6. Contact</h2>
                            <ul className="text-sm text-gray-700 space-y-1">
                                <li><strong>Email:</strong> aradhyaclothing09@gmail.com</li>
                                <li><strong>Phone:</strong> 7602455773</li>
                            </ul>
                            <p className="text-xs text-gray-500 mt-4">Last updated: January 2026</p>
                        </section>
                    </div>
                );
        }
    };

    return (
        <div className="pt-20 md:pt-28 pb-16 min-h-screen site-shell">
            <div className="text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-extrabold text-[#1a1a1a]">Legal</h1>
            </div>

            <div className="flex flex-col md:flex-row gap-8 lg:gap-16 max-w-5xl mx-auto px-4">
                {/* Sidebar */}
                <div className="w-full md:w-64 flex-shrink-0">
                    <nav className="flex flex-col border-l-2 border-gray-100">
                        {links.map((link) => (
                            <NavLink
                                key={link.path}
                                to={`/legal/${link.path}`}
                                className={({ isActive }) =>
                                    `pl-4 py-3 text-sm font-medium transition-colors border-l-2 -ml-[2px] ${isActive
                                        ? 'border-black text-black'
                                        : 'border-transparent text-gray-500 hover:text-black'
                                    } ${link.isSeparator ? 'mt-4' : ''}`
                                }
                            >
                                {link.name}
                            </NavLink>
                        ))}
                    </nav>
                </div>

                {/* Content Area */}
                <div className="flex-1 max-w-2xl">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default LegalPage;
