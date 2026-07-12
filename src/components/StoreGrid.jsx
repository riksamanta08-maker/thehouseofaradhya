// src/components/StoreGrid.jsx
import React from 'react';
import StoreCard from './StoreCard';

const image = (file) => `${import.meta.env?.BASE_URL ?? '/'}images/${file}`;

const storeLocations = [
  {
    city: 'Hyderabad',
    address: '101, Vimori Boulevard, Street No. 4, Green Valley, Banjara Hills',
    img: image('m1.jpg'),
  },
  {
    city: 'Delhi',
    address: 'M-81, Ground Floor, M Block Market, Greater Kailash II',
    img: image('m3.jpg'),
  },
  {
    city: 'Mumbai',
    address: 'B1, Prem Sagar Building, 4th Rd, Khar West',
    img: image('m4.jpg'),
  },
  {
    city: 'Bengaluru',
    address: '29, Indigo Block, First Main, Indiranagar',
    img: image('m5.jpg'),
  },
];

export default function StoreGrid() {
  return (
    <section className="site-shell section-gap lg:px-10">
      <div className="border-t border-neutral-200 py-4">
        <h2 className="text-[11px] uppercase tracking-[0.35em] text-neutral-600">
          EVRYDAE Stores
        </h2>
      </div>

      <div className="-mx-4 sm:-mx-6 md:-mx-8 lg:-mx-10">
        <div
          className="
            no-scrollbar
            ml-14 flex gap-4 sm:gap-5 md:gap-6 lg:gap-8
            overflow-x-auto px-4 pb-4 sm:px-6 md:px-8 lg:px-10
            snap-x snap-mandatory
          "
        >
          {storeLocations.map((store) => (
            <div
              key={store.city}
              className="w-[min(420px,80vw)] md:w-[min(420px,40vw)] lg:w-[360px] shrink-0 snap-start"
            >
              <StoreCard store={store} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
