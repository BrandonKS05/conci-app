"use client";

import Image from "next/image";

/** Decorative cover — place name stays in sibling text */
export function LivePlaceCoverImage({ src, priority }: { src?: string | null; priority?: boolean }) {
  if (!src?.trim()) return null;
  return (
    <div className="relative h-36 w-full shrink-0 overflow-hidden bg-slate-100 dark:bg-white/5">
      <Image
        src={src}
        alt=""
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 560px"
        unoptimized
        priority={priority}
      />
    </div>
  );
}
