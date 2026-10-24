export interface NavItem {
  href: string;
  label: string;
  badge?: number | string;
}

export const BOOKMARK_TABS: NavItem[] = [
  { href: "/", label: "Ledger" },
  { href: "/waiting", label: "Waiting" },
  { href: "/new", label: "New Entry" },
];
