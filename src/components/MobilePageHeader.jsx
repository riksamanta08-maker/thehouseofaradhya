import React from 'react';
import { ChevronLeft, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MobilePageHeader = ({ title, onBack, onSearch }) => {
    const navigate = useNavigate();

    const handleBack = () => {
        if (onBack) {
            onBack();
        } else {
            navigate(-1);
        }
    };

    return (
        <div className="lg:hidden sticky top-0 z-50 bg-white border-b border-gray-100 h-14 flex items-center justify-between px-4">
            <button
                onClick={handleBack}
                className="p-1 -ml-1 text-gray-800"
                aria-label="Go back"
            >
                <ChevronLeft className="w-6 h-6" />
            </button>

            <h1 className="text-lg font-bold text-black uppercase tracking-wide">
                {title}
            </h1>

            <button
                onClick={onSearch}
                className="p-1 -mr-1 text-gray-800"
                aria-label="Search"
            >
                <Search className="w-6 h-6" />
            </button>
        </div>
    );
};

export default MobilePageHeader;
