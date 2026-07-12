const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const toQuery = (url) => {
  try {
    const parsed = new URL(url, 'http://localhost');
    return parsed.searchParams;
  } catch {
    return new URLSearchParams();
  }
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const token = process.env.SHIPROCKET_TOKEN || process.env.VITE_SHIPROCKET_TOKEN;
  if (!token) {
    return sendJson(res, 500, { error: 'Server not configured for Shiprocket.' });
  }

  const params = toQuery(req.url);
  const awb = params.get('awb');
  const orderId = params.get('order_id');
  const pickupPostcode = params.get('pickup_postcode');
  const deliveryPostcode = params.get('delivery_postcode');
  const weight = params.get('weight') || '0.5';
  const cod = params.get('cod') || '1';

  let targetUrl = null;
  if (awb || orderId) {
    const idPath = awb ? `awb/${encodeURIComponent(awb)}` : `order/${encodeURIComponent(orderId)}`;
    targetUrl = `https://apiv2.shiprocket.in/v1/external/courier/track/${idPath}`;
  } else if (pickupPostcode && deliveryPostcode) {
    targetUrl = `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=${encodeURIComponent(
      pickupPostcode,
    )}&delivery_postcode=${encodeURIComponent(deliveryPostcode)}&weight=${encodeURIComponent(
      weight,
    )}&cod=${encodeURIComponent(cod)}`;
  } else {
    return sendJson(res, 400, { error: 'Missing tracking or serviceability parameters.' });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
      return sendJson(res, 502, {
        error: 'Shiprocket request failed.',
        details: data?.message || data?.errors || text,
      });
    }

    return sendJson(res, 200, data);
  } catch (error) {
    console.error('Shiprocket proxy error:', error);
    return sendJson(res, 500, { error: 'Unable to reach Shiprocket.' });
  }
}
