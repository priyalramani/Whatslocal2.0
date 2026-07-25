import sharp from 'sharp';
import { buildCardSvg } from '../dist/listings/og-card.js';

const samples = [
  { name: 'sell-car', emoji: '🚗', chip: 'For Sale · Cars', title: 'Maruti Swift VXi 2018', accent: '₹3,50,000', city: 'Gondia, Maharashtra' },
  { name: 'rent-flat', emoji: '🏠', chip: 'For Rent · Property — House / Flat / Plot / Shop', title: '2 BHK Flat near Bus Stand with parking and lift', accent: '₹15,000 / month', city: 'Gondia, Maharashtra' },
  { name: 'job', emoji: '💼', chip: 'Job Opening · Delivery Boy', title: 'Delivery Staff Wanted', accent: '₹10,000–₹15,000 / mo', city: 'Gondia, Maharashtra' },
  { name: 'news', emoji: '📰', chip: 'Local News', title: 'Heavy rain expected in Gondia this weekend', accent: '', city: 'Gondia, Maharashtra' },
  { name: 'business', emoji: '🛒', chip: 'Grocery & Daily Needs', title: 'Sharma General Store', accent: '', city: 'Gondia, Maharashtra' },
];

for (const s of samples) {
  const svg = buildCardSvg(s);
  await sharp(Buffer.from(svg)).png().toFile(new URL(`./_preview-${s.name}.png`, import.meta.url).pathname.replace(/^\//, ''));
  console.log('wrote', s.name);
}
