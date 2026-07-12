import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/auth-context';
import { useCart } from '../contexts/cart-context';
import { useCatalog } from '../contexts/catalog-context';
import {
    fetchMyOrderRequests,
    fetchProductByHandle,
    fetchShipmentTracking,
    formatMoney,
    getProductImageUrl,
} from '../lib/api';
import {
    User,
    Package,
    MapPin,
    LogOut,
    Loader2,
    Mail,
    Truck,
    BadgeCheck,
    AlertCircle,
    ArrowUpRight,
} from 'lucide-react';

const toneClasses = {
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    info: 'bg-blue-50 text-blue-700 border border-blue-200',
    warning: 'bg-amber-50 text-amber-800 border border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200',
    muted: 'bg-gray-100 text-gray-700 border border-gray-200',
};

const formatStatusLabel = (status, fallback = 'Processing') => {
    if (!status) return fallback;
    return status
        .toString()
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
};

const pickFirst = (...values) =>
    values
        .map((value) => (value == null ? '' : String(value).trim()))
        .find(Boolean) || '';

const getShipmentInfo = (order = {}) => {
    const shipping = order?.shipping && typeof order.shipping === 'object' ? order.shipping : {};
    const awb = pickFirst(
        shipping.awbCode,
        shipping.awb_code,
        shipping.awb,
        shipping.trackingNumber,
    );
    const shiprocketOrderId = pickFirst(
        shipping.shiprocketOrderId,
        shipping.shiprocket_order_id,
        shipping.order_id,
    );
    const status = pickFirst(
        shipping.shiprocketStatus,
        shipping.shipmentStatus,
        shipping.shipment_status,
        shipping.pickupStatus,
        shipping.shiprocketPickupStatus,
    );

    return {
        awb,
        shiprocketOrderId,
        courierName: pickFirst(shipping.courierName, shipping.courier_name),
        status,
        trackingUrl: pickFirst(shipping.trackingUrl),
        estimatedDelivery: pickFirst(shipping.estimatedDelivery),
        lastSyncedAt: pickFirst(shipping.shiprocketLastSyncedAt),
        provisioningError: pickFirst(shipping.shiprocketProvisioningError),
        canTrack: Boolean(awb),
    };
};

const getTrackingSummary = (tracking) => {
    const summary = tracking?.summary || {};
    const latestActivity = Array.isArray(tracking?.activities) ? tracking.activities[0] : null;
    return {
        status: pickFirst(summary.status, latestActivity?.status),
        courierName: pickFirst(summary.courierName),
        estimatedDelivery: pickFirst(summary.estimatedDeliveryDate),
        deliveredAt: pickFirst(summary.deliveredAt),
        location: pickFirst(latestActivity?.location),
        updatedAt: pickFirst(latestActivity?.date),
    };
};

const ProfilePage = () => {
    const {
        customer,
        orders,
        isAuthenticated,
        loading,
        logout,
        updateCustomerProfile,
        changeCustomerPassword,
        getAuthToken,
        refreshCustomer,
    } = useAuth();
    const { items: cartItems, totalItems } = useCart();
    const { getProduct } = useCatalog();
    const navigate = useNavigate();
    const [externalProducts, setExternalProducts] = useState({});
    const [profileForm, setProfileForm] = useState({ name: '', email: '' });
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileSuccess, setProfileSuccess] = useState('');
    const [profileError, setProfileError] = useState('');
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordSuccess, setPasswordSuccess] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [trackingByAwb, setTrackingByAwb] = useState({});
    const [trackingLoadingByAwb, setTrackingLoadingByAwb] = useState({});
    const [orderRequests, setOrderRequests] = useState([]);
    const [orderRequestsError, setOrderRequestsError] = useState('');

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            navigate('/login');
        }
    }, [loading, isAuthenticated, navigate]);

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    useEffect(() => {
        setProfileForm({
            name: customer?.name || '',
            email: customer?.email || '',
        });
    }, [customer?.email, customer?.name]);

    useEffect(() => {
        if (!customer) {
            setOrderRequests([]);
            setOrderRequestsError('');
            return undefined;
        }

        let cancelled = false;

        (async () => {
            try {
                const token = getAuthToken?.();
                if (!token) return;
                const requests = await fetchMyOrderRequests(token);
                if (!cancelled) {
                    setOrderRequests(Array.isArray(requests) ? requests : []);
                    setOrderRequestsError('');
                }
            } catch (error) {
                if (!cancelled) {
                    setOrderRequests([]);
                    setOrderRequestsError(error?.message || 'Unable to load return and exchange requests.');
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [customer, getAuthToken]);

    const handleProfileInput = (field, value) => {
        setProfileForm((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handlePasswordInput = (field, value) => {
        setPasswordForm((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleSaveProfile = async (event) => {
        event.preventDefault();
        setProfileError('');
        setProfileSuccess('');

        const updates = {
            name: profileForm.name.trim(),
            email: profileForm.email.trim(),
        };

        if (!updates.name && !updates.email) {
            setProfileError('Please provide your name or email.');
            return;
        }

        setProfileSaving(true);
        const result = await updateCustomerProfile(updates);
        setProfileSaving(false);
        if (!result?.success) {
            setProfileError(result?.error || 'Unable to update profile.');
            return;
        }
        setProfileSuccess('Profile updated successfully.');
        if (typeof refreshCustomer === 'function') {
            await refreshCustomer();
        }
    };

    const handleChangePassword = async (event) => {
        event.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        const currentPassword = passwordForm.currentPassword;
        const newPassword = passwordForm.newPassword;
        const confirmPassword = passwordForm.confirmPassword;

        if (!currentPassword || !newPassword || !confirmPassword) {
            setPasswordError('Please fill all password fields.');
            return;
        }
        if (newPassword.length < 6) {
            setPasswordError('New password must be at least 6 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError('New password and confirm password must match.');
            return;
        }

        setPasswordSaving(true);
        const result = await changeCustomerPassword({ currentPassword, newPassword });
        setPasswordSaving(false);
        if (!result?.success) {
            setPasswordError(result?.error || 'Unable to change password.');
            return;
        }

        setPasswordForm({
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
        });
        setPasswordSuccess('Password changed successfully.');
    };

    const cartHandles = useMemo(
        () => Array.from(new Set(cartItems.map((item) => item.slug).filter(Boolean))),
        [cartItems],
    );

    useEffect(() => {
        const missingHandles = cartHandles.filter(
            (handle) => !getProduct(handle) && !externalProducts[handle],
        );
        if (!missingHandles.length) return;

        let cancelled = false;

        (async () => {
            const fetched = {};
            for (const handle of missingHandles) {
                try {
                    const product = await fetchProductByHandle(handle);
                    if (product) {
                        fetched[handle] = product;
                    }
                } catch (error) {
                    console.error(`Failed to load cart preview product "${handle}"`, error);
                }
            }

            if (cancelled || !Object.keys(fetched).length) return;
            setExternalProducts((prev) => ({ ...prev, ...fetched }));
        })();

        return () => {
            cancelled = true;
        };
    }, [cartHandles, externalProducts, getProduct]);

    useEffect(() => {
        const awbs = Array.from(
            new Set(
                (Array.isArray(orders) ? orders : [])
                    .map((order) => getShipmentInfo(order).awb)
                    .filter(Boolean),
            ),
        ).filter((awb) => !trackingByAwb[awb] && !trackingLoadingByAwb[awb]);

        if (!awbs.length) return undefined;

        let cancelled = false;
        setTrackingLoadingByAwb((prev) => ({
            ...prev,
            ...Object.fromEntries(awbs.map((awb) => [awb, true])),
        }));

        (async () => {
            const results = {};
            for (const awb of awbs) {
                try {
                    results[awb] = { data: await fetchShipmentTracking(awb), error: '' };
                } catch (error) {
                    results[awb] = {
                        data: null,
                        error: error?.message || 'Tracking is not available right now.',
                    };
                }
            }

            if (cancelled) return;
            setTrackingByAwb((prev) => ({ ...prev, ...results }));
            setTrackingLoadingByAwb((prev) => {
                const next = { ...prev };
                awbs.forEach((awb) => {
                    delete next[awb];
                });
                return next;
            });
        })();

        return () => {
            cancelled = true;
        };
    }, [orders, trackingByAwb, trackingLoadingByAwb]);

    if (loading) {
        return (
            <div className="min-h-screen pt-32 pb-16 site-shell flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    if (!customer) {
        return null;
    }

    const displayName = customer.name || customer.email || 'Guest';

    const currencyHint = orders[0]?.totals?.currency;

    const pendingCount = orders.filter((order) => order.status === 'PENDING').length;
    const inTransit = orders.filter((order) => order.status === 'PAID').length;
    const delivered = orders.filter((order) => order.status === 'FULFILLED').length;
    const cancelled = orders.filter((order) => order.status === 'CANCELLED').length;

    const stats = [
        { label: 'Total orders', value: orders.length },
        { label: 'Processing', value: pendingCount },
        { label: 'In transit', value: inTransit },
        { label: 'Delivered', value: delivered },
        { label: 'Cancelled', value: cancelled },
    ];

    const getFulfillmentBadge = (status) => {
        const normalized = (status || '').toUpperCase();
        if (normalized === 'FULFILLED') return { label: 'Delivered', tone: 'success', Icon: BadgeCheck };
        if (normalized === 'PAID') return { label: 'In transit', tone: 'info', Icon: Truck };
        if (normalized === 'PENDING') return { label: 'Processing', tone: 'muted', Icon: Truck };
        if (normalized === 'CANCELLED' || normalized === 'CANCELED') {
            return { label: 'Cancelled', tone: 'danger', Icon: AlertCircle };
        }
        return { label: formatStatusLabel(status, 'Processing'), tone: 'muted', Icon: Truck };
    };

    const formatDate = (date) => {
        if (!date) return '';
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) return '';
        return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const getRequestBadge = (status) => {
        const normalized = String(status || '').toUpperCase();
        if (normalized === 'APPROVED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
        if (normalized === 'REJECTED') return 'border-rose-200 bg-rose-50 text-rose-700';
        if (normalized === 'COMPLETED') return 'border-blue-200 bg-blue-50 text-blue-700';
        return 'border-amber-200 bg-amber-50 text-amber-800';
    };

    const cartPreviewItems = useMemo(
        () =>
            cartItems.map((item) => ({
                id: item.id,
                slug: item.slug,
                size: item.size ?? null,
                quantity: Number(item.quantity ?? 1),
                product: getProduct(item.slug) ?? externalProducts[item.slug] ?? null,
            })),
        [cartItems, externalProducts, getProduct],
    );
    const visibleCartPreviewItems = useMemo(
        () => cartPreviewItems.slice(0, 3),
        [cartPreviewItems],
    );
    const hiddenCartPreviewCount = Math.max(cartPreviewItems.length - visibleCartPreviewItems.length, 0);

    const renderOrderCard = (order) => {
        const items = Array.isArray(order.items) ? order.items : [];
        const itemCount = items.reduce((sum, item) => sum + Number(item?.quantity ?? 0), 0);
        const fulfillment = getFulfillmentBadge(order.status);
        const orderTotal = formatMoney(
            order?.totals?.total ?? 0,
            order?.totals?.currency ?? currencyHint
        );
        const processedDate = formatDate(order.createdAt);
        const shipment = getShipmentInfo(order);
        const liveTracking = shipment.awb ? trackingByAwb[shipment.awb] : null;
        const liveSummary = getTrackingSummary(liveTracking?.data);
        const liveTrackingStatus = liveSummary.status || shipment.status;
        const liveCourierName = liveSummary.courierName || shipment.courierName;
        const liveEta = liveSummary.estimatedDelivery || shipment.estimatedDelivery;
        const trackHref = shipment.awb ? `/track/${encodeURIComponent(shipment.awb)}` : '';
        const requestsForOrder = orderRequests.filter((request) => request.orderId === order.id);

        const normalizedStatus = (order.status || '').toUpperCase();
        const isDelivered = normalizedStatus === 'FULFILLED';
        const isCancelled = normalizedStatus === 'CANCELLED' || normalizedStatus === 'CANCELED';
        const canCancel = normalizedStatus === 'PENDING' || normalizedStatus === 'PAID';
        const primaryAction = isDelivered ? 'Return' : 'Cancel';
        const primaryActionUrl = `/cancel-refund-exchange?orderId=${encodeURIComponent(order.id)}&action=${primaryAction.toLowerCase()}`;
        const secondaryAction = isDelivered ? 'Exchange' : null;
        const secondaryActionUrl = secondaryAction ? `/cancel-refund-exchange?orderId=${encodeURIComponent(order.id)}&action=${secondaryAction.toLowerCase()}` : null;

        return (
            <div key={order.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${toneClasses[fulfillment.tone] || toneClasses.muted}`}>
                            {fulfillment.Icon ? <fulfillment.Icon className="w-5 h-5" /> : null}
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-gray-900">{fulfillment.label}</p>
                            {processedDate ? (
                                <p className="text-xs text-gray-500">{isDelivered ? 'Delivered on ' : 'Placed on '}{processedDate}</p>
                            ) : null}
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Order #{order.number || order.id}</p>
                        <p className="text-lg font-extrabold text-gray-900">{orderTotal}</p>
                        <p className="text-xs text-gray-500">{itemCount} item{itemCount === 1 ? '' : 's'}</p>
                    </div>
                </div>

                <div className="py-4 space-y-3">
                    {items.slice(0, 3).map((item, idx) => (
                        <div key={`${order.id}-item-${idx}`} className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-md bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                                {item.image ? (
                                    <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                                ) : (
                                    <span className="text-gray-400 text-xs font-semibold">
                                        {item.name?.slice(0, 2)?.toUpperCase() || '-'}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                                <p className="text-xs text-gray-500">
                                    Qty x{item.quantity}
                                </p>
                            </div>
                        </div>
                    ))}
                    {items.length > 3 ? (
                        <p className="text-xs text-gray-500">+{items.length - 3} more item{items.length - 3 === 1 ? '' : 's'}</p>
                    ) : null}
                </div>

                {!isCancelled ? (
                    <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                                <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
                                    Live Tracking
                                </p>
                                {shipment.canTrack ? (
                                    <>
                                        <p className="mt-1 text-sm font-semibold text-gray-900">
                                            {trackingLoadingByAwb[shipment.awb]
                                                ? 'Checking latest courier update...'
                                                : liveTrackingStatus || 'Shipment is being prepared'}
                                        </p>
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                                            {liveCourierName ? <span>{liveCourierName}</span> : null}
                                            <span>AWB: {shipment.awb}</span>
                                            {liveEta ? <span>ETA: {liveEta}</span> : null}
                                            {liveSummary.location ? <span>Last scan: {liveSummary.location}</span> : null}
                                        </div>
                                        {liveTracking?.error ? (
                                            <p className="mt-2 text-xs text-amber-700">{liveTracking.error}</p>
                                        ) : null}
                                    </>
                                ) : (
                                    <>
                                        <p className="mt-1 text-sm font-semibold text-gray-900">
                                            {shipment.status || 'Shipment will appear after dispatch'}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-600">
                                            Tracking AWB is generated after the order is packed and assigned to a courier.
                                        </p>
                                        {shipment.provisioningError ? (
                                            <p className="mt-2 text-xs text-amber-700">{shipment.provisioningError}</p>
                                        ) : null}
                                    </>
                                )}
                            </div>
                            {trackHref ? (
                                <Link
                                    to={trackHref}
                                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                                >
                                    Track Live
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                </Link>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                {requestsForOrder.length > 0 ? (
                    <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
                            Return / Exchange Updates
                        </p>
                        <div className="mt-3 space-y-2">
                            {requestsForOrder.map((request) => {
                                const typeLabel = formatStatusLabel(request.type, 'Request');
                                const statusLabel = formatStatusLabel(request.status, 'Requested');
                                const requestDate = formatDate(request.createdAt);
                                const requestedItems = Array.isArray(request.items) ? request.items : [];

                                return (
                                    <div key={request.id} className="rounded-lg border border-white/80 bg-white px-3 py-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-extrabold uppercase tracking-wide text-gray-900">
                                                    {typeLabel}
                                                </span>
                                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${getRequestBadge(request.status)}`}>
                                                    {statusLabel}
                                                </span>
                                            </div>
                                            {requestDate ? <span className="text-xs text-gray-500">{requestDate}</span> : null}
                                        </div>
                                        {request.reason ? (
                                            <p className="mt-1 text-xs text-gray-600">Reason: {request.reason}</p>
                                        ) : null}
                                        {requestedItems.length > 0 ? (
                                            <p className="mt-1 text-xs text-gray-500">
                                                Items: {requestedItems.map((item) => item?.name || item?.id || 'Item').join(', ')}
                                            </p>
                                        ) : null}
                                        <p className="mt-1 text-[11px] text-gray-400">Request ID: {request.id}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null}


                <div className="pt-3 border-t border-gray-100 flex flex-col gap-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Link
                            to={`/orders/${order.id}`}
                            className="w-full rounded-full border border-gray-300 px-4 py-2 text-center text-xs font-semibold text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900 sm:flex-1"
                        >
                            View Details
                        </Link>
                        {!isCancelled && (canCancel || isDelivered) ? (
                            <Link
                                to={primaryActionUrl}
                                className="w-full rounded-full border border-gray-300 px-4 py-2 text-center text-xs font-semibold text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900 sm:flex-1"
                            >
                                {primaryAction}
                            </Link>
                        ) : null}
                        {!isCancelled && secondaryAction ? (
                            <Link
                                to={secondaryActionUrl}
                                className="w-full rounded-full border border-gray-300 px-4 py-2 text-center text-xs font-semibold text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900 sm:flex-1"
                            >
                                {secondaryAction}
                            </Link>
                        ) : null}
                    </div>
                    {isCancelled ? (
                        <p className="text-xs text-gray-500">This order was cancelled.</p>
                    ) : null}
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[var(--color-bg-page)]">
            <div className="site-shell pt-24 pb-14 space-y-8">
                <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 p-6 shadow-sm">
                    <div className="absolute inset-0 bg-white/40 pointer-events-none" aria-hidden="true"></div>
                    <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="w-16 h-16 rounded-full bg-white/80 border border-gray-200 flex items-center justify-center text-gray-900 shadow-sm">
                                <User className="w-8 h-8" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-600">Welcome back</p>
                                <h1 className="text-3xl font-extrabold text-gray-900">
                                    {displayName}
                                </h1>
                                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700 mt-1">
                                    <span className="inline-flex items-center gap-2">
                                        <Mail className="w-4 h-4 text-gray-900" /> {customer.email}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Link
                                to="/checkout/address"
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-white/80 border border-gray-300 text-gray-800 hover:bg-white transition-colors"
                            >
                                <MapPin className="w-4 h-4" />
                                Manage addresses
                            </Link>
                            <button
                                onClick={handleLogout}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-black text-white hover:bg-gray-900 transition-colors"
                            >
                                <LogOut className="w-4 h-4" />
                                Sign out
                            </button>
                        </div>
                    </div>

                    <div className="relative mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                        {stats.map((stat) => (
                            <div
                                key={stat.label}
                                className="rounded-xl bg-white/80 border border-white/70 px-4 py-3 shadow-sm backdrop-blur-sm"
                            >
                                <p className="text-xs uppercase tracking-wide text-gray-500">{stat.label}</p>
                                <p className="text-xl font-extrabold text-gray-900">{stat.value}</p>
                                {stat.helper ? <p className="text-xs text-gray-500">{stat.helper}</p> : null}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-4">
                                <User className="w-4 h-4 text-gray-900" />
                                <p className="text-sm font-semibold text-gray-900">Profile & contact</p>
                            </div>
                            <div className="space-y-5 text-sm text-gray-700">
                                <form onSubmit={handleSaveProfile} className="space-y-3">
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            Full Name
                                        </label>
                                        <input
                                            type="text"
                                            value={profileForm.name}
                                            onChange={(event) => handleProfileInput('name', event.target.value)}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                            placeholder="Your name"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            Email
                                        </label>
                                        <input
                                            type="email"
                                            value={profileForm.email}
                                            onChange={(event) => handleProfileInput('email', event.target.value)}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                            placeholder="you@example.com"
                                        />
                                    </div>
                                    {profileError ? <p className="text-xs text-rose-600">{profileError}</p> : null}
                                    {profileSuccess ? <p className="text-xs text-emerald-600">{profileSuccess}</p> : null}
                                    <button
                                        type="submit"
                                        disabled={profileSaving}
                                        className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:bg-gray-300"
                                    >
                                        {profileSaving ? 'Saving...' : 'Save Profile'}
                                    </button>
                                </form>

                                <div className="border-t border-gray-100 pt-4">
                                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        Change Password
                                    </p>
                                    <form onSubmit={handleChangePassword} className="space-y-3">
                                        <input
                                            type="password"
                                            value={passwordForm.currentPassword}
                                            onChange={(event) => handlePasswordInput('currentPassword', event.target.value)}
                                            placeholder="Current password"
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                        />
                                        <input
                                            type="password"
                                            value={passwordForm.newPassword}
                                            onChange={(event) => handlePasswordInput('newPassword', event.target.value)}
                                            placeholder="New password"
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                        />
                                        <input
                                            type="password"
                                            value={passwordForm.confirmPassword}
                                            onChange={(event) => handlePasswordInput('confirmPassword', event.target.value)}
                                            placeholder="Confirm new password"
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                        />
                                        {passwordError ? <p className="text-xs text-rose-600">{passwordError}</p> : null}
                                        {passwordSuccess ? <p className="text-xs text-emerald-600">{passwordSuccess}</p> : null}
                                        <button
                                            type="submit"
                                            disabled={passwordSaving}
                                            className="rounded-full border border-gray-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 hover:border-gray-900 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {passwordSaving ? 'Updating...' : 'Update Password'}
                                        </button>
                                    </form>
                                </div>

                                <div className="text-sm text-gray-600 bg-gray-50 border border-dashed border-gray-200 rounded-lg p-3">
                                    Add a shipping address during checkout to speed up delivery updates.
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                            <p className="text-sm font-semibold text-gray-900 mb-2">Need help?</p>
                            <p className="text-sm text-gray-600 mb-4">
                                Track deliveries, raise returns, or chat with support directly from your order detail page.
                            </p>
                            <div className="flex gap-2">
                                <Link
                                    to="/contact"
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-gray-900 text-white hover:bg-black transition-colors"
                                >
                                    Contact support
                                </Link>
                                <Link
                                    to="/legal/return-policy"
                                    className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-semibold border border-gray-200 text-gray-800 hover:bg-gray-50 transition-colors"
                                >
                                    Return policy
                                </Link>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Package className="w-5 h-5 text-gray-900" />
                                <div>
                                    <p className="text-lg font-extrabold text-gray-900">Orders & returns</p>
                                    <p className="text-sm text-gray-600">Live status for deliveries, returns, and refunds.</p>
                                    {orderRequestsError ? (
                                        <p className="mt-1 text-xs text-amber-700">{orderRequestsError}</p>
                                    ) : null}
                                </div>
                            </div>
                            <Link
                                to="/products"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border border-gray-200 text-gray-800 hover:bg-gray-50 transition-colors"
                            >
                                Continue shopping
                                <ArrowUpRight className="w-4 h-4" />
                            </Link>
                        </div>

                        {orders.length === 0 ? (
                            totalItems > 0 ? (
                                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                                    <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-gray-100 text-gray-900 flex items-center justify-center">
                                        <Package className="w-6 h-6" />
                                    </div>
                                    <p className="text-lg font-semibold text-gray-900 text-center">No orders yet</p>
                                    <p className="text-sm text-gray-600 mb-4 text-center">
                                        You have {totalItems} item{totalItems === 1 ? '' : 's'} in your bag. Complete checkout to see orders here.
                                    </p>

                                    <div className="rounded-xl border border-gray-100 divide-y divide-gray-100">
                                        {visibleCartPreviewItems.map((item) => {
                                            const imageUrl = getProductImageUrl(item.product);
                                            const title = item.product?.title || item.slug || 'Product';

                                            return (
                                                <div key={item.id} className="flex items-center gap-3 px-3 py-3">
                                                    <div className="h-14 w-12 overflow-hidden rounded-md bg-gray-100 border border-gray-200">
                                                        {imageUrl ? (
                                                            <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
                                                        ) : (
                                                            <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-gray-500">
                                                                {(title || 'P').slice(0, 1).toUpperCase()}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
                                                        <p className="text-xs text-gray-500">
                                                            Qty x{item.quantity}
                                                            {item.size ? ` | Size ${item.size}` : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {hiddenCartPreviewCount > 0 ? (
                                        <p className="mt-3 text-xs text-gray-500 text-center">
                                            +{hiddenCartPreviewCount} more item{hiddenCartPreviewCount === 1 ? '' : 's'} in bag
                                        </p>
                                    ) : null}

                                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                                        <Link
                                            to="/cart"
                                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold bg-black text-white hover:bg-gray-900 transition-colors"
                                        >
                                            Go to bag
                                            <ArrowUpRight className="w-4 h-4" />
                                        </Link>
                                        <Link
                                            to="/products"
                                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold border border-gray-200 text-gray-800 hover:bg-gray-50 transition-colors"
                                        >
                                            Continue shopping
                                        </Link>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
                                    <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-gray-100 text-gray-900 flex items-center justify-center">
                                        <Package className="w-6 h-6" />
                                    </div>
                                    <p className="text-lg font-semibold text-gray-900">No orders yet</p>
                                    <p className="text-sm text-gray-600 mb-6">When you shop, your orders, returns, and refunds will show up here.</p>
                                    <Link
                                        to="/products"
                                        className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold bg-black text-white hover:bg-gray-900 transition-colors"
                                    >
                                        Start shopping
                                        <ArrowUpRight className="w-4 h-4" />
                                    </Link>
                                </div>
                            )
                        ) : (
                            <div className="space-y-4">
                                {orders.map((order) => renderOrderCard(order))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
