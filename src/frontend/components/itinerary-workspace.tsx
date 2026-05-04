"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GlassCard, Pill, PrimaryButton, SecondaryButton, SectionTitle } from "@/frontend/components/cards";
import type { ItineraryActionRequest, ItineraryItem } from "@/shared/itinerary-model";
import type { ItineraryScreenData, ItinerarySection } from "@/shared/itinerary-view";
import { mutateActiveItinerary } from "@/frontend/api/itinerary-api";

type EditDraft = {
  itemId: string;
  title: string;
  details: string;
  meta: string;
  price: string;
  tone: string;
};

function dateLabel(startDate: string | null, endDate: string | null) {
  if (startDate && endDate) {
    return `${startDate} - ${endDate}`;
  }

  return startDate || endDate || null;
}

export function ItineraryWorkspace({ screenData }: { screenData: ItineraryScreenData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [data, setData] = useState(screenData);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [guestCountDraft, setGuestCountDraft] = useState(String(screenData.itinerary.guest_count || 1));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setData(screenData);
    setGuestCountDraft(String(screenData.itinerary.guest_count || 1));
    setDraft(null);
  }, [screenData]);

  const activeSections = useMemo(() => data.sections, [data.sections]);
  const busy = isPending || isSaving;

  async function runAction(action: ItineraryActionRequest) {
    setIsSaving(true);
    try {
      const response = await mutateActiveItinerary(action);
      if (response.itinerary) {
        setData(response as ItineraryScreenData);
      }
      setDraft(null);
      startTransition(() => {
        router.refresh();
      });
      return response;
    } finally {
      setIsSaving(false);
    }
  }

  async function saveEdit(item: ItineraryItem) {
    if (!draft) return;

    await runAction({
      type: "edit_item",
      item_id: item.id,
      patch: {
        title: draft.title,
        details: draft.details,
        meta: draft.meta,
        price: draft.price,
        tone: draft.tone,
      },
    });
    setDraft(null);
  }

  const constraintChips = [
    data.itinerary.parsed_request.origin,
    data.itinerary.parsed_request.destination,
    data.itinerary.location,
    dateLabel(data.itinerary.start_date, data.itinerary.end_date),
    data.itinerary.time_hint,
    data.itinerary.budget,
    data.itinerary.guest_count ? `${data.itinerary.guest_count} guests` : null,
    data.itinerary.parsed_request.cuisine,
    data.itinerary.parsed_request.vibe,
    data.itinerary.parsed_request.uncertain ? "fallback mode" : null,
  ].filter((value): value is string => Boolean(value));
  const uniqueConstraintChips = Array.from(new Set(constraintChips));

  return (
    <div className="space-y-6">
      <GlassCard className="p-5 sm:p-6">
        <SectionTitle
          title="Itinerary editor"
          description="The current itinerary is the source of truth. Every action updates the shared record."
        />
        <div className="flex flex-wrap gap-2">
          {uniqueConstraintChips.map((chip, index) => (
            <Pill key={`${chip}-${index}`}>{chip}</Pill>
          ))}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ActionButton label="Regenerate all" busy={busy} onClick={() => runAction({ type: "regenerate_all" })} />
          <ActionButton
            label="Adjust budget"
            busy={busy}
            onClick={() => runAction({ type: "adjust_budget" })}
          />
          <ActionButton
            label="Make itinerary shorter"
            busy={busy}
            onClick={() => runAction({ type: "make_itinerary_shorter" })}
          />
          <ActionButton
            label="Make itinerary more premium"
            busy={busy}
            onClick={() => runAction({ type: "adjust_budget", budget: "premium" })}
          />
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-dm-elevated sm:flex-row sm:items-end">
          <label className="grid gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-neutral-500">
              Guest count
            </span>
            <input
              value={guestCountDraft}
              onChange={(event) => setGuestCountDraft(event.target.value)}
              inputMode="numeric"
              className="w-32 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-500 dark:border-white/10 dark:bg-dm-card dark:text-neutral-100"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const parsed = Number.parseInt(guestCountDraft, 10);
              if (Number.isNaN(parsed) || parsed < 1) {
                return;
              }
              void runAction({ type: "change_guest_count", guest_count: parsed });
            }}
            className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-dm-card dark:text-neutral-100 dark:hover:border-white/15 dark:hover:bg-dm-elevated"
          >
            Update guests
          </button>
          <p className="text-sm leading-6 text-slate-600 dark:text-neutral-400">
            Regeneration uses the current edited itinerary, not the original prompt defaults.
          </p>
        </div>
      </GlassCard>

      <div className="space-y-5">
        {activeSections.map((section, index) => (
          <ItinerarySectionCard
            key={section.key}
            index={index}
            section={section}
            total={activeSections.length}
            busy={busy}
            draft={draft}
            onMove={(direction) => runAction({ type: "move_item", item_id: section.selectedItem.id, direction })}
            onRemove={() => runAction({ type: "remove_item", item_id: section.selectedItem.id })}
            onReplace={() => runAction({ type: "replace_item", item_id: section.selectedItem.id })}
            onBeginEdit={() =>
              setDraft({
                itemId: section.selectedItem.id,
                title: section.selectedItem.title,
                details: section.selectedItem.details,
                meta: section.selectedItem.meta,
                price: section.selectedItem.price,
                tone: section.selectedItem.tone,
              })
            }
            onSelectAlternative={(alternative) =>
              runAction({
                type: "replace_item",
                item_id: section.selectedItem.id,
                replacement_provider_id: alternative.provider_id,
              }).then(() => setDraft(null))
            }
            onSaveEdit={() => saveEdit(section.selectedItem)}
            onCancelEdit={() => setDraft(null)}
            onDraftChange={setDraft}
          />
        ))}
      </div>

      {activeSections.length === 0 ? (
        <GlassCard className="p-6">
          <p className="text-sm leading-6 text-slate-600 dark:text-neutral-400">
            The itinerary is currently empty. Use “Regenerate all” to restore the plan.
          </p>
        </GlassCard>
      ) : null}

      <GlassCard className="p-5 sm:p-6">
        <SectionTitle
          title="Handoff"
          description="Move the current plan into booking or save it as a durable snapshot."
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <SecondaryButton href="/itinerary">Open itinerary page</SecondaryButton>
          <PrimaryButton href="/booking">Continue to booking handoff</PrimaryButton>
          <SecondaryButton href="/my-trips">Open My Trips</SecondaryButton>
        </div>
      </GlassCard>

      <GlassCard className="p-5 sm:p-6">
        <SectionTitle title="Recent changes" description="Persisted mutation history for the active plan." />
        <div className="grid gap-3">
          {data.itinerary.selections.length > 0 ? (
            data.itinerary.selections.slice(-4).map((selection) => (
              <div
                key={selection.id}
                className="rounded-[1.35rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-dm-elevated dark:text-neutral-400"
              >
                <p className="font-semibold text-ink dark:text-white">{selection.status.replaceAll("_", " ")}</p>
                <p className="mt-1">{selection.created_at}</p>
              </div>
            ))
          ) : (
            <p className="text-sm leading-6 text-slate-600 dark:text-neutral-500">No changes yet.</p>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

function ItinerarySectionCard({
  section,
  index,
  total,
  busy,
  draft,
  onMove,
  onRemove,
  onReplace,
  onBeginEdit,
  onSelectAlternative,
  onSaveEdit,
  onCancelEdit,
  onDraftChange,
}: {
  section: ItinerarySection;
  index: number;
  total: number;
  busy: boolean;
  draft: EditDraft | null;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onReplace: () => void;
  onBeginEdit: () => void;
  onSelectAlternative: (item: ItineraryItem) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDraftChange: (value: EditDraft | null) => void;
}) {
  const item = section.selectedItem;
  const isEditing = draft?.itemId === item.id;

  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-neutral-500">
            Step {index + 1}
          </p>
          <h3 className="mt-2 font-display text-2xl font-semibold tracking-[-0.04em] text-ink dark:text-white">
            {section.title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-neutral-400">{section.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StepButton label="Move up" disabled={index === 0 || busy} onClick={() => onMove(-1)} />
          <StepButton
            label="Move down"
            disabled={index === total - 1 || busy}
            onClick={() => onMove(1)}
          />
        </div>
      </div>

      <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-dm-elevated dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Pill>Selected</Pill>
          <span className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500 dark:text-neutral-500">
            {item.kind}
          </span>
        </div>
        <h4 className="mt-4 font-display text-xl font-semibold tracking-[-0.03em] text-ink dark:text-white">
          {item.title}
        </h4>
        <p className="mt-2 text-sm text-slate-500 dark:text-neutral-500">{item.details}</p>
        <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-neutral-400">{item.meta}</p>
        <p className="mt-4 text-sm font-semibold text-ink dark:text-neutral-100">{item.price}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          <StepButton label="Replace" disabled={busy} onClick={onReplace} />
          <StepButton label="Remove" disabled={busy} onClick={onRemove} />
          <StepButton label="Edit this item" disabled={busy} onClick={onBeginEdit} />
        </div>

        {isEditing ? (
          <div className="mt-5 grid gap-3 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-dm-page">
            <div className="grid gap-2">
              <Field
                label="Title"
                value={draft?.title || ""}
                onChange={(value) => onDraftChange(draft ? { ...draft, title: value } : null)}
              />
              <Field
                label="Details"
                value={draft?.details || ""}
                onChange={(value) => onDraftChange(draft ? { ...draft, details: value } : null)}
              />
              <Field
                label="Meta"
                value={draft?.meta || ""}
                onChange={(value) => onDraftChange(draft ? { ...draft, meta: value } : null)}
              />
              <Field
                label="Price"
                value={draft?.price || ""}
                onChange={(value) => onDraftChange(draft ? { ...draft, price: value } : null)}
              />
              <Field
                label="Tone"
                value={draft?.tone || ""}
                onChange={(value) => onDraftChange(draft ? { ...draft, tone: value } : null)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <StepButton label="Save changes" disabled={busy} onClick={onSaveEdit} />
              <StepButton label="Cancel" disabled={busy} onClick={onCancelEdit} />
            </div>
          </div>
        ) : null}
      </div>

      {section.alternatives.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-neutral-500">
            Alternatives
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {section.alternatives.map((alt) => (
              <div
                key={alt.id}
                className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-dm-elevated"
              >
                <p className="font-display text-lg font-semibold tracking-[-0.03em] text-ink dark:text-white">{alt.title}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-neutral-500">{alt.details}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSelectAlternative(alt)}
                  className="mt-4 inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-dm-card dark:text-neutral-200 dark:hover:bg-dm-page"
                >
                  Swap in this option
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}

function ActionButton({
  label,
  onClick,
  busy,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-dm-card dark:text-neutral-200 dark:hover:border-white/15 dark:hover:bg-dm-elevated"
    >
      {label}
    </button>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-ink transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-dm-card dark:text-neutral-200 dark:hover:border-white/15 dark:hover:bg-dm-elevated"
    >
      {label}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-neutral-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-500 dark:border-white/10 dark:bg-dm-card dark:text-neutral-100"
      />
    </label>
  );
}
