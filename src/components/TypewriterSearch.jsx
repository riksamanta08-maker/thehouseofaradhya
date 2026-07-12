import React from 'react';
import { Search } from 'lucide-react';

const TypewriterSearch = ({ onSearchClick }) => (
  <button
    type="button"
    className="w-full bg-black/30 px-3 py-3 text-left backdrop-blur-sm sm:px-4"
    onClick={onSearchClick}
    aria-label="Open search"
  >
    <span className="relative flex min-h-12 w-full items-center border border-white px-3 sm:px-4">
      <Search className="mr-2 h-4 w-4 shrink-0 text-white sm:mr-3 sm:h-5 sm:w-5" />
      <span className="text-sm font-medium leading-5 text-white sm:text-base md:text-lg">
        Search by party, office, college, or date wear
      </span>
    </span>
  </button>
);

export default TypewriterSearch;
