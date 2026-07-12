# Copilot Instructions — Marvelle (my-app)

## Architecture Overview

Monorepo with a **React 18 SPA** (Vite) and an **Express 5 API** (`Backend/`), both deployed to **Vercel** as a single project. The `api/[...path].js` serverless function imports the Express app to handle all `/api/*` requests. Database is **PostgreSQL on Neon** via **Prisma 7** with the `@prisma/adapter-pg` driver adapter.

## Project Structure

- `src/` — React frontend (JSX, not TSX). Vite + Tailwind CSS v4 + shadcn/ui (`new-york` style).
- `Backend/` — Express API (CommonJS). Prisma ORM, Cloudinary uploads, JWT auth.
- `api/[...path].js` — Vercel serverless entry that wraps `Backend/index.js`.
- `scripts/dev.mjs` — Spawns both `dev:web` (Vite) and `dev:api` (backend) in parallel.

## Dev Workflow

```bash
npm run dev          # starts both frontend (:5173) and backend (:5001) concurrently
npm run dev:web      # frontend only
npm run dev:api      # backend only (cd Backend && node index.js)
npm run build        # vite build (frontend only)
npx prisma studio --schema Backend/prisma/schema.prisma  # DB browser
```

`postinstall` runs `prisma generate` from the root. Vite proxies `/api` → `localhost:5001` in dev.

## Backend Conventions

- **Router mount pattern**: 8 route groups at `/api/{users,admin,products,collections,uploads,reviews,orders,shiprocket}` in `Backend/index.js`.
- **Controller pattern**: every handler is `async (req, res, next)` with `try/catch`, calling `next(error)` on failure. Validate with **Zod** schemas (`schema.parse(req.body)`). Respond via `sendSuccess(res, data)` / `sendError(res, status, message)` from `Backend/src/utils/response.js`.
- **DB access**: always `const prisma = await getPrisma()` (lazy async singleton from `Backend/src/db/prismaClient.js`). Never import PrismaClient directly.
- **Auth middleware**: `protect` (JWT verification, attaches `req.user`) and `requireRole('ADMIN')` from `Backend/src/middleware/auth.js`. Admin routes use both; public catalog routes use neither.
- **JWT**: `signToken` / `verifyToken` in `Backend/src/utils/jwt.js`. 30-day expiry, secret from `JWT_SECRET` env var.
- **File uploads**: Multer → Cloudinary via `Backend/src/utils/cloudinary.js` (`uploadBuffer`, `deleteImage`).
- **Config**: all env vars centralized in `Backend/src/config/env.js` with defaults.

## Frontend Conventions

- **Import alias**: `@` → `./src` (e.g., `import { cn } from '@/lib/utils'`).
- **Routing**: React Router v6. Customer routes under `<Layout>`, admin routes under `/admin` with `<AdminLayout>`. Product detail route: `/product/:slug`.
- **State management**: React Context only — `AuthProvider` (app-wide), `AdminProvider` (admin routes only), `CartProvider`, `CatalogProvider`, `WishlistProvider` (customer Layout only).
- **Auth tokens**: stored in `localStorage` as `customer_auth_token` (customer) and `admin_auth_token` (admin). Separate providers, separate login flows.
- **API client**: `src/lib/api.js` — raw `fetch` wrappers, no axios. Base URL from `VITE_API_BASE_URL` env var. JWT passed per-call, not via global interceptor.
- **Cart IDs**: composite key `slug::size` (e.g., `red-lipstick::30ml`). Cart persisted in `localStorage` key `evrydae-cart-v1`.
- **UI toolkit**: Tailwind CSS v4 + shadcn/ui primitives (`cn()` = `twMerge(clsx(...))`). Icons from `lucide-react`.
- **3D/Animation**: `@react-three/fiber` + drei for 3D logo (`AntigravityLogo.jsx`); `framer-motion` for page transitions and drawer animations. `StrictMode` disabled in dev for R3F compatibility.

## Prisma / Database

- Schema at `Backend/prisma/schema.prisma`. PostgreSQL with CUID primary keys, `createdAt`/`updatedAt` on all models.
- Key models: `User` (roles: ADMIN/CUSTOMER/VENDOR), `Product` → `ProductVariant` → `InventoryLevel`, `Order` (JSON fields for items/totals/shipping), `Review` (PENDING/PUBLISHED/REJECTED status), `Collection` (self-referential hierarchy).
- Migrations: `npx prisma migrate dev --schema Backend/prisma/schema.prisma`.
- Driver adapter: `@prisma/adapter-pg` with Neon serverless pool. Config in `Backend/prisma.config.js`.

## Deployment (Vercel)

- Frontend: static SPA built by Vite → `dist/`.
- Backend: `api/[...path].js` serverless function wraps the Express app. `vercel.json` routes `/api/*` to this function and everything else to `index.html`.
- `Backend/index.js` only calls `app.listen()` when `NODE_ENV !== 'production'`; in production it's purely a module export.

## Key Patterns to Follow

1. **New API endpoint**: add Zod schema + controller in `Backend/src/controllers/`, route in `Backend/src/routes/`, mount in `Backend/index.js`, add fetch wrapper in `src/lib/api.js`.
2. **New page**: create component in `src/pages/`, add route in `src/App.jsx`, use `<Layout>` for customer or nest under `/admin` for admin.
3. **New admin feature**: protect route with `protect` + `requireRole('ADMIN')`, add page under `src/pages/admin/`.
4. **Validation**: always use Zod in controllers; never trust `req.body` directly.
5. **Responses**: always use `sendSuccess` / `sendError` — never raw `res.json()` in controllers.
