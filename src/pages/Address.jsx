import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, MapPin, Plus, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatMoney } from '../lib/api';
import { useAuth } from '../contexts/auth-context';
import { appendMetaDebugParams } from '../lib/metaPixel';
import {
  getCheckoutDraft,
  getEmptyShippingAddress,
  getSavedCheckoutAddresses,
  setCheckoutDraft,
  setSavedCheckoutAddresses,
  upsertCheckoutAddress,
} from '../lib/checkout';

const formatEstimateDate = (date) =>
  date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });

const buildEstimateLabel = (index) => {
  const start = new Date();
  const minDays = 3 + (index % 2);
  const maxDays = minDays + 2;
  start.setDate(start.getDate() + minDays);
  const end = new Date(start);
  end.setDate(end.getDate() + (maxDays - minDays));
  if (formatEstimateDate(start) === formatEstimateDate(end)) {
    return `Estimated delivery by ${formatEstimateDate(start)}`;
  }
  return `Delivery between ${formatEstimateDate(start)} - ${formatEstimateDate(end)}`;
};

const sanitizeAddress = (value) => ({
  id: String(value?.id || '').trim(),
  label: String(value?.label || 'Home').trim() || 'Home',
  fullName: String(value?.fullName || '').trim(),
  email: String(value?.email || '').trim(),
  phone: String(value?.phone || '').trim(),
  address: String(value?.address || '').trim(),
  city: String(value?.city || '').trim(),
  state: String(value?.state || '').trim(),
  postalCode: String(value?.postalCode || '').trim(),
  isDefault: Boolean(value?.isDefault),
});

export default function Address() {
  const navigate = useNavigate();
  const { customer } = useAuth();

  const [draft, setDraft] = useState(null);
  const [savedAddresses, setSavedAddressesState] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [form, setForm] = useState(getEmptyShippingAddress(customer));
  const [rememberAddress, setRememberAddress] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const currentDraft = getCheckoutDraft();
    if (!currentDraft?.items?.length) {
      navigate(appendMetaDebugParams('/cart'), { replace: true });
      return;
    }

    const saved = getSavedCheckoutAddresses();
    const draftShipping = currentDraft.shipping ? sanitizeAddress(currentDraft.shipping) : null;
    const fallback =
      draftShipping ||
      saved.find((item) => item?.isDefault) ||
      saved[0] ||
      getEmptyShippingAddress(customer);

    setDraft(currentDraft);
    setSavedAddressesState(saved);
    setSelectedAddressId(fallback?.id || '');
    setForm(sanitizeAddress(fallback));
  }, [customer, navigate]);

  const lineItems = useMemo(() => draft?.items ?? [], [draft]);
  const subtotal = Number(draft?.totals?.subtotal ?? 0);
  const currency = draft?.totals?.currency || 'INR';
  const paymentFee = Number(draft?.totals?.paymentFee ?? 0);
  const discountAmount = Number(draft?.appliedDiscount?.amount ?? draft?.totals?.discountAmount ?? 0);
  const totalQuantity = useMemo(
    () => lineItems.reduce((sum, item) => sum + Number(item?.quantity || 0), 0),
    [lineItems],
  );
  
  const shippingFee = 0;
  
  const finalTotal = Math.max(subtotal + shippingFee + paymentFee - discountAmount, 0);

  const applySavedAddress = (addressId) => {
    const next = savedAddresses.find((item) => item.id === addressId);
    if (!next) return;
    setSelectedAddressId(addressId);
    setForm(sanitizeAddress(next));
    setError('');
  };

  const handleFieldChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const validateAddress = (value) => {
    if (!value.fullName) return 'Please enter full name.';
    if (!value.email || !/^\S+@\S+\.\S+$/.test(value.email)) return 'Please enter a valid email.';
    if (!value.phone) return 'Please enter phone number.';
    if (!value.address) return 'Please enter address.';
    if (!value.city) return 'Please enter city.';
    if (!value.state) return 'Please enter state.';
    if (!value.postalCode) return 'Please enter postal code.';
    return '';
  };

  const persistAddress = (input, forceDefault = false) => {
    const payload = sanitizeAddress({ ...input, isDefault: forceDefault || input.isDefault });
    const next = upsertCheckoutAddress(savedAddresses, payload);
    setSavedCheckoutAddresses(next);
    setSavedAddressesState(next);
    const selected = next.find((entry) => entry.fullName === payload.fullName && entry.address === payload.address)
      || next[0];
    if (selected?.id) {
      setSelectedAddressId(selected.id);
      setForm(sanitizeAddress(selected));
      return selected;
    }
    return payload;
  };

  const handleSaveAddress = () => {
    const validationError = validateAddress(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    persistAddress(form, savedAddresses.length === 0);
  };

  const handleContinue = () => {
    if (!draft?.items?.length) {
      navigate('/cart', { replace: true });
      return;
    }

    const shipping = sanitizeAddress(form);
    const validationError = validateAddress(shipping);
    if (validationError) {
      setError(validationError);
      // Scroll to error
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Validate postal code format (basic check for Indian pincodes)
    const postalCode = shipping.postalCode.trim();
    if (postalCode && (!/^\d{6}$/.test(postalCode))) {
      setError('Please enter a valid 6-digit postal code.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Validate phone number (basic check)
    const phone = shipping.phone.trim();
    if (phone && (!/^[+]?[\d\s-]{10,}$/.test(phone))) {
      setError('Please enter a valid phone number.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const savedAddress = rememberAddress
      ? persistAddress(shipping, savedAddresses.length === 0)
      : shipping;

    const calculatedShippingFee = 0;
    const currentPaymentFee = Number(draft?.totals?.paymentFee ?? 0);
    const currentDiscountAmount = Number(
      draft?.appliedDiscount?.amount ?? draft?.totals?.discountAmount ?? 0,
    );
    const calculatedTotal = Math.max(
      subtotal + calculatedShippingFee + currentPaymentFee - currentDiscountAmount,
      0,
    );

    const nextDraft = {
      ...draft,
      shipping: savedAddress,
      totals: {
        ...draft.totals,
        shippingFee: calculatedShippingFee,
        paymentFee: currentPaymentFee,
        discountAmount: currentDiscountAmount,
        discountCode:
          draft?.appliedDiscount?.code || draft?.totals?.discountCode || null,
        total: calculatedTotal,
      },
      updatedAt: new Date().toISOString(),
    };
    setCheckoutDraft(nextDraft);
    navigate(appendMetaDebugParams('/checkout/payment'));
  };

  if (!draft) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f7f7fa] pb-24">
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)} className="rounded p-1 text-gray-700 hover:bg-gray-100">
              <ArrowLeft className="h-6 w-6" />
            </button>
            <h1 className="text-lg font-bold tracking-wide text-[var(--color-text-main)]">ADDRESS</h1>
          </div>
          <span className="text-xs font-semibold text-gray-500">STEP 2/3</span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-black" />
              <p className="text-sm font-semibold text-[var(--color-text-main)]">Shipping Address</p>
            </div>
            <button
              type="button"
              onClick={handleSaveAddress}
              className="inline-flex items-center gap-1 rounded-full border border-black px-3 py-1 text-xs font-semibold text-black hover:bg-black hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              Save
            </button>
          </div>

          {savedAddresses.length ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {savedAddresses.map((address) => (
                <button
                  key={address.id}
                  type="button"
                  onClick={() => applySavedAddress(address.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    selectedAddressId === address.id
                      ? 'border-black bg-black text-white'
                      : 'border-gray-300 text-gray-700 hover:border-black hover:text-black'
                  }`}
                >
                  {address.label || 'Address'}: {address.fullName || 'Saved'}
                </button>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={form.fullName}
              onChange={(event) => handleFieldChange('fullName', event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none"
              placeholder="Full Name"
            />
            <input
              value={form.email}
              onChange={(event) => handleFieldChange('email', event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none"
              placeholder="Email"
            />
            <input
              value={form.phone}
              onChange={(event) => handleFieldChange('phone', event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none"
              placeholder="Phone"
            />
            <input
              value={form.postalCode}
              onChange={(event) => handleFieldChange('postalCode', event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none"
              placeholder="Postal Code"
            />
            <input
              value={form.city}
              onChange={(event) => handleFieldChange('city', event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none"
              placeholder="City"
            />
            <input
              value={form.state}
              onChange={(event) => handleFieldChange('state', event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none"
              placeholder="State"
            />
            <textarea
              value={form.address}
              onChange={(event) => handleFieldChange('address', event.target.value)}
              className="min-h-[90px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none md:col-span-2"
              placeholder="House no, street, landmark"
            />
          </div>

          <label className="mt-3 inline-flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={rememberAddress}
              onChange={(event) => setRememberAddress(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
            />
            Save this address for next time
          </label>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Delivery Estimates</p>
          </div>
          <div className="divide-y divide-gray-100">
            {lineItems.map((item, index) => (
              <div key={`${item.slug}-${index}`} className="flex items-center gap-3 px-4 py-3">
                <div className="h-16 w-12 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.15em] text-gray-400">
                      No Img
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-500">
                    Qty {item.quantity}{item.size ? ` • Size ${item.size}` : ''}
                  </p>
                  <p className="mt-1 text-xs font-medium text-gray-700">{buildEstimateLabel(index)}</p>
                </div>
                <Truck className="h-4 w-4 text-black" />
              </div>
            ))}
          </div>
        </section>
      </div>

      {error ? (
        <div className="mx-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="fixed bottom-[60px] md:bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
        <div className="mb-2 space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">{totalQuantity} items</span>
            <span className="text-gray-700">{formatMoney(subtotal, currency)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Delivery</span>
            <span className="font-semibold text-emerald-600">Free</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Discount</span>
              <span className="font-semibold text-emerald-600">
                -{formatMoney(discountAmount, currency)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-gray-200 pt-2 mt-2">
            <span className="font-bold text-gray-900">Total</span>
            <span className="font-bold text-[var(--color-text-main)] text-lg">
              {formatMoney(finalTotal, currency)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleContinue}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-sm bg-black py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:bg-gray-900"
        >
          <CheckCircle2 className="h-4 w-4" />
          Continue to Payment
        </button>
      </div>
    </div>
  );
}
