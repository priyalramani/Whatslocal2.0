import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './App';
import { setAnalyticsContext, trackPageView } from './lib/analytics';
import { resolveCity } from './lib/city';

// Set the city context BEFORE the first page_view so the landing visit is
// tagged with its city — otherwise the "visitors today" badge (which counts
// distinct sessions for a city) would miss every visit that just lands without
// searching. First path segment is the city for /:city and /:city/:kind; for
// every other route resolveCity() falls back to the default city.
const firstSeg = location.pathname.split('/').filter(Boolean)[0];
const startCity = resolveCity(firstSeg);
setAnalyticsContext({ city: startCity.name, pincode: startCity.pincode });

trackPageView();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
