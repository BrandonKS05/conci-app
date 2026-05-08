export const HOST_SETUP_NAV_ITEMS = [
  { id: "dates", label: "Trip calendar" },
  { id: "flights", label: "Flights" },
  { id: "budget", label: "Budget" },
  { id: "trip-chat", label: "Trip chat" },
  { id: "collab-sidebar", label: "Group progress" },
] as const;

export type HostSetupNavItemId = (typeof HOST_SETUP_NAV_ITEMS)[number]["id"];
