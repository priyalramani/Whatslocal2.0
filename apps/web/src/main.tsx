import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';
import { setAnalyticsContext, trackPageView } from './lib/analytics';
import { resolveCity } from './lib/city';
import { initInstall } from './lib/install';

// Set the city context BEFORE the first page_view so the landing visit is
// tagged with its city — otherwise the "visitors today" badge (which counts
// distinct sessions for a city) would miss every visit that just lands without
// searching. First path segment is the city for /:city and /:city/:kind; for
// every other route resolveCity() falls back to the default city.
const firstSeg = location.pathname.split('/').filter(Boolean)[0];
const startCity = resolveCity(firstSeg);
setAnalyticsContext({ city: startCity.name, pincode: startCity.pincode });

trackPageView();

// PWA: capture the install prompt as early as possible + register the service
// worker at load, so the app is installable (and SW-controlled) independent of
// any push opt-in. Both are best-effort and never block render.
initInstall();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
