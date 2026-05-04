"use client";

import Image from "next/image";
import type { HostActivityExperience } from "@/shared/trip-plan";
import type { PlaceSpotlight } from "@/shared/place-preview";

export type PinDetailState =
  | { kind: "meal"; place: PlaceSpotlight; dateLabel: string }
  | { kind: "activity"; experience: HostActivityExperience; dateLabel: string };

type DetailProps = {
  open: boolean;
  detail: PinDetailState | null;
  onClose: () => void;
};

export function HostSetupPinDetailModal({ open, detail, onClose }: DetailProps) {
  if (!open || !detail) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center p-4 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-detail-title"
    >
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-label="Close" onClick={onClose} />
      <div className="relative max-h-[min(90vh,640px)] w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-dm-card">
        <div className="max-h-[min(90vh,640px)] overflow-y-auto">
          {detail.kind === "meal" ? (
            <MealDetail place={detail.place} dateLabel={detail.dateLabel} onClose={onClose} />
          ) : (
            <ActivityDetail experience={detail.experience} dateLabel={detail.dateLabel} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

function MealDetail({
  place,
  dateLabel,
  onClose,
}: {
  place: PlaceSpotlight;
  dateLabel: string;
  onClose: () => void;
}) {
  const photo = place.photoUrl?.trim();
  return (
    <>
      <div className="relative aspect-[16/10] w-full bg-slate-100 dark:bg-white/5">
        {photo ? (
          <Image src={photo} alt="" fill className="object-cover" sizes="(max-width: 28rem) 100vw, 28rem" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-neutral-500">No photo</div>
        )}
      </div>
      <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="pin-detail-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              {place.name}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">{dateLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-dm-elevated"
          >
            Close
          </button>
        </div>
        <span className="mt-2 inline-block rounded-md bg-teal-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-900 dark:bg-teal-950/60 dark:text-teal-100">
          Meal
        </span>
      </div>
      <div className="space-y-3 px-5 py-4 text-sm">
        {place.rating != null ? (
          <p className="text-slate-700 dark:text-neutral-200">
            <span className="font-medium text-slate-900 dark:text-white">Rating:</span>{" "}
            {typeof place.rating === "number" ? place.rating.toFixed(1) : place.rating}
            {place.reviewCount != null ? ` · ${place.reviewCount.toLocaleString()} reviews` : null}
          </p>
        ) : null}
        {place.priceRange ? (
          <p className="text-slate-700 dark:text-neutral-200">
            <span className="font-medium text-slate-900 dark:text-white">Price:</span> {place.priceRange}
          </p>
        ) : null}
        {place.address ? (
          <p className="text-slate-700 dark:text-neutral-200">
            <span className="font-medium text-slate-900 dark:text-white">Address:</span> {place.address}
          </p>
        ) : null}
        {place.mapsUrl.startsWith("http") ? (
          <a
            href={place.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500"
          >
            Open in Maps
          </a>
        ) : null}
      </div>
    </>
  );
}

function ActivityDetail({
  experience,
  dateLabel,
  onClose,
}: {
  experience: HostActivityExperience;
  dateLabel: string;
  onClose: () => void;
}) {
  const photo = experience.coverPhotoUrl?.trim();
  return (
    <>
      <div className="relative aspect-[16/10] w-full bg-slate-100 dark:bg-white/5">
        {photo ? (
          <Image src={photo} alt="" fill className="object-cover" sizes="(max-width: 28rem) 100vw, 28rem" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-neutral-500">No photo</div>
        )}
      </div>
      <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="pin-detail-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              {experience.name}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">{dateLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-dm-elevated"
          >
            Close
          </button>
        </div>
        <span className="mt-2 inline-block rounded-md bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-900 dark:bg-violet-950/60 dark:text-violet-100">
          Activity
        </span>
      </div>
      <div className="space-y-3 px-5 py-4 text-sm">
        {experience.rating ? (
          <p className="text-slate-700 dark:text-neutral-200">
            <span className="font-medium text-slate-900 dark:text-white">Rating:</span> {experience.rating}
          </p>
        ) : null}
        {experience.duration ? (
          <p className="text-slate-700 dark:text-neutral-200">
            <span className="font-medium text-slate-900 dark:text-white">Duration:</span> {experience.duration}
          </p>
        ) : null}
        {experience.pricePerPerson ? (
          <p className="text-slate-700 dark:text-neutral-200">
            <span className="font-medium text-slate-900 dark:text-white">Price:</span> {experience.pricePerPerson}
          </p>
        ) : null}
        {experience.bookingUrl.startsWith("http") ? (
          <a
            href={experience.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500"
          >
            View booking / details
          </a>
        ) : null}
      </div>
    </>
  );
}

type RemoveProps = {
  open: boolean;
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function HostSetupRemovePinConfirm({ open, label, onConfirm, onCancel }: RemoveProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[230] flex items-end justify-center p-4 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-pin-title"
    >
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" aria-label="Cancel" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-dm-card">
        <h2 id="remove-pin-title" className="text-base font-semibold text-slate-900 dark:text-white">
          Remove from this day?
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400">{label}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500"
          >
            Yes, remove
          </button>
        </div>
      </div>
    </div>
  );
}
