import { Link } from 'react-router-dom';
import type { PublicListing } from '@whatslocal/types';
import { tint, iconFor, meta, metaFull, subInfo, categoryLabel, catLabel, typeTag } from '../lib/listingMeta';
import { listingPath } from '../lib/city';
import { mediaUrl } from '../lib/api';
import { useT } from '../lib/i18n';

// Full-width row card (category page, search results) — richer chip set since
// there's more horizontal space than the home tiles.
export function ListingCard({ listing }: { listing: PublicListing }) {
  const sub = subInfo(listing);
  const chips = metaFull(listing);
  const cover = listing.photos?.[0];
  return (
    <Link to={listingPath(listing)}
      className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-card border border-slate-100 active:scale-[.99] hover:shadow-md transition">
      {cover ? (
        <img src={mediaUrl(cover, 'thumb')} alt="" loading="lazy"
          className="h-14 w-14 shrink-0 rounded-xl object-contain bg-slate-50" />
      ) : (
        <div className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center text-xl ${tint(listing._id)}`}>
          {iconFor(listing)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-slate-900 truncate">{listing.title}</div>
        {listing.offer_text && <div className="text-[11px] font-medium text-amber-700 truncate mt-0.5">🏷️ {listing.offer_text}{listing.offer_valid_till ? ` · ${listing.offer_valid_till}` : ''}</div>}
        {sub && <div className="text-xs text-slate-400 truncate mt-0.5">{sub}</div>}
        {!!chips.length && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {chips.map((c) => <span key={c} className="text-[11px] text-slate-600 bg-slate-100 rounded-md px-1.5 py-0.5">{c}</span>)}
          </div>
        )}
      </div>
      {listing.has_phone && <span className="shrink-0 text-base">📞</span>}
      <span className="shrink-0 text-slate-300 text-lg">›</span>
    </Link>
  );
}

// Card tile — fixed-width for home carousels, or full-width for grids (search
// results). `full` switches between the two. `showCategory` shows the category
// eyebrow — only in SEARCH results (mixed kinds); redundant inside a section.
export function ListingTile({ listing, full = false }: { listing: PublicListing; full?: boolean; showCategory?: boolean }) {
  const { t, lang } = useT();
  const sub = subInfo(listing);
  const chip = meta(listing)[0];
  const cover = listing.photos?.[0];
  const tag = typeTag(listing);
  return (
    <Link to={listingPath(listing)}
      className={`${full ? 'w-full' : 'shrink-0 w-32'} flex flex-col rounded-2xl bg-white p-2 shadow-card border border-slate-100 active:scale-[.98] transition`}>
      {/* Uniform square media area for EVERY tile (photo or icon placeholder) so
          photo and no-photo cards are the same size in the grid. */}
      <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-1.5 flex items-center justify-center bg-slate-50">
        {/* Only an active OFFER overlays the photo (it's a promotional highlight).
            The type chip sits below the image so it never covers a face. */}
        {listing.offer_text && (
          <span className="absolute top-1.5 left-1.5 z-10 bg-amber-400 text-amber-900 text-[10px] font-semibold px-1.5 py-0.5 rounded-md">🏷️ {listing.offer_text.length > 18 ? listing.offer_text.slice(0, 18) + '…' : listing.offer_text}</span>
        )}
        {cover ? (
          <img src={mediaUrl(cover, 'thumb')} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
        ) : (
          <div className={`flex h-full w-full items-center justify-center text-4xl ${tint(listing._id)}`}>
            {iconFor(listing)}
          </div>
        )}
      </div>
      {/* Colored TYPE chip below the image — keeps mixed rails scannable without
          obscuring the photo. Offers already signal themselves via the badge. */}
      {!listing.offer_text && (
        <span className={`self-start text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md ${tag.cls}`}>{t(tag.labelKey)}</span>
      )}
      <div className="text-[9px] font-semibold uppercase tracking-wide text-brand/70 mt-1 truncate">{catLabel(categoryLabel(listing), lang)}</div>
      <div className="font-semibold text-[13px] text-slate-900 mt-0.5 line-clamp-2 leading-snug">{listing.title}</div>
      {sub && <div className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{sub}</div>}
      {chip && <div className="text-[10px] text-slate-600 bg-slate-100 rounded-md px-1.5 py-0.5 inline-block mt-1">{chip}</div>}
    </Link>
  );
}
