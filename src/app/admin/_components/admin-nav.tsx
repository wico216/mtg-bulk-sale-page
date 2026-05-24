"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  matchPrefix: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/admin", label: "Inventory", matchPrefix: "/admin" },
  { href: "/admin/orders", label: "Orders", matchPrefix: "/admin/orders" },
  { href: "/admin/audit", label: "Audit", matchPrefix: "/admin/audit" },
  { href: "/admin/health", label: "Health", matchPrefix: "/admin/health" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/admin") {
    // Inventory is the bare /admin route — only "active" when exact match
    // or on the /admin/import flow (operator workflow continuation).
    return pathname === "/admin" || pathname.startsWith("/admin/import");
  }
  return pathname.startsWith(item.matchPrefix);
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      className="flex w-full items-center gap-1 overflow-x-auto sm:w-auto sm:justify-center"
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap"
            style={{
              color: active ? "var(--ink)" : "var(--muted)",
              background: active
                ? "color-mix(in oklab, var(--accent) 14%, transparent)"
                : "transparent",
            }}
          >
            {item.label}
            {active && (
              <span
                aria-hidden="true"
                className="absolute -bottom-[13px] left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full"
                style={{ background: "var(--accent)" }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
