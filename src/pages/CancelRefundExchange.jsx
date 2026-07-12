import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  ChevronRight,
  RefreshCw,
  Upload,
  XCircle,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  cancelOrder,
  formatMoney,
  requestOrderExchange,
  requestOrderReturn,
} from '../lib/api';
import { useAuth } from '../contexts/auth-context';

const EXCHANGE_REASONS = [
  'Fitting Issue',
  'Damaged / Defective Product',
];

const RETURN_REASONS = [
  'Fitting Issue',
  'Damaged / Defective Product',
  'Quality Issue',
  'Ordered By Mistake',
  'Color Did Not Suit Me',
  'Received Wrong Item',
];

const CANCEL_REASONS = [
  'Ordered By Mistake',
  'Changed My Mind',
  'Expected Delivery Time is Too Long',
  'Found a Better Price Elsewhere',
  'Other',
];

const getReasonsForAction = (action) => {
  if (action === 'exchange') return EXCHANGE_REASONS;
  if (action === 'return') return RETURN_REASONS;
  return CANCEL_REASONS;
};

const formatStatusLabel = (status) =>
  String(status || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const toDisplayOrders = (orders) =>
  (Array.isArray(orders) ? orders : [])
    .slice()
    .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())
    .map((order) => {
      const statusToken = String(order?.status || '').toUpperCase();
      const items = (Array.isArray(order?.items) ? order.items : []).map((item, index) => ({
        lineId:
          String(item?.id || '').trim() ||
          String(item?.sku || '').trim() ||
          `line-${index + 1}`,
        name: item?.name || `Item ${index + 1}`,
        image: item?.image || item?.imageUrl || '',
        size: item?.size || item?.variantTitle || '-',
        color: item?.color || item?.colour || '',
        price: Number(item?.price || 0),
        currency: item?.currency || order?.totals?.currency || 'INR',
        quantity: Number(item?.quantity || 1),
      }));

      return {
        id: order?.id,
        number: order?.number || order?.id,
        dateLabel: formatDate(order?.createdAt),
        statusToken,
        statusLabel: formatStatusLabel(order?.status) || 'Processing',
        canCancel: statusToken === 'PENDING' || statusToken === 'PAID',
        canReturn: statusToken === 'PENDING' || statusToken === 'PAID' || statusToken === 'FULFILLED',
        items,
      };
    });

const CancelRefundExchange = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading, orders, getAuthToken, refreshCustomer } = useAuth();
  const prefillAppliedRef = useRef(false);

  const [step, setStep] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [actionType, setActionType] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  const [reason, setReason] = useState('');
  const [comments, setComments] = useState('');
  const [images, setImages] = useState([]);
  const [bankDetails, setBankDetails] = useState({
    accountName: '',
    accountNumber: '',
    ifsc: '',
    bankName: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [requestResult, setRequestResult] = useState(null);
  const [exchangePreference, setExchangePreference] = useState({
    productName: '',
    size: '',
    color: '',
    notes: '',
  });

  const displayOrders = useMemo(() => toDisplayOrders(orders), [orders]);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login?redirect=/cancel-refund-exchange', { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => {
    if (prefillAppliedRef.current) return;
    if (!displayOrders.length) return;

    const params = new URLSearchParams(location.search);
    const orderId = String(params.get('orderId') || '').trim();
    const action = String(params.get('action') || '').trim().toLowerCase();
    if (!orderId) {
      prefillAppliedRef.current = true;
      return;
    }

    const matched = displayOrders.find((order) => order.id === orderId || order.number === orderId);
    if (!matched) {
      prefillAppliedRef.current = true;
      return;
    }

    setSelectedOrder(matched);
    setSelectedItems([]);
    setReason('');
    setComments('');
    setError('');

    const canUseAction =
      (action === 'cancel' && matched.canCancel) ||
      ((action === 'return' || action === 'exchange') && matched.canReturn);

    if (canUseAction) {
      setActionType(action);
      setStep(3);
    } else {
      setStep(2);
    }

    prefillAppliedRef.current = true;
  }, [displayOrders, location.search]);

  const resetFlow = () => {
    setStep(1);
    setSelectedOrder(null);
    setActionType('');
    setSelectedItems([]);
    setReason('');
    setComments('');
    setImages([]);
    setBankDetails({
      accountName: '',
      accountNumber: '',
      ifsc: '',
      bankName: '',
    });
    setExchangePreference({ productName: '', size: '', color: '', notes: '' });
    setError('');
    setSubmitting(false);
  };

  const handleOrderSelect = (order) => {
    setSelectedOrder(order);
    setSelectedItems([]);
    setReason('');
    setComments('');
    setImages([]);
    setError('');
    setStep(2);
  };

  const handleActionSelect = (type) => {
    setActionType(type);
    setSelectedItems([]);
    setReason('');
    setComments('');
    setImages([]);
    setError('');
    setStep(3);
  };

  const toggleItemSelection = (lineId) => {
    setSelectedItems((prev) =>
      prev.includes(lineId)
        ? prev.filter((id) => id !== lineId)
        : [...prev, lineId],
    );
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setImages((prev) => [...prev, { name: file.name, preview }]);
  };

  const submitRequest = async () => {
    if (!selectedOrder?.id) {
      setError('Please select an order.');
      return;
    }
    if (!selectedItems.length) {
      setError('Please select at least one item.');
      return;
    }
    if (!reason) {
      setError('Please select a reason.');
      return;
    }

    if (actionType === 'return') {
      const { accountName, accountNumber, ifsc, bankName } = bankDetails;
      if (!accountName || !accountNumber || !ifsc || !bankName) {
        setError('Please provide complete bank details for return refunds.');
        return;
      }
    }

    const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
    if (!token) {
      setError('Session expired. Please log in again.');
      return;
    }

    const payload = {
      items: selectedItems,
      reason,
      comments: comments || undefined,
      attachments: images.map((img) => img.name),
      bankDetails: actionType === 'return' ? bankDetails : undefined,
      exchangePreference:
        actionType === 'exchange' &&
        (exchangePreference.productName || exchangePreference.size || exchangePreference.color || exchangePreference.notes)
          ? exchangePreference
          : undefined,
    };

    try {
      setSubmitting(true);
      setError('');

      let response = null;
      if (actionType === 'cancel') {
        response = await cancelOrder(token, selectedOrder.id, payload);
      } else if (actionType === 'return') {
        response = await requestOrderReturn(token, selectedOrder.id, payload);
      } else if (actionType === 'exchange') {
        response = await requestOrderExchange(token, selectedOrder.id, payload);
      }

      if (typeof refreshCustomer === 'function') {
        await refreshCustomer();
      }

      setRequestResult(response?.request || response || null);
      setStep(5);
    } catch (submitError) {
      setError(submitError?.message || 'Unable to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !isAuthenticated) {
    return null;
  }

  const renderStep1_SelectOrder = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold mb-4">Select Order</h2>
      {!displayOrders.length ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600">
          No orders found in your account yet.
        </div>
      ) : null}
      {displayOrders.map((order) => (
        <div
          key={order.id}
          className="border border-gray-200 rounded-lg p-4 hover:border-black transition-colors cursor-pointer"
          onClick={() => handleOrderSelect(order)}
        >
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="font-bold">Order #{order.number}</p>
              <p className="text-sm text-gray-500">Ordered on {order.dateLabel || '-'}</p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                order.statusToken === 'FULFILLED'
                  ? 'bg-green-100 text-green-700'
                  : order.statusToken === 'CANCELLED'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-blue-100 text-blue-700'
              }`}
            >
              {order.statusLabel}
            </span>
          </div>
          <div className="space-y-2">
            {order.items.slice(0, 2).map((item) => (
              <div key={`${order.id}-${item.lineId}`} className="flex gap-3">
                {item.image ? (
                  <img src={item.image} alt={item.name} className="w-12 h-12 object-cover rounded bg-gray-100" />
                ) : (
                  <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                    {item.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-gray-500">
                    Qty: {item.quantity}
                    {item.size && item.size !== '-' ? ` • Size: ${item.size}` : ''}
                  </p>
                </div>
              </div>
            ))}
            {order.items.length > 2 ? (
              <p className="text-xs text-gray-500">+{order.items.length - 2} more items</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );

  const renderStep2_SelectAction = () => (
    <div className="space-y-4">
      <button onClick={() => setStep(1)} className="text-sm text-gray-500 mb-2">← Back to orders</button>
      <h2 className="text-xl font-bold mb-4">What would you like to do?</h2>

      {selectedOrder?.canCancel ? (
        <button
          onClick={() => handleActionSelect('cancel')}
          className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-red-500 hover:bg-red-50 transition-all text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Cancel Order</h3>
              <p className="text-sm text-gray-500">Cancel unfulfilled items</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </button>
      ) : null}

      {selectedOrder?.canReturn ? (
        <>
          <button
            onClick={() => handleActionSelect('return')}
            className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-black hover:bg-gray-50 transition-all text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-900">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Return</h3>
                <p className="text-sm text-gray-500">Return items for refund</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            onClick={() => handleActionSelect('exchange')}
            className="w-full flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-black hover:bg-gray-50 transition-all text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-900">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Exchange</h3>
                <p className="text-sm text-gray-500">Exchange for a different size or fit</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </>
      ) : null}

      {!selectedOrder?.canCancel && !selectedOrder?.canReturn ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          This order is not eligible for cancellation, return, or exchange.
        </div>
      ) : null}
    </div>
  );

  const renderStep3_Details = () => (
    <div className="space-y-6">
      <button onClick={() => setStep(2)} className="text-sm text-gray-500">← Back</button>

      <div>
        <h2 className="text-xl font-bold mb-4">
          Select Items to {actionType === 'cancel' ? 'Cancel' : 'Return/Exchange'}
        </h2>
        <div className="space-y-3">
          {(selectedOrder?.items || []).map((item) => (
            <div
              key={item.lineId}
              onClick={() => toggleItemSelection(item.lineId)}
              className={`flex gap-3 p-3 border rounded-lg cursor-pointer ${
                selectedItems.includes(item.lineId) ? 'border-black bg-gray-50' : 'border-gray-200'
              }`}
            >
              <div
                className={`w-5 h-5 mt-1 rounded border flex items-center justify-center ${
                  selectedItems.includes(item.lineId) ? 'bg-black border-black' : 'border-gray-300'
                }`}
              >
                {selectedItems.includes(item.lineId) ? <CheckCircle className="w-3 h-3 text-white" /> : null}
              </div>
              {item.image ? (
                <img src={item.image} alt={item.name} className="w-16 h-16 object-cover rounded bg-gray-100" />
              ) : (
                <div className="w-16 h-16 rounded bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                  {item.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-gray-500">
                  Qty: {item.quantity}
                  {item.size && item.size !== '-' ? ` • Size: ${item.size}` : ''}
                </p>
                <p className="text-sm text-gray-500">
                  {formatMoney(item.price, item.currency)} each
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-bold mb-2">Reason</h3>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black outline-none bg-white text-gray-800"
        >
          <option value="">Select a reason</option>
          {getReasonsForAction(actionType).map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </div>

      <div>
        <h3 className="font-bold mb-2">Comments</h3>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="Provide more details..."
          className="w-full p-3 border border-gray-300 rounded-lg h-24 focus:ring-2 focus:ring-black focus:border-black outline-none resize-none"
        />
      </div>

      {actionType !== 'cancel' ? (
        <div>
          <h3 className="font-bold mb-2">Upload Images (optional)</h3>
          <div className="flex gap-3 flex-wrap">
            {images.map((img, index) => (
              <img key={`${img.name}-${index}`} src={img.preview} alt={img.name} className="w-20 h-20 object-cover rounded-lg border" />
            ))}
            <label className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
              <Upload className="w-5 h-5 text-gray-400" />
              <span className="text-[10px] text-gray-500 mt-1">Add Photo</span>
              <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
            </label>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <button
        disabled={selectedItems.length === 0 || !reason || submitting}
        onClick={() => {
          if (actionType === 'exchange') {
            setStep(3.5);
          } else if (actionType === 'return') {
            setStep(4);
          } else {
            submitRequest();
          }
        }}
        className="w-full bg-black text-white py-3 rounded-lg font-bold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting
          ? 'Submitting...'
          : actionType === 'exchange'
            ? 'Next: Choose Replacement'
            : actionType === 'return'
              ? 'Next: Refund Details'
              : 'Submit Request'}
      </button>
    </div>
  );

  const renderStep3_5_ExchangePreference = () => {
    const originalItems = (selectedOrder?.items || []).filter((item) => selectedItems.includes(item.lineId));
    const originalItem = originalItems[0];
    return (
      <div className="space-y-6">
        <button onClick={() => setStep(3)} className="text-sm text-gray-500">← Back</button>
        <div>
          <h2 className="text-xl font-bold mb-1">Choose Your Replacement</h2>
          <p className="text-sm text-gray-500 mb-4">
            Tell us what you'd like instead. Our team will confirm availability before processing.
          </p>
        </div>

        {originalItem ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mb-2">Returning</p>
            <div className="flex gap-3 items-center">
              {originalItem.image ? (
                <img src={originalItem.image} alt={originalItem.name} className="w-14 h-14 rounded object-cover bg-gray-100" />
              ) : null}
              <div>
                <p className="font-semibold text-sm">{originalItem.name}</p>
                <p className="text-xs text-gray-500">Size: {originalItem.size || '-'}</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1">Product Name / Style you want <span className="font-normal text-gray-400">(optional)</span></label>
            <input
              type="text"
              value={exchangePreference.productName}
              onChange={(e) => setExchangePreference({ ...exchangePreference, productName: e.target.value })}
              placeholder="e.g. Blue Linen Kurta Set, Same item different size"
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1">Size <span className="font-normal text-gray-400">(optional)</span></label>
              <select
                value={exchangePreference.size}
                onChange={(e) => setExchangePreference({ ...exchangePreference, size: e.target.value })}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black outline-none bg-white"
              >
                <option value="">Select size</option>
                <option value="XS">XS</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
                <option value="XXL">XXL</option>
                <option value="3XL">3XL</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold mb-1">Color <span className="font-normal text-gray-400">(optional)</span></label>
              <input
                type="text"
                value={exchangePreference.color}
                onChange={(e) => setExchangePreference({ ...exchangePreference, color: e.target.value })}
                placeholder="e.g. Navy Blue, White"
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold mb-1">Additional Notes <span className="font-normal text-gray-400">(optional)</span></label>
            <textarea
              value={exchangePreference.notes}
              onChange={(e) => setExchangePreference({ ...exchangePreference, notes: e.target.value })}
              placeholder="Any other details about what you want..."
              className="w-full p-3 border border-gray-300 rounded-lg h-20 focus:ring-2 focus:ring-black focus:border-black outline-none resize-none"
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <button
          onClick={submitRequest}
          disabled={submitting}
          className="w-full bg-black text-white py-3 rounded-lg font-bold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting...' : 'Submit Exchange Request'}
        </button>

        <p className="text-center text-xs text-gray-400">
          You can skip these fields — our team will contact you to confirm the replacement.
        </p>
      </div>
    );
  };

  const renderStep4_BankDetails = () => (
    <div className="space-y-6">
      <button onClick={() => setStep(3)} className="text-sm text-gray-500">← Back</button>
      <h2 className="text-xl font-bold">Refund Method</h2>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
        <p className="text-sm text-yellow-800">
          For verification purposes, provide your bank account details. Refunds are processed
          within 5-7 working days after quality check.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Account Holder Name</label>
          <input
            type="text"
            value={bankDetails.accountName}
            onChange={(e) => setBankDetails({ ...bankDetails, accountName: e.target.value })}
            className="w-full p-2.5 border border-gray-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Account Number</label>
          <input
            type="text"
            value={bankDetails.accountNumber}
            onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
            className="w-full p-2.5 border border-gray-300 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">IFSC Code</label>
          <input
            type="text"
            value={bankDetails.ifsc}
            onChange={(e) => setBankDetails({ ...bankDetails, ifsc: e.target.value })}
            className="w-full p-2.5 border border-gray-300 rounded-lg uppercase"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Bank Name</label>
          <input
            type="text"
            value={bankDetails.bankName}
            onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
            className="w-full p-2.5 border border-gray-300 rounded-lg"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <button
        onClick={submitRequest}
        disabled={submitting}
        className="w-full bg-black text-white py-3 rounded-lg font-bold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Submitting...' : 'Submit Return Request'}
      </button>
    </div>
  );

  const renderStep5_Success = () => (
    <div className="text-center py-12">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle className="w-10 h-10 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Request Submitted!</h2>
      <p className="text-gray-600 mb-8 max-w-md mx-auto">
        Your {actionType} request has been submitted successfully. You can track updates from your
        profile orders.
      </p>
      <div className="space-y-3">
        <p className="font-mono bg-gray-100 inline-block px-4 py-2 rounded text-sm">
          Request ID: {requestResult?.id || 'N/A'}
        </p>
        <br />
        <button
          type="button"
          onClick={resetFlow}
          className="inline-block mt-4 text-black font-bold underline hover:no-underline"
        >
          Submit another request
        </button>
        <br />
        <Link to="/profile" className="inline-block text-black font-semibold underline hover:no-underline">
          Back to profile
        </Link>
      </div>
    </div>
  );

  return (
    <div className="pt-24 pb-16 min-h-screen site-shell bg-gray-50">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 p-6 md:p-8">
        {step === 1 ? renderStep1_SelectOrder() : null}
        {step === 2 ? renderStep2_SelectAction() : null}
        {step === 3 ? renderStep3_Details() : null}
        {step === 3.5 ? renderStep3_5_ExchangePreference() : null}
        {step === 4 ? renderStep4_BankDetails() : null}
        {step === 5 ? renderStep5_Success() : null}
      </div>
    </div>
  );
};

export default CancelRefundExchange;
