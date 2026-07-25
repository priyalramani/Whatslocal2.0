# Vision

## What it is
WhatsLocal is a **database of everything in a city** — essentially a modern **Yellow Pages**. It lists every commercial and non-commercial service and business in a city, plus a **jobs** side (job seekers and employers) across hundreds of categories.

## Scope & rollout
- **Start with Gondia** (pincodes `441601` / `441614`), then expand city by city.
- Users can submit listings for **any city**. New cities come online as users add them.

## Core flows
1. **Listing submission.** A user enters their listing details (business / service / job seeker / employer).
2. **Admin approval.** Every submission goes to the **admin (owner)** for approval before going live.
3. **Pincode-driven geo.** The user/admin enters the **pincode**; the system resolves **city, district, and state** automatically from that pincode. New cities/pincodes are confirmed at approval time.

## Primary interface: a local search engine
When someone opens a city (e.g. Gondia), they get a **search bar** and can search **literally anything** — "Parle biscuit", "saloon", "food license", "land broker", "wholesale garments", "ice cream". It behaves like a **local search engine**, not a category-browse site. Search spans listing title + keywords (+ synonyms) + description, with typo tolerance and relevance ranking (Atlas Search).

## City home: search bar + featured shortcuts
The city home is **search-first** (big search bar) plus a row of a few **"most-used" shortcut tiles** for common entry points. The featured set is curated (admin-defined) and short.
- **JOBS** is one featured tile → opens the jobs area where a user chooses **"Post Resume"** (job seeker) or **"Post Job Opening"** (employer), and can browse/search both.
- More featured tiles to be defined later.

## Two main directories
- **Business / services directory** — every commercial & non-commercial entity (the yellow-pages core).
- **Jobs directory** — job seekers and employers, across 100s of categories.

## Who uses it
- **Public / visitors** — search and browse listings in their city.
- **Listers** — businesses, service providers, job seekers, employers submitting listings.
- **Admin (owner)** — approves listings, manages cities/pincodes and the category taxonomy.

## Open design question (being decided)
How to handle **hundreds of categories** cleanly (jobs + business) instead of a flat 7–8 list — see [DECISIONS.md](DECISIONS.md) and [the categories model in DATABASE.md](DATABASE.md).
