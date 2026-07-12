import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Package,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import {
  authenticateShiprocket,
  createShiprocketOrder,
  formatTrackingResponse,
  trackShiprocketShipment,
} from '../lib/shiprocket';

const initialOrderForm = {
  customerName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  productName: '',
  sku: '',
  productId: '1001',
  variantId: '2001',
  price: '999',
  quantity: '1',
  paymentMethod: 'Prepaid',
  weight: '0.5',
  length: '10',
  breadth: '10',
  height: '10',
  notes: '',
};

const initialTrackingForm = {
  awb: '',
  orderId: '',
};

const toOptionalNumber = (value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const formatDateTime = (value) => {
  if (!value) return 'Not available yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const FieldLabel = ({ children, hint }) => (
  <label className="space-y-1.5">
    <span className="block text-sm font-semibold text-[var(--color-text-heading)]">
      {children}
      {hint ? <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">{hint}</span> : null}
    </span>
  </label>
);

const Input = ({ className = '', ...props }) => (
  <input
    className={`w-full rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10 ${className}`}
    {...props}
  />
);

const Textarea = ({ className = '', ...props }) => (
  <textarea
    className={`w-full rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10 ${className}`}
    {...props}
  />
);

const Select = ({ className = '', ...props }) => (
  <select
    className={`w-full rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10 ${className}`}
    {...props}
  />
);

const FeedbackBanner = ({ tone = 'info', children }) => {
  const styles = {
    info: 'border-slate-200 bg-slate-50 text-slate-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    error: 'border-rose-200 bg-rose-50 text-rose-700',
  };

  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;

  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${styles[tone] || styles.info}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
};

const SectionCard = ({ icon: Icon, title, description, children }) => (
  <section className="surface-card h-full p-6 sm:p-7">
    <div className="mb-6 flex items-start gap-4">
      <div className="rounded-2xl bg-black p-3 text-white shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-[var(--color-text-heading)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p>
      </div>
    </div>
    {children}
  </section>
);

export default function ShiprocketPage() {
  const [authState, setAuthState] = useState({
    loading: false,
    error: '',
    data: null,
  });
  const [orderForm, setOrderForm] = useState(initialOrderForm);
  const [orderState, setOrderState] = useState({
    loading: false,
    error: '',
    success: '',
    data: null,
  });
  const [trackingForm, setTrackingForm] = useState(initialTrackingForm);
  const [trackingState, setTrackingState] = useState({
    loading: false,
    error: '',
    data: null,
  });

  const trackingSummary = useMemo(
    () => (trackingState.data ? formatTrackingResponse(trackingState.data) : null),
    [trackingState.data],
  );

  const handleOrderFieldChange = (event) => {
    const { name, value } = event.target;
    setOrderForm((current) => ({ ...current, [name]: value }));
  };

  const handleTrackingFieldChange = (event) => {
    const { name, value } = event.target;
    setTrackingForm((current) => ({ ...current, [name]: value }));
  };

  const handleAuthCheck = async () => {
    setAuthState({ loading: true, error: '', data: null });
    try {
      const data = await authenticateShiprocket();
      setAuthState({ loading: false, error: '', data });
    } catch (error) {
      setAuthState({
        loading: false,
        error: error.message || 'Unable to reach Shiprocket.',
        data: null,
      });
    }
  };

  const handleCreateOrder = async (event) => {
    event.preventDefault();
    setOrderState({
      loading: true,
      error: '',
      success: '',
      data: null,
    });

    try {
      const payload = {
        paymentMethod: orderForm.paymentMethod,
        notes: orderForm.notes,
        customer: {
          name: orderForm.customerName,
          email: orderForm.email,
          phone: orderForm.phone,
          address: orderForm.address,
          city: orderForm.city,
          state: orderForm.state,
          pincode: orderForm.pincode,
        },
        item: {
          name: orderForm.productName,
          sku: orderForm.sku || undefined,
          price: toOptionalNumber(orderForm.price),
          quantity: toOptionalNumber(orderForm.quantity),
          product_id: toOptionalNumber(orderForm.productId),
          variant_id: toOptionalNumber(orderForm.variantId),
        },
        package: {
          weight: toOptionalNumber(orderForm.weight),
          length: toOptionalNumber(orderForm.length),
          breadth: toOptionalNumber(orderForm.breadth),
          height: toOptionalNumber(orderForm.height),
        },
      };

      const data = await createShiprocketOrder(payload);
      setOrderState({
        loading: false,
        error: '',
        success: 'Order created successfully in Shiprocket.',
        data,
      });

      setTrackingForm((current) => ({
        awb: data?.summary?.awbCode || current.awb,
        orderId: data?.summary?.shiprocketOrderId
          ? String(data.summary.shiprocketOrderId)
          : current.orderId,
      }));
    } catch (error) {
      setOrderState({
        loading: false,
        error: error.message || 'Unable to create the order.',
        success: '',
        data: null,
      });
    }
  };

  const handleTrackShipment = async (event) => {
    event.preventDefault();
    setTrackingState({
      loading: true,
      error: '',
      data: null,
    });

    try {
      const data = await trackShiprocketShipment({
        awb: trackingForm.awb.trim(),
        orderId: trackingForm.orderId.trim(),
      });
      setTrackingState({
        loading: false,
        error: '',
        data,
      });
    } catch (error) {
      setTrackingState({
        loading: false,
        error: error.message || 'Unable to fetch tracking details.',
        data: null,
      });
    }
  };

  return (
    <div className="site-shell min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 rounded-[2rem] border border-[var(--color-border)] bg-gradient-to-br from-white via-[#f7f8fb] to-[#eef2f7] px-6 py-8 shadow-sm sm:px-8 sm:py-10">
          <div className="max-w-3xl">
            <p className="mb-3 inline-flex rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
              Shiprocket Integration
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight text-[var(--color-text-heading)] sm:text-4xl">
              Create Shiprocket orders and track shipments from one screen
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">
              This page talks only to your Express backend. The Shiprocket token stays on the
              server, refreshes automatically when needed, and never reaches the browser.
            </p>
          </div>
        </div>

        <div className="mb-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <SectionCard
            icon={ShieldCheck}
            title="1. Verify backend authentication"
            description="Use this quick check to confirm that your backend can log in to Shiprocket with the environment variables you configured."
          >
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={handleAuthCheck}
                disabled={authState.loading}
                className="inline-flex w-fit items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {authState.loading ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Checking connection...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Authenticate with Shiprocket
                  </>
                )}
              </button>

              {authState.error ? (
                <FeedbackBanner tone="error">{authState.error}</FeedbackBanner>
              ) : null}

              {authState.data ? (
                <FeedbackBanner tone="success">
                  <div className="space-y-1">
                    <p>Shiprocket is authenticated and ready.</p>
                    <p>
                      Token expires: <strong>{formatDateTime(authState.data.expiresAt)}</strong>
                    </p>
                    <p>
                      Pickup location: <strong>{authState.data.pickupLocation}</strong>
                    </p>
                  </div>
                </FeedbackBanner>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            icon={Truck}
            title="What this demo includes"
            description="A practical baseline you can extend into a checkout or admin workflow."
          >
            <div className="grid gap-3 text-sm text-[var(--color-text-muted)]">
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface-muted)] px-4 py-3">
                Token-based backend authentication with automatic refresh when the cached JWT is close to expiry.
              </div>
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface-muted)] px-4 py-3">
                A reusable Axios service on both backend and frontend, with friendly error messages.
              </div>
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface-muted)] px-4 py-3">
                Order creation and shipment tracking through your own <code>/api/shiprocket/*</code> routes.
              </div>
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface-muted)] px-4 py-3">
                Loading states, validation-friendly messaging, and a route you can test immediately at <code>/shiprocket-demo</code>.
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionCard
            icon={Package}
            title="2. Create an order"
            description="This form includes the simple fields you asked for, plus the address details Shiprocket requires to create a real shipment."
          >
            <form onSubmit={handleCreateOrder} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Name</FieldLabel>
                  <Input
                    name="customerName"
                    value={orderForm.customerName}
                    onChange={handleOrderFieldChange}
                    placeholder="Mohd Ashiq"
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Email</FieldLabel>
                  <Input
                    type="email"
                    name="email"
                    value={orderForm.email}
                    onChange={handleOrderFieldChange}
                    placeholder="customer@example.com"
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Phone</FieldLabel>
                  <Input
                    name="phone"
                    value={orderForm.phone}
                    onChange={handleOrderFieldChange}
                    placeholder="9876543210"
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Pincode</FieldLabel>
                  <Input
                    name="pincode"
                    value={orderForm.pincode}
                    onChange={handleOrderFieldChange}
                    placeholder="711413"
                    required
                  />
                </div>
              </div>

              <div>
                <FieldLabel hint="Shiprocket needs city, state and PIN separately for real orders.">
                  Address
                </FieldLabel>
                <Textarea
                  name="address"
                  value={orderForm.address}
                  onChange={handleOrderFieldChange}
                  placeholder="Village Sarada, PO Sarada, PS Amta"
                  rows={4}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>City</FieldLabel>
                  <Input
                    name="city"
                    value={orderForm.city}
                    onChange={handleOrderFieldChange}
                    placeholder="Howrah"
                    required
                  />
                </div>
                <div>
                  <FieldLabel>State</FieldLabel>
                  <Input
                    name="state"
                    value={orderForm.state}
                    onChange={handleOrderFieldChange}
                    placeholder="West Bengal"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <FieldLabel>Product</FieldLabel>
                  <Input
                    name="productName"
                    value={orderForm.productName}
                    onChange={handleOrderFieldChange}
                    placeholder="Classic Cotton Kurta"
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Price</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    name="price"
                    value={orderForm.price}
                    onChange={handleOrderFieldChange}
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Quantity</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    name="quantity"
                    value={orderForm.quantity}
                    onChange={handleOrderFieldChange}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="lg:col-span-2">
                  <FieldLabel hint="Optional">SKU</FieldLabel>
                  <Input
                    name="sku"
                    value={orderForm.sku}
                    onChange={handleOrderFieldChange}
                    placeholder="KURTA-001"
                  />
                </div>
                <div>
                  <FieldLabel>Product ID</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    name="productId"
                    value={orderForm.productId}
                    onChange={handleOrderFieldChange}
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Variant ID</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    name="variantId"
                    value={orderForm.variantId}
                    onChange={handleOrderFieldChange}
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Weight (kg)</FieldLabel>
                  <Input
                    type="number"
                    min="0.1"
                    step="0.1"
                    name="weight"
                    value={orderForm.weight}
                    onChange={handleOrderFieldChange}
                  />
                </div>
                <div>
                  <FieldLabel>Length</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    step="0.1"
                    name="length"
                    value={orderForm.length}
                    onChange={handleOrderFieldChange}
                  />
                </div>
                <div>
                  <FieldLabel>Payment</FieldLabel>
                  <Select
                    name="paymentMethod"
                    value={orderForm.paymentMethod}
                    onChange={handleOrderFieldChange}
                  >
                    <option value="Prepaid">Prepaid</option>
                    <option value="COD">COD</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel>Breadth</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    step="0.1"
                    name="breadth"
                    value={orderForm.breadth}
                    onChange={handleOrderFieldChange}
                  />
                </div>
                <div>
                  <FieldLabel>Height</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    step="0.1"
                    name="height"
                    value={orderForm.height}
                    onChange={handleOrderFieldChange}
                  />
                </div>
              </div>

              <div>
                <FieldLabel hint="Optional">Notes</FieldLabel>
                <Textarea
                  name="notes"
                  value={orderForm.notes}
                  onChange={handleOrderFieldChange}
                  placeholder="Gift wrap this item if possible."
                  rows={3}
                />
              </div>

              <button
                type="submit"
                disabled={orderState.loading}
                className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {orderState.loading ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Creating order...
                  </>
                ) : (
                  <>
                    <Package className="h-4 w-4" />
                    Create Shiprocket Order
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 space-y-3">
              {orderState.error ? (
                <FeedbackBanner tone="error">{orderState.error}</FeedbackBanner>
              ) : null}

              {orderState.success ? (
                <FeedbackBanner tone="success">
                  <div className="space-y-1">
                    <p>{orderState.success}</p>
                    <p>
                      Shiprocket order ID:{' '}
                      <strong>{orderState.data?.summary?.shiprocketOrderId || 'Returned in raw payload'}</strong>
                    </p>
                    <p>
                      Shipment ID: <strong>{orderState.data?.summary?.shipmentId || 'Pending'}</strong>
                    </p>
                    <p>
                      Local order ID: <strong>{orderState.data?.summary?.localOrderId}</strong>
                    </p>
                  </div>
                </FeedbackBanner>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            icon={Truck}
            title="3. Track a shipment"
            description="Enter an AWB number or the Shiprocket order ID returned after order creation."
          >
            <form onSubmit={handleTrackShipment} className="space-y-4">
              <div>
                <FieldLabel hint="Recommended when you have it">AWB Number</FieldLabel>
                <Input
                  name="awb"
                  value={trackingForm.awb}
                  onChange={handleTrackingFieldChange}
                  placeholder="19038100001234"
                />
              </div>

              <div className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
                Or
              </div>

              <div>
                <FieldLabel>Shiprocket Order ID</FieldLabel>
                <Input
                  name="orderId"
                  value={trackingForm.orderId}
                  onChange={handleTrackingFieldChange}
                  placeholder="7419060"
                />
              </div>

              <button
                type="submit"
                disabled={trackingState.loading}
                className="inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {trackingState.loading ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Fetching tracking...
                  </>
                ) : (
                  <>
                    <Truck className="h-4 w-4" />
                    Track Shipment
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 space-y-4">
              {trackingState.error ? (
                <FeedbackBanner tone="error">{trackingState.error}</FeedbackBanner>
              ) : null}

              {trackingSummary ? (
                <div className="space-y-4 rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-bg-surface-muted)] p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                        Status
                      </p>
                      <p className="mt-2 text-base font-bold text-[var(--color-text-heading)]">
                        {trackingSummary.status}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                        Courier
                      </p>
                      <p className="mt-2 text-base font-bold text-[var(--color-text-heading)]">
                        {trackingSummary.courierName || 'Assigned courier not returned yet'}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                        AWB
                      </p>
                      <p className="mt-2 text-base font-bold text-[var(--color-text-heading)]">
                        {trackingSummary.awb || 'Not available yet'}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                        Estimated delivery
                      </p>
                      <p className="mt-2 text-base font-bold text-[var(--color-text-heading)]">
                        {trackingSummary.estimatedDeliveryDate || 'Not provided'}
                      </p>
                    </div>
                  </div>

                  {trackingSummary.activities.length ? (
                    <div>
                      <p className="mb-3 text-sm font-semibold text-[var(--color-text-heading)]">
                        Tracking timeline
                      </p>
                      <div className="space-y-3">
                        {trackingSummary.activities.map((activity, index) => (
                          <div
                            key={`${activity.date || 'scan'}-${index}`}
                            className="rounded-2xl border border-white bg-white px-4 py-3"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="font-semibold text-[var(--color-text-heading)]">
                                  {activity.status || 'Scan updated'}
                                </p>
                                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                                  {activity.location || 'Location unavailable'}
                                </p>
                              </div>
                              <p className="text-xs font-medium text-[var(--color-text-muted)]">
                                {formatDateTime(activity.date)}
                              </p>
                            </div>
                            {activity.details ? (
                              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                                {activity.details}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-white px-4 py-4 text-sm text-[var(--color-text-muted)]">
                      Tracking has started, but Shiprocket has not returned any scan events yet.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
