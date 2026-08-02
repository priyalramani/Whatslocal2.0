import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { LangProvider } from './lib/i18n';
import { SLUG_TO_KIND, getLastCity } from './lib/city';
import { trackPageView } from './lib/analytics';
import { LanguageGate } from './user/LanguageGate';
import { LoginGate } from './user/LoginGate';
import { PushHost } from './user/PushHost';
import { PostPromptHost } from './user/PostPromptHost';
import { GenderGate } from './user/GenderGate';
import { ScrollMemory } from './lib/ScrollMemory';
import { Home } from './user/Home';
import { Post } from './user/Post';
import { MyPosts } from './user/MyPosts';
import { Categories } from './user/Categories';
import { CategoryPage } from './user/CategoryPage';
import { CategoryListing } from './user/CategoryListing';
import { ListingDetail } from './user/ListingDetail';
import { ComplaintsHome } from './user/complaints/ComplaintsHome';
import { WardPage } from './user/complaints/WardPage';
import { ComplaintPost } from './user/complaints/ComplaintPost';
import { ComplaintDetail } from './user/complaints/ComplaintDetail';
import { FeedPage } from './user/FeedPage';
import { CategoryBrowse } from './user/CategoryBrowse';
import { Cabs } from './user/Cabs';
import { Profile } from './user/Profile';
import { AdminApp } from './admin/AdminApp';
import { WebsiteHome, WebsitePrivacy, WebsiteTerms } from './website/Website';

// One dynamic segment under /:city does double duty: a known kind slug
// (job-opening, business, …) is a category page; anything else is a listing
// permalink (/gondia/Sharma_General_Store). /:city/cat/:catKey is more specific
// and still matches first.
function CityChild() {
  const { kind = '' } = useParams();
  // Known listing-kind slug OR a post_type browse (sell / other) → category page;
  // anything else is a listing permalink.
  const isBrowse = !!SLUG_TO_KIND[kind] || kind === 'sell' || kind === 'rent' || kind === 'other';
  return isBrowse ? <CategoryPage /> : <ListingDetail />;
}

// Bare whatslocal.in landing: if we know the visitor's last city, send them
// straight there; otherwise show the home with the pincode prompt so they pick
// a city. (A visitor arriving via a post link gets their city set there.)
function Landing() {
  const last = getLastCity();
  if (last?.slug) return <Navigate to={`/${last.slug}`} replace />;
  return <Home forcePinPrompt />;
}

// Fire a page_view on every navigation — captures the path the visitor takes
// through the app; event timestamps then give time-spent per page.
function RouteTracker() {
  const loc = useLocation();
  useEffect(() => { trackPageView(); }, [loc.pathname, loc.search]);
  return null;
}

// The public marketing + legal site at /website is a STANDALONE site — full
// width, its own header/footer, and deliberately none of the app's global hosts
// (language gate, login popup, push/post prompts, mobile frame) rendered over
// it. So it's split out here before the app shell mounts.
function AppBody() {
  const loc = useLocation();
  if (loc.pathname === '/website' || loc.pathname.startsWith('/website/')) {
    return (
      <Routes>
        <Route path="/website" element={<WebsiteHome />} />
        <Route path="/website/privacy" element={<WebsitePrivacy />} />
        <Route path="/website/terms" element={<WebsiteTerms />} />
        <Route path="/website/*" element={<Navigate to="/website" replace />} />
      </Routes>
    );
  }
  return (
    <>
      <LanguageGate />
      <LoginGate />
      <PushHost />
      <PostPromptHost />
      <GenderGate />
      <ScrollMemory />
      <RouteTracker />
      <Routes>
        {/* Public user app — mobile-only, no login required. */}
        <Route path="/" element={<Landing />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/l/:id" element={<ListingDetail />} />
        <Route path="/edit/:id" element={<Post />} />
        <Route path="/post" element={<Post />} />
        <Route path="/my" element={<MyPosts />} />
        {/* Admin — responsive (mobile + PC), login required. */}
        <Route path="/admin/*" element={<AdminApp />} />
        {/* Ward Complaints — civic board (more specific than /:city/:kind, so first). */}
        <Route path="/:city/complaints" element={<ComplaintsHome />} />
        <Route path="/:city/complaints/ward/:ward" element={<WardPage />} />
        <Route path="/:city/complaints/new" element={<ComplaintPost />} />
        <Route path="/:city/complaints/c/:id" element={<ComplaintDetail />} />
        {/* Home feeds + category browse — static segments out-rank /:city/:kind. */}
        <Route path="/:city/offers" element={<FeedPage mode="offers" />} />
        <Route path="/:city/new" element={<FeedPage mode="new" />} />
        <Route path="/:city/cabs" element={<Cabs />} />
        <Route path="/:city/profile" element={<Profile />} />
        <Route path="/:city/browse/:bucket" element={<CategoryBrowse />} />
        <Route path="/:city/browse/:bucket/:sub" element={<CategoryBrowse />} />
        {/* City-scoped, shareable: /gondia, /gondia/cat/pharmacy, /gondia/job-opening */}
        <Route path="/:city" element={<Home />} />
        <Route path="/:city/cat/:catKey" element={<CategoryListing />} />
        <Route path="/:city/:kind" element={<CityChild />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export function App() {
  return (
    <LangProvider>
    <BrowserRouter>
      <AppBody />
    </BrowserRouter>
    </LangProvider>
  );
}
