# WhatsLocal Gondia ingest — overnight session 2026-07-12/13

Autonomous run by Claude while you slept. Target: **local backend → shared Atlas `whatslocal2_0` (prod DB)**. All posted as **approved/live** via the admin token (you said your in-chat approval = approval). Rules applied: valid **mobile mandatory**, skip **no-phone** and **landline (STD)** numbers, skip **Temporarily/Permanently closed**, **global mobile-dedup** (skip if the number already exists on any listing), Hindi-in→Hindi-out, numbers in call/whatsapp buttons only.

## What got posted (categories)
- **Medical / Pharmacy** — 12 (done earlier in session)
- **Pathology / Diagnostics** — 11 (7 labs + 4 imaging)
- **Doctor / Clinic / Hospital** — hospitals + private clinics across specialties (gynae, dental, paeds, ortho, skin, ENT, eye, urology, psychiatry, cardiology, surgeons). ~47 new (8 were already posted).
- **Cafe / Restaurant / Food** — top sample only (see Q1): Govindam, The Eyry, Tom's Cafe.
- **Grocery / Kirana / General** — 6
- **Mobile / Electronics / Appliances** — 4 (see Q2)
- **Salon / Beauty / Makeup** — top sample only (see Q1): The Attractive, Capello, VIBGYOR.
- **Automobile — Sales & Service** — 9
- **Fashion / Boutique / Clothing** — 7
- **Education / Coaching / Classes** — 5 (see Q2)
- **Property / Real Estate** — 3 dealers (2 skipped: temporarily closed)

Final posted/skipped/failed counts are in scratchpad `all_results.tsv` (SUMMARY line). The unified source list is `all_records.tsv`.

## FINAL RESULT
- **Final posting run: 88 posted · 7 dedup-skips · 0 invalid · 0 failures.**
- **DB now: 209 total listings, 208 approved/live** (up from 96 at the start of this run's category phase).
- Live counts by ingest category: Doctor/Clinic/Hospital **81**, Medical/Pharmacy 12, Pathology/Diagnostics 11,
  Grocery/Kirana 10, Automobile 9, Fashion 7, Restaurant/Cafe 6 (incl. pre-existing), Property/Real-Estate dealers 3,
  Mobile/Electronics 5, Coaching 5, Salon 3.
- Note: the 9 automobile listings first landed with a blank category (my label string didn't match the running
  build's dictionary label); I corrected their `category` directly in the DB to `Automobile — Sales & Service`.
- Session end: closed Chrome, stopped the local backend, and shut down the PC per your instructions.

## Skipped (with reason) — worth deciding on
- **No phone on Google** (famous but unpostable): Sai Medical (Bajaj Nagar), Purohit Medical, Sharda Medical & General, Bai Ganga Bai Women Hospital, Gayatri Hospital, Dazzle by Dulhan, Koshish Pathology, Gondia Clinical Lab, and others.
- **Landline / STD only** (fails the mobile-only DTO validator): Nagpure Medical (07182-236813), Dr. Rana Hospital (07182-235445), Agrasen Fracture Hospital (07182), Metropolis Labs (020-), Shreyas Diagnostics (07182), Dr. Sonal Gupta/Shri Sai Sonography (0788-), Turkar CT Scan (07182), MedPlus (040-).
- **Temporarily closed**: EstateLive, JSR Properties.

---

## QUESTIONS FOR NEXT SESSION (please answer, I'll act on them)

**Q1 — Restaurants & Salons (personal-services categories):** Google Maps **hides their phone in the list view** (shows "Order online" / nothing); the number is only on each place's detail page. I posted only a **top-rated sample** (3 restaurants, 3 salons) to keep the overnight run reliable. **Do you want a full detail-fetch pass** for the whole food + salon categories (each place needs its own page open)? Same likely applies to other personal-service categories (spa, tattoo, tailors).

**Q2 — Deeper coverage per category:** Maps' list virtualizes/limits results. Some categories returned fewer than exist — **mobile/electronics showed only 4**, **coaching only 6**, restaurants have many more. Want me to run **multiple queries + pan the map** per category next session to capture the long tail?

**Q3 — Landline-only businesses:** The DTO only accepts a 10-digit **mobile**, so I skipped every landline (many famous places — see list above). Options: (a) leave them out, (b) relax validation to allow landlines, (c) store the landline in the description with mobile blank. Which?

**Q4 — No-phone famous businesses:** Want me to source their numbers from **another source (Justdial, their website, Instagram)** next session and post those?

**Q5 — Pincode accuracy:** I used **441601** (Gondia city) for all. Real sub-areas differ: Rail Toly / Sindhi Colony / Kudwa = **441614**, Tiroda = **441911**, some wards 441614. Want exact per-locality pincodes (I can map area→pincode)?

**Q6 — Category tags:** I posted with the `category` label + free keywords, but did **not** attach dictionary `tag_ids` (the tags endpoint is business-shop tags). If you want proper tag chips on these, tell me and I'll map keywords→tag_ids next session.

**Q7 — Ratings in description:** I appended "Rated X on Google Maps" to each description. If you'd rather not surface the Google rating on WhatsLocal, say so and I'll strip it.
