/** Server-built roster for collaboration UI + future nudges. */

export type TripMemberRole = "host" | "co-host" | "member";

export type TripRosterPerson = {
  kind: "member" | "guest";
  /** Present when traveler enrolled with contact (persistent identity). */
  memberId: string | null;
  /** Anonymous guest row key — use with nudge API when `memberId` is null. */
  guestVisitorKey: string | null;
  displayName: string;
  /** How to correlate collab blobs (prefixed keys + legacy bare UUIDs). */
  voteAliases: string[];
  maskedContact: string | null;
  /** True when this person's vote keys appear in any decision blob. */
  hasParticipated: boolean;
  /** Membership role for this person. */
  role?: TripMemberRole;
};
