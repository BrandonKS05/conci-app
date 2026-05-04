"use client";

import Image from "next/image";
import type { PlacePreview, PlacePreviewBlock } from "@/shared/place-preview";

function StarRow({ rating, count }: { rating?: number; count?: number }) {
  if (rating == null && count == null) return null;
  return (
    <p className="text-xs text-slate-600 dark:text-[#9c9a96]">
      {rating != null ? (
        <>
          <span className="font-medium text-amber-700 dark:text-amber-400">{rating.toFixed(1)}</span> ★
        </>
      ) : null}
      {count != null ? <span className="ml-1">{count.toLocaleString()} reviews</span> : null}
    </p>
  );
}

/** iMessage-style rich preview row for a single place. */
function PlaceCard({ item }: { item: PlacePreview }) {
  return (
    <a
      href={item.mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm ring-1 ring-slate-200/60 transition hover:border-orange-400/40 hover:ring-orange-400/20 dark:border-white/10 dark:bg-[#1e1e1e] dark:ring-white/[0.04] dark:hover:border-[#ea580c]/40"
    >
      {item.photoUrl ? (
        <Image
          src={item.photoUrl}
          alt=""
          width={84}
          height={84}
          unoptimized
          className="h-[5.25rem] w-[5.25rem] shrink-0 object-cover"
        />
      ) : (
        <div className="flex h-[5.25rem] w-[5.25rem] shrink-0 items-center justify-center bg-slate-100 text-[10px] text-slate-400 dark:bg-[#2a2a2a] dark:text-[#6b6965]">
          Map
        </div>
      )}
      <div className="min-w-0 flex-1 px-3 py-2">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-[#ebe9e4]">{item.name}</p>
        <StarRow rating={item.rating} count={item.reviewCount} />
        {item.address ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-600 dark:text-[#a8a6a2]">{item.address}</p>
        ) : null}
        {item.priceRange ? (
          <p className="mt-1 text-[11px] font-medium text-slate-700 dark:text-[#c4c2be]">{item.priceRange}</p>
        ) : null}
      </div>
    </a>
  );
}

export function InlinePlacePreviewCards({ blocks }: { blocks: PlacePreviewBlock[] }) {
  if (!blocks.length) return null;
  return (
    <div className="flex w-full max-w-[min(100%,22rem)] flex-col items-end gap-3">
      {blocks.map((block) => (
        <div key={block.query} className="w-full space-y-2">
          <p className="pr-1 text-right text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-[#6b6965]">
            Places near “{block.query.length > 36 ? `${block.query.slice(0, 34)}…` : block.query}”
          </p>
          <div className="flex flex-col gap-2">
            {block.items.map((item, idx) => (
              <PlaceCard key={`${block.query}-${idx}-${item.name}`} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
