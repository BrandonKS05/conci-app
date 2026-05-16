/** Public user card for social / profile UI. */
export type SocialUser = {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  /** Whether the signed-in viewer follows this user. */
  isFollowing?: boolean;
  /** Whether this user follows the viewer. */
  followsYou?: boolean;
  /** Shared trip connections (not including self). */
  mutualCount?: number;
};

export type UserProfilePayload = {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  followsYouBack: boolean;
  /** They follow you but you don't follow them — show "Follow back". */
  showFollowBack: boolean;
  isSelf: boolean;
};

export type SocialListResponse = {
  users: SocialUser[];
};
