// Server-rendered WhatsApp/OG share card. Built from the listing's own data so
// every post gets a relevant 1200×630 thumbnail with zero upload friction; a
// user photo (when present) overrides this. Brand: teal #0f766e / amber #f59e0b.
// Output is an SVG string, rasterised to PNG by the caller (WhatsApp won't render
// SVG as og:image). Keep this pure — no Nest/DB imports.

export interface CardInput {
  emoji?: string;   // category/post emoji (rendered if the box has a colour-emoji font)
  chip?: string;    // small uppercase eyebrow, e.g. "FOR SALE · CARS"
  title: string;    // already masked if the poster hid their name
  accent?: string;  // big highlighted line, e.g. "₹3,50,000"
  city?: string;    // "Gondia, Maharashtra"
}

const xml = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Greedy word-wrap with an ellipsis when the text overflows maxLines.
function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (next.length <= maxChars) { cur = next; continue; }
    if (cur) lines.push(cur);
    cur = w;
    if (lines.length >= maxLines) { cur = ''; break; }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // Did we drop content? add an ellipsis to the last visible line.
  const shown = lines.join(' ').replace(/\s+/g, ' ').trim();
  const full = String(text || '').replace(/\s+/g, ' ').trim();
  if (shown.length < full.length && lines.length) {
    let last = lines[lines.length - 1];
    while ((last + '…').length > maxChars && last.includes(' ')) last = last.replace(/\s+\S*$/, '');
    lines[lines.length - 1] = last + '…';
  }
  return lines.length ? lines : [''];
}

// Transparent 1200×630 overlay composited over an UPLOADED photo for its share
// image: a bottom gradient (so text stays legible over any photo) + the city and
// whatslocal.in footer + the amber brand bar — mirroring the generated card.
export function buildPhotoOverlaySvg(city?: string): string {
  const FONT = "'Noto Sans','DejaVu Sans','Liberation Sans',sans-serif";
  const cityT = city
    ? `<text x="48" y="586" font-family="${FONT}" font-size="34" fill="#ffffff">${xml(city)}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="wlfade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.45" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.72"/>
    </linearGradient>
  </defs>
  <rect x="0" y="360" width="1200" height="270" fill="url(#wlfade)"/>
  ${cityT}
  <text x="1152" y="586" font-family="${FONT}" font-size="32" font-weight="700" text-anchor="end" fill="#5eead4">whatslocal.in</text>
  <rect x="0" y="620" width="1200" height="10" fill="#f59e0b"/>
</svg>`;
}

export function buildCardSvg(c: CardInput): string {
  const FONT = "'Noto Sans','DejaVu Sans','Liberation Sans',sans-serif";
  const titleLines = wrapLines(c.title || 'WhatsLocal', 24, 2);
  const t1 = titleLines[0] || '';
  const t2 = titleLines[1] || '';
  const titleTop = 300;
  const titleLeading = 80;
  const accentY = (t2 ? titleTop + titleLeading : titleTop) + 96;

  // Monochrome emoji font renders the glyph as a white silhouette on the teal
  // disc (colour-emoji fonts render unreliably in this SVG rasteriser).
  const emoji = c.emoji
    ? `<circle cx="140" cy="142" r="58" fill="#0f766e"/>
       <text x="140" y="164" font-family="'Noto Emoji','Noto Color Emoji',${FONT}" font-size="56" fill="#ffffff" text-anchor="middle">${xml(c.emoji)}</text>`
    : '';
  const chip = c.chip
    ? `<text x="${c.emoji ? 222 : 80}" y="156" font-family="${FONT}" font-size="30" font-weight="700" letter-spacing="2" fill="#5eead4">${xml(c.chip.toUpperCase())}</text>`
    : '';
  const accent = c.accent
    ? `<text x="80" y="${accentY}" font-family="${FONT}" font-size="64" font-weight="700" fill="#f59e0b">${xml(c.accent)}</text>`
    : '';
  const city = c.city
    ? `<text x="80" y="576" font-family="${FONT}" font-size="32" fill="#99f6e4">${xml(c.city)}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0b5650"/>
  ${emoji}
  ${chip}
  <text x="80" y="${titleTop}" font-family="${FONT}" font-size="66" font-weight="700" fill="#ffffff">${xml(t1)}</text>
  ${t2 ? `<text x="80" y="${titleTop + titleLeading}" font-family="${FONT}" font-size="66" font-weight="700" fill="#ffffff">${xml(t2)}</text>` : ''}
  ${accent}
  ${city}
  <text x="1120" y="576" font-family="${FONT}" font-size="30" font-weight="700" text-anchor="end" fill="#5eead4">whatslocal.in</text>
  <rect x="0" y="620" width="1200" height="10" fill="#f59e0b"/>
</svg>`;
}
