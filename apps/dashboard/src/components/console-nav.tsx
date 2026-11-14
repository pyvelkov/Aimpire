"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Overview" },
  { href: "/products", label: "Products" },
  { href: "/agents", label: "Agents" },
  { href: "/approvals", label: "Approvals" },
  { href: "/world", label: "AI World" },
];

export function ConsoleNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Dashboard">
      {links.map((link) => {
        const active = link.href === "/"
          ? pathname === "/"
          : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm ${
              active
                ? "bg-ink text-card"
                : "bg-card text-muted ring-1 ring-line hover:text-ink"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
