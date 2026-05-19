import type { MockHotelBrowseResult } from "@/shared/mock-hotel-search";
import type { HostLodgingType } from "@/shared/trip-plan";

const GRADIENTS: { from: string; to: string }[] = [
  { from: "#0f766e", to: "#134e4a" },
  { from: "#1e3a8a", to: "#312e81" },
  { from: "#9a3412", to: "#78350f" },
  { from: "#4c1d95", to: "#312e81" },
];

function num(x: unknown): number {
  if (typeof x === "number" && !Number.isNaN(x)) return x;
  if (typeof x === "string") {
    const n = parseFloat(x.replace(/[^0-9.-]/g, ""));
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const tIn = new Date(`${checkIn}T12:00:00`).getTime();
  const tOut = new Date(`${checkOut}T12:00:00`).getTime();
  if (!Number.isFinite(tIn) || !Number.isFinite(tOut)) return 2;
  return Math.max(1, Math.round((tOut - tIn) / 86_400_000) || 1);
}

function photoFromRow(nested: Record<string, unknown>, raw: Record<string, unknown>): string | null {
  const candidates = [
    nested.main_photo_url,
    nested.max_photo_url,
    nested.photoMain,
    raw.main_photo_url,
    nested.photo_url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
  const photos = nested.photoUrls ?? nested.photos;
  if (Array.isArray(photos) && photos.length > 0) {
    const first = photos[0];
    if (typeof first === "string" && first.startsWith("http")) return first;
    if (first && typeof first === "object" && typeof (first as { url?: string }).url === "string") {
      const u = (first as { url: string }).url;
      if (u.startsWith("http")) return u;
    }
  }
  return null;
}

function reviewLabelFromScore(score: number, word?: string): string {
  if (word?.trim()) return word.trim();
  if (score >= 9) return "Wonderful";
  if (score >= 8.5) return "Excellent";
  if (score >= 8) return "Very good";
  if (score >= 7) return "Good";
  return "Review score";
}

/** Map Booking.com15 searchHotels row → lodging browse card (UI). */
export function mapBookingRowToLodgingBrowse(
  raw: Record<string, unknown>,
  ctx: {
    cityLabel: string;
    checkIn: string;
    checkOut: string;
    adults: number;
    lodgingType: HostLodgingType;
    index: number;
  }
): MockHotelBrowseResult | null {
  const nested = ((raw.property as Record<string, unknown> | undefined) ?? raw) as Record<string, unknown>;
  const name =
    (typeof nested.name === "string" && nested.name) ||
    (typeof raw.name === "string" && raw.name) ||
    (typeof raw.hotel_name === "string" && raw.hotel_name) ||
    "";
  if (!name.trim()) return null;

  const idRaw = nested.hotel_id ?? nested.id ?? raw.hotel_id ?? raw.id ?? name;
  const id = `booking-${String(idRaw)}`;

  let reviewScore = num(nested.reviewScore ?? nested.review_score ?? raw.reviewScore ?? raw.review_score);
  if (reviewScore > 11) reviewScore = reviewScore / 10;
  if (reviewScore > 0 && reviewScore <= 5) reviewScore = reviewScore * 2;

  const reviewWord = typeof nested.reviewScoreWord === "string" ? nested.reviewScoreWord : undefined;
  const reviewCount = num(nested.review_nr ?? nested.review_count ?? nested.reviewCount ?? raw.review_nr);

  // Price can live at raw.priceBreakdown OR nested inside property.priceBreakdown
  const pb = (raw.priceBreakdown ?? nested.priceBreakdown) as Record<string, unknown> | undefined;
  const gross = (pb?.grossPrice ?? pb?.allInclusivePrice) as Record<string, unknown> | undefined;
  const excluded = pb?.excludedPrice as Record<string, unknown> | undefined;
  const priceVal =
    gross?.value ??
    gross?.amount ??
    excluded?.value ??
    excluded?.amount ??
    nested.minTotalPrice ??
    raw.price_display ??
    nested.price ??
    raw.composite_price_breakdown;

  const nights = nightsBetween(ctx.checkIn, ctx.checkOut);
  const totalUsd = Math.round(num(priceVal));
  const nightlyUsd = totalUsd > 0 ? Math.round(totalUsd / nights) : 0;

  const area =
    (typeof nested.city === "string" && nested.city) ||
    (typeof nested.city_trans === "string" && nested.city_trans) ||
    (typeof nested.district === "string" && nested.district) ||
    ctx.cityLabel;

  const distance =
    (typeof nested.distance_to_cc === "string" && nested.distance_to_cc) ||
    (typeof nested.distance === "string" && nested.distance) ||
    area;

  let bookingUrl =
    (typeof nested.url === "string" && nested.url.startsWith("http") && nested.url) ||
    (typeof raw.url === "string" && raw.url.startsWith("http") && raw.url) ||
    (typeof nested.booking_url === "string" && nested.booking_url.startsWith("http") && nested.booking_url) ||
    (typeof nested.deep_link_url === "string" && nested.deep_link_url.startsWith("http") && nested.deep_link_url) ||
    undefined;

  if (!bookingUrl) {
    bookingUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(ctx.cityLabel)}&checkin=${ctx.checkIn}&checkout=${ctx.checkOut}&group_adults=${ctx.adults}`;
  }

  const grad = GRADIENTS[ctx.index % GRADIENTS.length]!;
  const stars = nested.propertyClass ?? nested.class ?? nested.starRating;
  const descriptionParts: string[] = [];
  if (stars != null && String(stars).trim()) descriptionParts.push(`${stars}-star property`);
  if (reviewScore > 0) descriptionParts.push(`${reviewScore.toFixed(1)}/10 guest rating`);
  const description = descriptionParts.length
    ? descriptionParts.join(" · ")
    : `Stay in ${ctx.cityLabel} — book on Booking.com for live rates.`;

  const isHome =
    /apartment|home|villa|hostel|guesthouse|holiday home/i.test(name) ||
    /apartment|home|villa/i.test(String(nested.accommodation_type_name ?? ""));

  return {
    id,
    name: name.trim(),
    neighborhood: area,
    addressLine: `${area}, ${ctx.cityLabel}`,
    rating: reviewScore > 0 ? Math.min(5, reviewScore / 2) : 4,
    description,
    priceEstimatePerNight: nightlyUsd > 0 ? `~$${nightlyUsd} / night` : "See price on Booking.com",
    gradientFrom: grad.from,
    gradientTo: grad.to,
    lodgingType: isHome ? "airbnb" : ctx.lodgingType,
    imageUrl: photoFromRow(nested, raw),
    distanceLabel: distance ? String(distance) : ctx.cityLabel,
    amenities: [{ icon: "wifi", label: "Free WiFi" }],
    dealHighlight: nightlyUsd > 0 ? `From $${nightlyUsd}/night` : undefined,
    reserveNowPayLater: true,
    nightlyUsd,
    totalUsd: totalUsd > 0 ? totalUsd : nightlyUsd * nights,
    reviewScore: reviewScore > 0 ? reviewScore : 8,
    reviewLabel: reviewLabelFromScore(reviewScore, reviewWord),
    reviewCount: reviewCount > 0 ? reviewCount : 0,
    propertyKind: isHome ? "home" : "hotel",
    bookingUrl,
  };
}
