import axios from 'axios';

const resolveApiBase = () => {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  if (import.meta.env.PROD && typeof window !== 'undefined') {
    return window.location.origin.replace(/\/+$/, '');
  }
  return '';
};

const API_BASE = resolveApiBase();
const SHIPROCKET_API_BASE = API_BASE ? `${API_BASE}/api/shiprocket` : '/api/shiprocket';

const shiprocketClient = axios.create({
  baseURL: SHIPROCKET_API_BASE,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const unwrap = (response) => response?.data?.data ?? response?.data ?? null;

const normalizeError = (error, fallbackMessage) => {
  const message =
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    fallbackMessage;
  const wrapped = new Error(message);
  wrapped.status = error?.response?.status;
  wrapped.details = error?.response?.data?.error?.details || error?.response?.data || null;
  return wrapped;
};

export const authenticateShiprocket = async () => {
  try {
    const response = await shiprocketClient.post('/auth');
    return unwrap(response);
  } catch (error) {
    throw normalizeError(error, 'Unable to authenticate Shiprocket.');
  }
};

export const createShiprocketOrder = async (payload) => {
  try {
    const response = await shiprocketClient.post('/orders', payload);
    return unwrap(response);
  } catch (error) {
    throw normalizeError(error, 'Unable to create Shiprocket order.');
  }
};

export const trackShiprocketShipment = async ({ awb, orderId }) => {
  if (!awb && !orderId) {
    throw new Error('Enter an AWB number or Shiprocket order ID.');
  }

  try {
    const response = await shiprocketClient.get('/track', {
      params: {
        awb,
        order_id: orderId,
      },
    });
    return unwrap(response);
  } catch (error) {
    throw normalizeError(error, 'Unable to fetch tracking details.');
  }
};

export const trackOrder = async ({ awbCode, orderId }) =>
  trackShiprocketShipment({ awb: awbCode, orderId });

export const checkServiceability = async (
  deliveryPostcode,
  pickupPostcode = '711303',
  weight = 0.5,
  cod = 1,
) => {
  try {
    const response = await shiprocketClient.get('/serviceability', {
      params: {
        pickup_postcode: pickupPostcode,
        delivery_postcode: deliveryPostcode,
        weight,
        cod,
      },
    });
    return unwrap(response);
  } catch (error) {
    throw normalizeError(error, 'Unable to fetch serviceability.');
  }
};

export const formatServiceabilityResponse = (data) => {
  const source = data?.data || data || {};
  const companies = Array.isArray(source.available_courier_companies)
    ? source.available_courier_companies
    : [];

  if (!companies.length) {
    return { serviceable: false };
  }

  const courier = companies[0];

  return {
    serviceable: true,
    city: source.city || '',
    state: source.state || '',
    days: courier?.etd || '3-5',
    cod: Number(courier?.cod) === 1,
    courierName: courier?.courier_name || 'Shiprocket courier',
    returnAvailable: true,
    exchangeAvailable: true,
  };
};

export const formatTrackingResponse = (payload) => {
  const summary = payload?.summary || {};
  return {
    awb: payload?.lookup?.awb || '',
    orderId: payload?.lookup?.orderId || '',
    status: summary.status || 'Tracking received',
    courierName: summary.courierName || '',
    estimatedDeliveryDate: summary.estimatedDeliveryDate || '',
    deliveredAt: summary.deliveredAt || '',
    origin: summary.origin || '',
    destination: summary.destination || '',
    activities: Array.isArray(payload?.activities) ? payload.activities : [],
  };
};
