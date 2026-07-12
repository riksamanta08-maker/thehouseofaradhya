// src/App.jsx
import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/auth-context';
import { AdminProvider } from './contexts/admin-auth-context';
import AnalyticsTracker from './components/AnalyticsTracker';
import MetaAdvancedMatchingTracker from './components/MetaAdvancedMatchingTracker';
import ScrollToTop from './components/ScrollToTop';
import { AdminToastProvider } from './components/admin/AdminToaster';
import { fetchSiteSettings } from './lib/api';
import { OWNER_CONTROL_PATH } from './lib/adminOwner';

const Layout = lazy(() => import('./components/Layout'));
const HomePage = lazy(() => import('./pages/HomePage'));
const ProductDetails = lazy(() => import('./pages/ProductDetails'));
const CartPage = lazy(() => import('./pages/CartPage'));
const AllProductsPage = lazy(() => import('./pages/AllProductsPage'));
const Address = lazy(() => import('./pages/Address'));
const Payment = lazy(() => import('./pages/Payment'));
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation'));
const OrderDetails = lazy(() => import('./pages/OrderDetails'));
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage'));
const TrackShipmentPage = lazy(() => import('./pages/TrackShipmentPage'));
const LegalPage = lazy(() => import('./pages/LegalPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const BlogPage = lazy(() => import('./pages/BlogPage'));
const BlogArticlePage = lazy(() => import('./pages/BlogArticlePage'));
const KeywordLandingPage = lazy(() => import('./pages/KeywordLandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ShiprocketPage = lazy(() => import('./pages/ShiprocketPage'));
const WishlistPage = lazy(() => import('./pages/WishlistPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const CancelRefundExchange = lazy(() => import('./pages/CancelRefundExchange'));
const CollectionPage = lazy(() => import('./pages/CollectionPage'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'));
const AdminProductForm = lazy(() => import('./pages/admin/AdminProductForm'));
const AdminCollections = lazy(() => import('./pages/admin/AdminCollections'));
const AdminCollectionForm = lazy(() => import('./pages/admin/AdminCollectionForm'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminReviews = lazy(() => import('./pages/admin/AdminReviews'));
const AdminDiscounts = lazy(() => import('./pages/admin/AdminDiscounts'));
const AdminHomepageSections = lazy(() => import('./pages/admin/AdminHomepageSections'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminWebsiteControl = lazy(() => import('./pages/admin/AdminWebsiteControl'));

const RouteFallback = () => <div className="min-h-screen bg-white" />;

const OwnerWebsiteControlRoute = () => (
  <AdminProvider>
    <AdminToastProvider>
      <main className="min-h-screen bg-[#0a0f1c] px-6 py-8 text-slate-100">
        <div className="mx-auto max-w-5xl">
          <AdminWebsiteControl />
        </div>
      </main>
    </AdminToastProvider>
  </AdminProvider>
);

const SiteOfflineScreen = ({ message }) => (
  <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
    <div className="max-w-md text-center">
      <p className="text-xs uppercase tracking-[0.35em] text-white/45">Aradhya</p>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">{message?.title || 'Website is offline'}</h1>
      <p className="mt-4 text-sm leading-6 text-white/65">
        {message?.message || message || 'We are updating the store. Please check back soon.'}
      </p>
    </div>
  </main>
);

const SiteStatusGate = ({ children }) => {
  const location = useLocation();
  const [settings, setSettings] = useState(null);
  const isAdminPath = location.pathname.startsWith('/admin');
  const isOwnerPath = location.pathname === OWNER_CONTROL_PATH;

  useEffect(() => {
    if (isAdminPath || isOwnerPath) return undefined;
    let active = true;

    fetchSiteSettings()
      .then((data) => {
        if (active) setSettings(data);
      })
      .catch(() => {
        if (active) setSettings({ isOnline: true });
      });

    return () => {
      active = false;
    };
  }, [isAdminPath, isOwnerPath]);

  if (!isAdminPath && !isOwnerPath && settings?.isOnline === false) {
    return <SiteOfflineScreen message={settings} />;
  }

  return children;
};

export default function App() {
  return (
    <AuthProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <MetaAdvancedMatchingTracker />
        <AnalyticsTracker />
        <ScrollToTop />
        <SiteStatusGate>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
            <Route
              path="/admin/login"
              element={(
                <AdminProvider>
                  <AdminLogin />
                </AdminProvider>
              )}
            />
            <Route
              path="/admin"
              element={(
                <AdminProvider>
                  <AdminLayout />
                </AdminProvider>
              )}
            >
              <Route index element={<AdminDashboard />} />
              <Route path="products" element={<AdminProducts />} />
              <Route path="products/new" element={<AdminProductForm />} />
              <Route path="products/:id" element={<AdminProductForm />} />
              <Route path="homepage-sections" element={<AdminHomepageSections />} />
              <Route path="collections" element={<AdminCollections />} />
              <Route path="collections/new" element={<AdminCollectionForm />} />
              <Route path="collections/:id" element={<AdminCollectionForm />} />
              <Route path="orders" element={<AdminOrders />} />
              <Route path="discounts" element={<AdminDiscounts />} />
              <Route path="reviews" element={<AdminReviews />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>
            <Route path={OWNER_CONTROL_PATH} element={<OwnerWebsiteControlRoute />} />
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="products" element={<AllProductsPage />} />
              <Route path="collections/:handle" element={<CollectionPage />} />
              <Route path="shoes" element={<AllProductsPage initialCategory="shoes" />} />
              <Route path="shoes/loafers" element={<AllProductsPage initialCategory="loafers" />} />
              <Route path="shoes/boots" element={<AllProductsPage initialCategory="boots" />} />
              <Route path="shoes/sneakers" element={<AllProductsPage initialCategory="sneakers" />} />
              <Route path="shoes/sandals" element={<AllProductsPage initialCategory="sandals" />} />
              <Route path="apparel" element={<Navigate to="/products?category=t-shirts" replace />} />
              <Route path="product/:slug" element={<ProductDetails />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="checkout/address" element={<Address />} />
              <Route path="checkout/payment" element={<Payment />} />
              <Route path="checkout/success" element={<OrderConfirmation />} />
              <Route path="orders" element={<OrderDetails />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="track/:awb" element={<TrackShipmentPage />} />
              <Route path="cancel-refund-exchange" element={<CancelRefundExchange />} />
              <Route path="legal" element={<Navigate to="/legal/privacy-policy" replace />} />
              <Route path="legal/:section" element={<LegalPage />} />
              <Route path="about" element={<AboutPage />} />
              <Route path="contact" element={<ContactPage />} />
              <Route path="blog" element={<BlogPage />} />
              <Route path="blog/:slug" element={<BlogArticlePage />} />
              <Route path="men-outfit-combination" element={<KeywordLandingPage pageKey="men-outfit-combination" />} />
              <Route path="men-outfit-under-2500" element={<KeywordLandingPage pageKey="men-outfit-under-2500" />} />
              <Route path="date-outfit-men-india" element={<KeywordLandingPage pageKey="date-outfit-men-india" />} />
              <Route path="party-outfit-men-india" element={<KeywordLandingPage pageKey="party-outfit-men-india" />} />
              <Route path="college-outfit-men-india" element={<KeywordLandingPage pageKey="college-outfit-men-india" />} />
              <Route path="men-fashion-dark-skin" element={<KeywordLandingPage pageKey="men-fashion-dark-skin" />} />
              <Route path="men-fashion-fair-skin" element={<KeywordLandingPage pageKey="men-fashion-fair-skin" />} />
              <Route path="men-fashion-wheatish-skin" element={<KeywordLandingPage pageKey="men-fashion-wheatish-skin" />} />
              <Route path="men-fashion-neutral-skin" element={<KeywordLandingPage pageKey="men-fashion-neutral-skin" />} />
              <Route path="faq" element={<ContactPage />} />
              <Route path="shiprocket-demo" element={<ShiprocketPage />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="wishlist" element={<WishlistPage />} />
              <Route path="product" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
            </Routes>
          </Suspense>
        </SiteStatusGate>
      </Router>
    </AuthProvider>
  );
}
