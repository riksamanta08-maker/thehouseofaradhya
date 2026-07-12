# Shiprocket Integration

This repository now includes a full Shiprocket integration with:

- a React frontend page at `/shiprocket-demo`
- an Express backend under `backend/`
- backend-managed Shiprocket JWT authentication with automatic refresh
- order creation, shipment tracking, and serviceability APIs

## Folder structure

- Frontend app: `src/`, `public/`, `vite.config.js`
- Backend app: `backend/`
- Shiprocket frontend client: `src/lib/shiprocket.js`
- Shiprocket demo page: `src/pages/ShiprocketPage.jsx`
- Shiprocket backend service: `backend/src/services/shiprocket.service.js`
- Shiprocket backend routes: `backend/src/routes/shiprocket.routes.js`

## 1. Install dependencies

From the repository root:

```bash
npm install
```

From the backend folder:

```bash
cd backend
npm install
cd ..
```

## 2. Configure environment variables

Create the frontend env file by copying `.env.example` to `.env`.

Create the backend env file by copying `backend/.env.example` to `backend/.env`.

Then update `backend/.env` with either a Shiprocket bearer token from Postman or your Shiprocket API user credentials:

- `SHIPROCKET_TOKEN`
- `SHIPROCKET_EMAIL`
- `SHIPROCKET_PASSWORD`
- `SHIPROCKET_PICKUP_LOCATION`
- `SHIPROCKET_PICKUP_PINCODE`

Important:

- If you already have a working bearer token from `POST /v1/external/auth/login`, you can paste it into `SHIPROCKET_TOKEN`.
- If you leave `SHIPROCKET_TOKEN` empty, the backend will log in with `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD`.
- If you set both, the backend will use the pasted token first and fall back to logging in again when that token expires or Shiprocket rejects it.
- Use your Shiprocket API user email/password, not your normal dashboard login.
- The Shiprocket pickup location must already exist in your Shiprocket account.
- Current pickup address: Srs 185 Sarada Dogora, Sarada Dogora, Howrah, West Bengal, India, 711303.
- Warehouse SPOC: Rik Samanta, 7602455773.

## 3. Run the app

From the repository root:

```bash
npm run dev
```

That starts:

- Vite frontend on `http://localhost:5173`
- Express backend on `http://localhost:5001`

## 4. Test the integration

Open:

```text
http://localhost:5173/shiprocket-demo
```

Then:

1. Click `Authenticate with Shiprocket`.
2. Fill the order form and submit it.
3. Copy the returned AWB into the tracking form. If your Shiprocket account supports it, you can also try the Shiprocket order ID fallback.
4. Click `Track Shipment`.

## Backend API routes

- `POST /api/shiprocket/auth`
  - Verifies that the backend can authenticate with Shiprocket.
  - The token stays on the server and is not exposed to the browser.

- `POST /api/shiprocket/orders`
  - Creates an adhoc Shiprocket order.
  - Example payload:

```json
{
  "paymentMethod": "Prepaid",
  "customer": {
    "name": "Mohd Ashiq",
    "email": "customer@example.com",
    "phone": "9876543210",
    "address": "Village Sarada, PO Sarada",
    "city": "Howrah",
    "state": "West Bengal",
    "pincode": "711413"
  },
  "item": {
    "name": "Classic Cotton Kurta",
    "price": 999,
    "quantity": 1
  },
  "package": {
    "weight": 0.5,
    "length": 10,
    "breadth": 10,
    "height": 10
  }
}
```

- `GET /api/shiprocket/track?awb=...`
- `GET /api/shiprocket/serviceability?pickup_postcode=711303&delivery_postcode=110001&weight=0.5&cod=1`

The `order_id` tracking fallback is included in the backend as a best-effort convenience, but Shiprocket's public docs clearly document AWB tracking as the primary tracking path.

## Production notes

- Shiprocket credentials are read only on the backend through environment variables.
- The backend caches the JWT token and refreshes it automatically before expiry.
- If Shiprocket returns `401`, the backend forces a fresh login and retries the request once.
- Axios is used on both frontend and backend for cleaner API handling.

## Reference

- Shiprocket support helpsheet: https://support.shiprocket.in/support/solutions/articles/43000337456-shiprocket-api-document-helpsheet
- Shiprocket public API docs: https://www.postman.com/shiprocketdev/shiprocket-dev-s-public-workspace/documentation/qu05zax/shiprocket-api
