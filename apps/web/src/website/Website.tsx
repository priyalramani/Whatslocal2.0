/**
 * Public marketing + legal site at /website, /website/privacy, /website/terms.
 *
 * This is DELIBERATELY separate from the mobile app shell (no language gate,
 * login popup, push prompt, or 480px frame) — it's a full-width, desktop-first
 * site meant to (a) explain WhatsLocal to anyone and (b) satisfy the WhatsApp
 * Business Platform review, which requires a real website with a Privacy Policy
 * and Terms, and a clear description of how WhatsApp is used.
 *
 * Rendered via the /website short-circuit in App.tsx, so none of the app's
 * global hosts mount here.
 */
import { Link } from 'react-router-dom';

// ── Business facts. Anything the owner must confirm before submitting to Meta
// is called out in FILL_BEFORE_META below; keep this block the single source. ──
const BRAND = 'WhatsLocal';
const COMPANY = 'Retail Grid Solutions Pvt. Ltd.';
const SUPPORT_EMAIL = 'hello@btgondia.com';
const SITE_URL = 'https://whatslocal.in';
const LOCATION = 'Gondia, Maharashtra, India';
const UPDATED = '27 July 2026';

function Header() {
  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
        <Link to="/website" className="flex items-center gap-2.5">
          <img src="/logo.svg" alt={BRAND} className="h-8 w-8" />
          <span className="text-[17px] font-bold text-slate-900 tracking-tight">{BRAND}</span>
        </Link>
        <nav className="flex items-center gap-1 text-[13.5px] font-medium">
          <Link to="/website" className="px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100">Home</Link>
          <Link to="/website/privacy" className="px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100">Privacy</Link>
          <Link to="/website/terms" className="px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100">Terms</Link>
          <a href={SITE_URL} className="ml-1 px-3.5 py-2 rounded-lg bg-brand text-white hover:bg-brand-dark">Open app</a>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="max-w-5xl mx-auto px-5 py-8 text-[13px] text-slate-500">
        <div className="flex flex-wrap gap-x-6 gap-y-2 mb-4">
          <Link to="/website" className="hover:text-brand">Home</Link>
          <Link to="/website/privacy" className="hover:text-brand">Privacy Policy</Link>
          <Link to="/website/terms" className="hover:text-brand">Terms &amp; Conditions</Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-brand">Contact</a>
        </div>
        <p>© 2026 {BRAND} managed by {COMPANY} All rights reserved.</p>
      </div>
    </footer>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-800 antialiased" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Header />
      {children}
      <Footer />
    </div>
  );
}

// Reusable legal-page scaffolding: title, "last updated", prose sections.
function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Shell>
      <main className="max-w-3xl mx-auto px-5 py-12">
        <Link to="/website" className="text-[13px] text-brand hover:underline">← Back to {BRAND}</Link>
        <h1 className="text-3xl font-bold text-slate-900 mt-4">{title}</h1>
        <p className="text-[13px] text-slate-500 mt-2">Last updated: {UPDATED}</p>
        <div className="mt-8 space-y-7 text-[15px] leading-relaxed text-slate-700 [&_h2]:text-[19px] [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_a]:text-brand [&_a]:underline">
          {children}
        </div>
      </main>
    </Shell>
  );
}

function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return <section id={id}>{children}</section>;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOME
// ─────────────────────────────────────────────────────────────────────────────
export function WebsiteHome() {
  return (
    <Shell>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50 to-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-5 py-16 md:py-20 text-center">
          <span className="inline-block text-[12px] font-semibold tracking-wide text-brand bg-brand-100 rounded-full px-3 py-1">
            Hyperlocal directory for {LOCATION.split(',')[0]}
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mt-5 tracking-tight">
            Find local shops, jobs, deals &amp; services near you.
          </h1>
          <p className="text-[17px] text-slate-600 mt-5 max-w-2xl mx-auto leading-relaxed">
            {BRAND} is a free hyperlocal platform that connects residents of {LOCATION} with nearby
            businesses, service providers, job openings, items for sale and rent, shared cabs, and
            civic ward information — all in one place, in English and Hindi.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <a href={SITE_URL} className="px-6 py-3 rounded-xl bg-brand text-white font-semibold hover:bg-brand-dark">
              Open {BRAND}
            </a>
            <a href="#how" className="px-6 py-3 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50">
              How it works
            </a>
          </div>
        </div>
      </section>

      {/* What it is */}
      <section className="max-w-5xl mx-auto px-5 py-16">
        <h2 className="text-2xl font-bold text-slate-900 text-center">What is {BRAND}?</h2>
        <p className="text-[15.5px] text-slate-600 text-center max-w-2xl mx-auto mt-4 leading-relaxed">
          A single, simple place for a town to discover everything local. Anyone can browse for free;
          local businesses and residents can list themselves and be found by neighbours searching nearby.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
          {[
            ['🏪', 'Businesses & services', 'Shops, clinics, tuition, electricians, tailors and more — with contact, hours and location.'],
            ['💼', 'Jobs', 'Local job openings and job-seeker profiles, so hiring and finding work stays in town.'],
            ['🛒', 'Buy, sell & rent', 'Second-hand items, vehicles, furniture and property for sale or on rent.'],
            ['🚕', 'Cab sharing', 'One-way and daily shared-taxi routes run by local travel operators.'],
            ['🏷️', 'Offers', 'Time-bound discounts and promotions from shops across the town.'],
            ['🏛️', 'Ward complaints', 'A civic board to raise and track local ward issues with elected members.'],
          ].map(([emoji, title, body]) => (
            <div key={title} className="rounded-2xl border border-slate-200 p-5">
              <div className="text-2xl">{emoji}</div>
              <div className="font-semibold text-slate-900 mt-3">{title}</div>
              <p className="text-[13.5px] text-slate-600 mt-1.5 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-5 py-16">
          <h2 className="text-2xl font-bold text-slate-900 text-center">How it works</h2>
          <div className="grid md:grid-cols-3 gap-6 mt-10">
            {[
              ['1', 'Browse or search', 'Open the app, pick your town, and search for what you need — no sign-up required to look.'],
              ['2', 'Connect directly', 'Tap a listing to call or message the business on WhatsApp. You deal with them directly.'],
              ['3', 'List your own', 'Verify your number with a one-time OTP and post your shop, job, item or trip for free.'],
            ].map(([n, title, body]) => (
              <div key={n} className="text-center">
                <div className="mx-auto h-11 w-11 rounded-full bg-brand text-white font-bold flex items-center justify-center">{n}</div>
                <div className="font-semibold text-slate-900 mt-4">{title}</div>
                <p className="text-[13.5px] text-slate-600 mt-1.5 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How we use WhatsApp — the section Meta's review looks for */}
      <section className="max-w-3xl mx-auto px-5 py-16">
        <h2 className="text-2xl font-bold text-slate-900">How {BRAND} uses WhatsApp</h2>
        <p className="text-[15px] text-slate-600 mt-4 leading-relaxed">
          WhatsApp is a core way people connect on {BRAND}. We use it in three ways, and only ever with
          the user’s knowledge and consent:
        </p>
        <div className="mt-6 space-y-4">
          {[
            ['Contacting a listing', 'When you tap “WhatsApp” on a business, job or item, we open a chat to that lister’s own number with a short, relevant opening message. You send it yourself — we do not message on your behalf.'],
            ['One-time verification (OTP)', 'To post a listing you verify your mobile number with a one-time password. This confirms ownership of the number and helps keep the directory genuine and spam-free.'],
            ['Opt-in updates', 'A user or business may choose to receive helpful updates — for example a confirmation that a listing is live, a relevant local notification, or a reply to an enquiry. These are sent only after the user opts in, and every message includes a clear way to opt out at any time by replying STOP.'],
          ].map(([t, b]) => (
            <div key={t} className="rounded-xl border border-slate-200 p-4">
              <div className="font-semibold text-slate-900">{t}</div>
              <p className="text-[14px] text-slate-600 mt-1 leading-relaxed">{b}</p>
            </div>
          ))}
        </div>
        <p className="text-[14px] text-slate-600 mt-6 leading-relaxed">
          We do not sell phone numbers, send unsolicited marketing, or share your contact details with
          third parties for their own marketing. See our <Link to="/website/privacy" className="text-brand underline">Privacy Policy</Link> for
          the full detail.
        </p>
      </section>

      {/* Contact */}
      <section className="bg-brand text-white">
        <div className="max-w-3xl mx-auto px-5 py-14 text-center">
          <h2 className="text-2xl font-bold">Contact us</h2>
          <p className="text-white/85 mt-3">
            {BRAND} is owned and operated by {COMPANY}, based in {LOCATION}.
          </p>
          <div className="mt-6 inline-flex flex-col items-center gap-1 text-[15px]">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold underline decoration-white/40 hover:decoration-white">{SUPPORT_EMAIL}</a>
            <a href={SITE_URL} className="text-white/85 hover:text-white">{SITE_URL.replace('https://', '')}</a>
          </div>
        </div>
      </section>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVACY POLICY
// ─────────────────────────────────────────────────────────────────────────────
export function WebsitePrivacy() {
  return (
    <LegalPage title="Privacy Policy">
      <Section>
        <p>
          This Privacy Policy explains how {COMPANY} (“{BRAND}”, “we”, “us”) collects, uses, shares and
          protects information when you use the {BRAND} website and application at {SITE_URL} (the
          “Service”). By using the Service you agree to this Policy.
        </p>
      </Section>

      <Section>
        <h2>1. Information we collect</h2>
        <ul>
          <li><b>Contact number.</b> When you post a listing or log in, we collect your mobile number and verify it with a one-time password (OTP).</li>
          <li><b>Listing content.</b> Anything you choose to publish — business name, description, category, photos, price, address, and the contact numbers you provide for that listing.</li>
          <li><b>Location.</b> The town/pincode you select, so we can show you nearby results.</li>
          <li><b>Usage &amp; device data.</b> Pages viewed, searches, and a device identifier used to remember your preferences, prevent abuse, and improve the Service. We do not track you across other websites.</li>
          <li><b>Communications.</b> If you contact us or a lister through the Service, we may process that interaction to operate and support the Service.</li>
        </ul>
      </Section>

      <Section>
        <h2>2. How we use information</h2>
        <ul>
          <li>To operate the directory — publish listings, power search, and connect buyers with sellers, seekers with employers, and residents with local services.</li>
          <li>To verify ownership of a phone number and keep the directory genuine and free of spam.</li>
          <li>To send messages you have opted into (for example a listing confirmation or a reply to an enquiry), which you can stop at any time.</li>
          <li>To understand usage in aggregate and improve features, relevance and reliability.</li>
          <li>To comply with law and to protect the rights, safety and security of users and the public.</li>
        </ul>
      </Section>

      <Section>
        <h2>3. WhatsApp and messaging</h2>
        <p>
          {BRAND} integrates with WhatsApp so people can connect. When you tap a “WhatsApp” contact
          button, a chat opens between you and the lister’s own number — you send the message yourself.
          We use the WhatsApp Business Platform and our SMS/OTP provider to verify numbers and to deliver
          messages you have opted into. Messages we initiate are limited to service and utility updates
          and clearly identify {BRAND}; every such message includes a way to opt out (reply STOP). We do
          not send unsolicited marketing and we do not share your number with third parties for their
          marketing.
        </p>
      </Section>

      <Section>
        <h2>4. How information is shared</h2>
        <ul>
          <li><b>Publicly, by your choice.</b> A listing you publish — including the contact numbers you provide for it — is shown to other users so they can reach you. Do not include information in a listing that you do not want to be public.</li>
          <li><b>Service providers.</b> We use trusted providers to run the Service — cloud hosting and database (Amazon Web Services, MongoDB Atlas), the WhatsApp Business Platform (Meta), and an OTP/SMS provider. They process data only to provide their service to us.</li>
          <li><b>Legal.</b> We may disclose information if required by law or to protect against fraud, abuse or harm.</li>
          <li>We do <b>not</b> sell your personal information.</li>
        </ul>
      </Section>

      <Section>
        <h2>5. Data retention</h2>
        <p>
          We keep information for as long as your listing is active or your account exists, and as needed
          to operate the Service, resolve disputes and meet legal obligations. You can ask us to delete
          your account and listings at any time (see “Your rights”).
        </p>
      </Section>

      <Section>
        <h2>6. Security</h2>
        <p>
          We use reasonable technical and organisational measures to protect information, including
          restricted access and encrypted connections. Contact numbers behind a listing are revealed to
          other users only when they take an action to contact you, and sensitive fields are never exposed
          in bulk. No method of transmission or storage is completely secure, however, and we cannot
          guarantee absolute security.
        </p>
      </Section>

      <Section>
        <h2>7. Your rights</h2>
        <ul>
          <li>Access, correct or update your listings from within the app.</li>
          <li>Request deletion of your account, listings and associated personal data.</li>
          <li>Opt out of any messages you previously opted into.</li>
        </ul>
        <p>To exercise any of these, email us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      </Section>

      <Section>
        <h2>8. Children</h2>
        <p>
          The Service is intended for users aged 18 and above and is not directed at children. We do not
          knowingly collect personal information from children.
        </p>
      </Section>

      <Section>
        <h2>9. Changes to this Policy</h2>
        <p>
          We may update this Policy from time to time. Material changes will be posted on this page with a
          new “Last updated” date.
        </p>
      </Section>

      <Section>
        <h2>10. Contact</h2>
        <p>
          {COMPANY}, {LOCATION}.<br />
          Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
      </Section>
    </LegalPage>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TERMS & CONDITIONS
// ─────────────────────────────────────────────────────────────────────────────
export function WebsiteTerms() {
  return (
    <LegalPage title="Terms & Conditions">
      <Section>
        <p>
          These Terms &amp; Conditions (“Terms”) govern your use of the {BRAND} website and application at
          {' '}{SITE_URL} (the “Service”), operated by {COMPANY} (“{BRAND}”, “we”, “us”). By accessing or
          using the Service you agree to these Terms. If you do not agree, please do not use the Service.
        </p>
      </Section>

      <Section>
        <h2>1. Eligibility</h2>
        <p>You must be at least 18 years old and able to form a binding contract to use the Service.</p>
      </Section>

      <Section>
        <h2>2. Your account and listings</h2>
        <ul>
          <li>You verify your mobile number to post, and you are responsible for activity under your number.</li>
          <li>You must provide accurate information and only post contact numbers you are authorised to use.</li>
          <li>You are solely responsible for the content of your listings and for keeping them accurate and up to date.</li>
        </ul>
      </Section>

      <Section>
        <h2>3. Acceptable use</h2>
        <p>You agree not to use the Service to post or do any of the following:</p>
        <ul>
          <li>Anything unlawful, fraudulent, misleading, or infringing another person’s rights.</li>
          <li>Spam, mass or repetitive postings, or content that is not a genuine local listing.</li>
          <li>Illegal goods or services, or anything prohibited by applicable law.</li>
          <li>Offensive, obscene, hateful, or harassing content, or content that impersonates others.</li>
          <li>Someone else’s phone number, personal data, or copyrighted material without permission.</li>
          <li>Scraping, bulk-harvesting of contact numbers, or interfering with the Service’s operation.</li>
        </ul>
        <p>We may remove content and suspend accounts that violate these Terms.</p>
      </Section>

      <Section>
        <h2>4. Your content</h2>
        <p>
          You keep ownership of the content you post. By posting, you grant {BRAND} a non-exclusive,
          royalty-free licence to host, display and distribute that content within the Service so it can
          be shown to other users and shared via links. You represent that you have the rights to grant
          this licence.
        </p>
      </Section>

      <Section>
        <h2>5. Listings are between users</h2>
        <p>
          {BRAND} is a platform that connects users. We do not create listings’ content, verify the
          quality, legality or accuracy of what businesses or individuals post, and we are not a party to
          any dealing, transaction or communication between users. Any contact, purchase, sale, hire,
          employment or travel arrangement you enter into is at your own risk and between you and the
          other party. Please exercise normal caution.
        </p>
      </Section>

      <Section>
        <h2>6. WhatsApp and third-party services</h2>
        <p>
          The Service integrates with WhatsApp and other third-party providers. Your use of WhatsApp is
          also governed by WhatsApp’s and Meta’s own terms and policies. We are not responsible for
          third-party services.
        </p>
      </Section>

      <Section>
        <h2>7. Intellectual property</h2>
        <p>
          The {BRAND} name, logo, software and design are owned by {COMPANY} and may not be copied or used
          without permission. These Terms do not grant you any right to our trademarks or software.
        </p>
      </Section>

      <Section>
        <h2>8. Disclaimers</h2>
        <p>
          The Service is provided “as is” and “as available”, without warranties of any kind, whether
          express or implied, including fitness for a particular purpose, accuracy, or uninterrupted
          availability, to the fullest extent permitted by law.
        </p>
      </Section>

      <Section>
        <h2>9. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, {COMPANY} shall not be liable for any indirect,
          incidental, or consequential damages, or for any loss arising from your use of — or inability to
          use — the Service, or from any dealing between users.
        </p>
      </Section>

      <Section>
        <h2>10. Indemnity</h2>
        <p>
          You agree to indemnify and hold {COMPANY} harmless from any claim arising out of your content,
          your use of the Service, or your breach of these Terms.
        </p>
      </Section>

      <Section>
        <h2>11. Termination</h2>
        <p>
          We may suspend or terminate access to the Service, or remove content, at any time if we believe
          these Terms have been violated or to protect users and the Service.
        </p>
      </Section>

      <Section>
        <h2>12. Governing law</h2>
        <p>
          These Terms are governed by the laws of India. Subject to applicable law, the courts at Gondia,
          Maharashtra shall have jurisdiction over any dispute.
        </p>
      </Section>

      <Section>
        <h2>13. Changes</h2>
        <p>
          We may update these Terms from time to time. Continued use of the Service after changes are
          posted means you accept the updated Terms.
        </p>
      </Section>

      <Section>
        <h2>14. Contact</h2>
        <p>
          {COMPANY}, {LOCATION}.<br />
          Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
      </Section>
    </LegalPage>
  );
}
