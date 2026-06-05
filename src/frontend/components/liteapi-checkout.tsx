"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  LiteApiBookingGuest,
  LiteApiBookingRecord,
  LiteApiPrebookApiResponse,
  LiteApiBookApiResponse,
} from "@/shared/liteapi";

const PAYMENT_SDK_SRC = "https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js";

// Minimal typed surface of the LiteAPI Payment SDK global (third-party script).
type LiteApiPaymentInstance = { handlePayment: () => void };
type LiteApiPaymentCtor = new (cfg: {
  publicKey: string;
  secretKey: string;
  targetElement: string;
  returnUrl: string;
  appearance?: Record<string, unknown>;
}) => LiteApiPaymentInstance;
declare global {
  interface Window {
    LiteAPIPayment?: LiteApiPaymentCtor;
  }
}

/** Booking context persisted across the Payment SDK redirect (keyed by prebookId). */
type StoredCtx = {
  transactionId: string;
  rateId: string;
  hotelId: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  city: string;
  guest: LiteApiBookingGuest;
};

const ctxKey = (prebookId: string) => `liteapi-checkout:${prebookId}`;

type Props = {
  tripId: string;
  rateId: string;
  hotelId: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  city: string;
  guests: number;
  /** Present when the page is loaded as the Payment SDK return URL. */
  returnPrebookId: string | null;
};

const inputCls =
  "w-full rounded-lg border border-[color:var(--hairline-strong)] bg-white px-3 py-2 text-sm text-[color:var(--on-surface)] dark:border-white/15 dark:bg-dm-page dark:text-white";

export function LiteApiCheckout(props: Props) {
  const [phase, setPhase] = useState<"form" | "paying" | "confirming" | "done" | "error">(
    props.returnPrebookId ? "confirming" : "form"
  );
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<LiteApiBookingRecord | null>(null);
  const [guest, setGuest] = useState<LiteApiBookingGuest>({ firstName: "", lastName: "", email: "", phone: "" });
  const sdkRequested = useRef(false);

  // Return leg: confirm the booking with the prebook's transactionId.
  useEffect(() => {
    const prebookId = props.returnPrebookId;
    if (!prebookId) return;
    const raw = sessionStorage.getItem(ctxKey(prebookId));
    if (!raw) {
      setError("Your checkout session expired. Please start the booking again.");
      setPhase("error");
      return;
    }
    const ctx = JSON.parse(raw) as StoredCtx;
    void (async () => {
      try {
        const r = await fetch(`/api/trip-plans/${props.tripId}/liteapi/hotels/book`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            prebookId,
            transactionId: ctx.transactionId,
            rateId: ctx.rateId,
            hotelId: ctx.hotelId,
            hotelName: ctx.hotelName,
            checkInDate: ctx.checkIn,
            checkOutDate: ctx.checkOut,
            destinationCity: ctx.city,
            guest: ctx.guest,
          }),
        });
        const j = (await r.json()) as LiteApiBookApiResponse;
        if (!r.ok || !j.booking) {
          setError(j.error ?? "Booking could not be confirmed.");
          setPhase("error");
          return;
        }
        sessionStorage.removeItem(ctxKey(prebookId));
        setBooking(j.booking);
        setPhase("done");
      } catch {
        setError("Network error while confirming the booking.");
        setPhase("error");
      }
    })();
  }, [props.returnPrebookId, props.tripId]);

  const startPayment = useCallback(async () => {
    setError(null);
    if (!guest.firstName.trim() || !guest.lastName.trim() || !guest.email.trim()) {
      setError("Enter the lead guest's first name, last name, and email.");
      return;
    }
    setPhase("paying");
    try {
      const pr = await fetch(`/api/trip-plans/${props.tripId}/liteapi/hotels/prebook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rateId: props.rateId }),
      });
      const pj = (await pr.json()) as LiteApiPrebookApiResponse;
      if (!pr.ok || !pj.prebook) {
        setError(pj.error ?? "Could not prepare this booking. The rate may have expired — search again.");
        setPhase("form");
        return;
      }
      const pb = pj.prebook;
      if (!pb.secretKey || !pb.transactionId) {
        setError("In-app payment isn't available for this rate.");
        setPhase("form");
        return;
      }

      const ctx: StoredCtx = {
        transactionId: pb.transactionId,
        rateId: props.rateId,
        hotelId: props.hotelId,
        hotelName: props.hotelName,
        checkIn: props.checkIn,
        checkOut: props.checkOut,
        city: props.city,
        guest,
      };
      sessionStorage.setItem(ctxKey(pb.prebookId), JSON.stringify(ctx));

      const returnUrl = `${window.location.origin}/trip/${props.tripId}/lodging/checkout?status=return&prebookId=${encodeURIComponent(pb.prebookId)}`;

      const mount = () => {
        const Ctor = window.LiteAPIPayment;
        if (!Ctor) {
          setError("Payment module failed to load. Please try again.");
          setPhase("form");
          return;
        }
        new Ctor({
          publicKey: pb.environment === "sandbox" ? "sandbox" : "live",
          secretKey: pb.secretKey!,
          targetElement: "#liteapi-payment-element",
          returnUrl,
          appearance: { theme: "light" },
        }).handlePayment();
      };

      if (window.LiteAPIPayment) {
        mount();
        return;
      }
      if (!sdkRequested.current) {
        sdkRequested.current = true;
        const s = document.createElement("script");
        s.src = PAYMENT_SDK_SRC;
        s.async = true;
        s.onload = mount;
        s.onerror = () => {
          setError("Could not load the payment module.");
          setPhase("form");
        };
        document.body.appendChild(s);
      }
    } catch {
      setError("Network error preparing the booking.");
      setPhase("form");
    }
  }, [guest, props]);

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <Link href={`/trip/${props.tripId}/setup#sec-lodging`} className="text-sm font-semibold text-[#2563EB] hover:underline dark:text-[#60A5FA]">
        ← Back to lodging
      </Link>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-neutral-950 dark:text-white">Book your stay</h1>
      <p className="mt-1 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">
        {props.hotelName} · {props.checkIn} – {props.checkOut}
      </p>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {phase === "form" ? (
        <div className="mt-6 space-y-4 rounded-2xl border border-[color:var(--hairline)] bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)]">Lead guest</p>
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="First name" value={guest.firstName} onChange={(e) => setGuest((g) => ({ ...g, firstName: e.target.value }))} />
            <input className={inputCls} placeholder="Last name" value={guest.lastName} onChange={(e) => setGuest((g) => ({ ...g, lastName: e.target.value }))} />
          </div>
          <input className={inputCls} type="email" placeholder="Email" value={guest.email} onChange={(e) => setGuest((g) => ({ ...g, email: e.target.value }))} />
          <input className={inputCls} type="tel" placeholder="Phone (optional)" value={guest.phone ?? ""} onChange={(e) => setGuest((g) => ({ ...g, phone: e.target.value }))} />
          <button
            type="button"
            onClick={() => void startPayment()}
            className="w-full rounded-full bg-[#1c1c17] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2a2a26] dark:bg-neutral-200 dark:text-[#1a1a1a] dark:hover:bg-white"
          >
            Continue to payment
          </button>
        </div>
      ) : null}

      {phase === "paying" ? (
        <div className="mt-6 rounded-2xl border border-[color:var(--hairline)] bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--on-surface-muted)]">Payment</p>
          <div id="liteapi-payment-element" className="mt-3 min-h-[120px]" />
        </div>
      ) : null}

      {phase === "confirming" ? (
        <p className="mt-6 text-sm text-[color:var(--on-surface-muted)] dark:text-neutral-400">Confirming your booking…</p>
      ) : null}

      {phase === "done" && booking ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/30 dark:bg-emerald-950/20">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Booking confirmed 🎉</p>
          <p className="mt-1 text-sm text-emerald-900/90 dark:text-emerald-200/90">
            {booking.hotelName} · confirmation {booking.bookingId}
          </p>
          <Link href={`/trip/${props.tripId}/setup#sec-lodging`} className="mt-3 inline-block text-sm font-semibold text-[#2563EB] hover:underline dark:text-[#60A5FA]">
            View on your trip →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
