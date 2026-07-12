import React, { useState } from 'react';
import { MapPin, Truck, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';
import { checkServiceability, formatServiceabilityResponse } from '../lib/shiprocket';

const PincodeChecker = ({ onPincodeCheck }) => {
    const [pincode, setPincode] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    // Check pincode using Shiprocket API
    const checkPincode = async (code) => {
        setLoading(true);
        setError('');
        setResult(null);

        // Validation
        if (!/^\d{6}$/.test(code)) {
            setError('Please enter a valid 6-digit pincode');
            setLoading(false);
            return;
        }

        try {
            // Pickup pincode for Srs 185 Sarada Dogora, Howrah.
            const response = await checkServiceability(code, '711303');
            const formatted = formatServiceabilityResponse(response);

            if (formatted.serviceable) {
                setResult(formatted);
                if (onPincodeCheck) onPincodeCheck(formatted);
            } else {
                setResult({ serviceable: false });
                if (onPincodeCheck) onPincodeCheck({ serviceable: false });
            }
        } catch (err) {
            console.error(err);
            setResult({ serviceable: false });
            if (onPincodeCheck) onPincodeCheck({ serviceable: false });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (pincode.trim()) {
            checkPincode(pincode.trim());
        }
    };

    const handleChange = (e) => {
        const value = e.target.value.replace(/\D/g, '').slice(0, 6);
        setPincode(value);
        if (value.length < 6) {
            setResult(null);
            setError('');
        }
    };

    return (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <form onSubmit={handleSubmit} className="flex gap-2 mb-3">
                <div className="relative flex-1">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={pincode}
                        onChange={handleChange}
                        placeholder="Enter Pincode"
                        className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-black focus:border-black transition-all"
                        maxLength={6}
                    />
                </div>
                <button
                    type="submit"
                    disabled={pincode.length !== 6 || loading}
                    className="px-4 py-2.5 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Check'}
                </button>
            </form>

            {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                    <XCircle className="w-4 h-4" />
                    <span>{error}</span>
                </div>
            )}

            {result && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    {result.serviceable ? (
                        <>
                            <div className="flex items-start gap-2">
                                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                                <div>
                                    <p className="text-sm font-semibold text-green-700">
                                        Delivery available to {result.city}, {result.state}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="flex items-center gap-2 text-gray-700">
                                    <Truck className="w-4 h-4 text-blue-600" />
                                    <span>Delivery in <strong>{result.days} days</strong></span>
                                </div>

                                <div className="flex items-center gap-2 text-gray-700">
                                    <Clock className="w-4 h-4 text-amber-600" />
                                    <span>COD: {result.cod ? (
                                        <span className="text-green-600 font-semibold">Available</span>
                                    ) : (
                                        <span className="text-red-600 font-semibold">Not Available</span>
                                    )}</span>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                                {result.returnAvailable && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full">
                                        <RefreshCw className="w-3 h-3" />
                                        7-Day Return
                                    </span>
                                )}
                                {result.exchangeAvailable && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                                        <RefreshCw className="w-3 h-3" />
                                        Exchange Available
                                    </span>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center gap-2 text-red-600">
                            <XCircle className="w-4 h-4" />
                            <span className="text-sm">Sorry, we don't deliver to this pincode yet.</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PincodeChecker;
