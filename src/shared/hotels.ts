/** Hotel option for collaboration (RapidAPI / mock). */
export type HotelPick = {
  id: string;
  name: string;
  area: string;
  priceHint: string;
  /** Guest / star rating line for the card */
  rating?: string;
  /** Primary booking link (e.g. booking.com). */
  bookingUrl?: string;
};
