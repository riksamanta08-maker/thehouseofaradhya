import React, { useRef, useState, useEffect } from 'react';

const OTPInput = ({ length = 6, onComplete, disabled = false }) => {
    const [otp, setOtp] = useState(new Array(length).fill(''));
    const inputRefs = useRef([]);

    useEffect(() => {
        // Focus first input on mount
        if (inputRefs.current[0]) {
            inputRefs.current[0].focus();
        }
    }, []);

    const handleChange = (e, index) => {
        const value = e.target.value;

        // Only allow digits
        if (value && !/^\d+$/.test(value)) return;

        const newOtp = [...otp];

        // Handle paste
        if (value.length > 1) {
            const pastedValue = value.slice(0, length - index);
            for (let i = 0; i < pastedValue.length; i++) {
                if (index + i < length) {
                    newOtp[index + i] = pastedValue[i];
                }
            }
            setOtp(newOtp);

            // Focus last filled input or next empty
            const lastIndex = Math.min(index + pastedValue.length, length - 1);
            inputRefs.current[lastIndex]?.focus();

            // Check if complete
            const completeOtp = newOtp.join('');
            if (completeOtp.length === length && onComplete) {
                onComplete(completeOtp);
            }
            return;
        }

        // Single character input
        newOtp[index] = value;
        setOtp(newOtp);

        // Move to next input
        if (value && index < length - 1) {
            inputRefs.current[index + 1]?.focus();
        }

        // Check if complete
        const completeOtp = newOtp.join('');
        if (completeOtp.length === length && onComplete) {
            onComplete(completeOtp);
        }
    };

    const handleKeyDown = (e, index) => {
        if (e.key === 'Backspace') {
            if (!otp[index] && index > 0) {
                // Move to previous input on backspace if current is empty
                inputRefs.current[index - 1]?.focus();
                const newOtp = [...otp];
                newOtp[index - 1] = '';
                setOtp(newOtp);
            } else {
                // Clear current input
                const newOtp = [...otp];
                newOtp[index] = '';
                setOtp(newOtp);
            }
        } else if (e.key === 'ArrowLeft' && index > 0) {
            inputRefs.current[index - 1]?.focus();
        } else if (e.key === 'ArrowRight' && index < length - 1) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);

        if (pastedData) {
            const newOtp = [...otp];
            for (let i = 0; i < pastedData.length; i++) {
                newOtp[i] = pastedData[i];
            }
            setOtp(newOtp);

            // Focus appropriate input
            const focusIndex = Math.min(pastedData.length, length - 1);
            inputRefs.current[focusIndex]?.focus();

            // Check if complete
            if (pastedData.length === length && onComplete) {
                onComplete(pastedData);
            }
        }
    };

    return (
        <div className="flex gap-2 justify-center">
            {otp.map((digit, index) => (
                <input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={length - index}
                    value={digit}
                    onChange={(e) => handleChange(e, index)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    onPaste={handlePaste}
                    disabled={disabled}
                    className="w-12 h-14 text-center text-xl font-bold border-2 border-gray-300 rounded-lg 
                               focus:border-black focus:ring-2 focus:ring-black/20 focus:outline-none
                               disabled:bg-gray-100 disabled:cursor-not-allowed
                               transition-all"
                    aria-label={`OTP digit ${index + 1}`}
                />
            ))}
        </div>
    );
};

export default OTPInput;
