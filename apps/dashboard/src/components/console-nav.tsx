"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Overview" },
  { href: "/products", label: "Products" },
  { href: "/agents", label: "Agents" },
  { href: "/approvals", label: "Approvals" },
  { href: "/ai-world", label: "AI World" },
];

export function ConsoleNav({ orientation = "row" }: { orientation?: "row" | "column" }) {
  const pathname = usePathname();

  return (
    <nav
      className={orientation === "column" ? "flex flex-col gap-1" : "flex flex-wrap gap-1"}
      aria-label="Dashboard"
    >
      {links.map((link) => {
        const active = link.href === "/"
          ? pathname === "/"
          : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm transition-colors duration-200",
              orientation === "column" && "w-full",
              active
                ? "border border-zinc-700/50 bg-zinc-800/80 text-white"
                : "border border-transparent text-zinc-400 hover:text-zinc-100",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
