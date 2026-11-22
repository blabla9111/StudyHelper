"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CalendarDays,
  BookMarked,
  FilePenLine,
  MessageSquare,
  ClipboardCheck,
  Megaphone,
  Film,
  type LucideIcon,
} from "lucide-react";
import type { NavIcon, NavItem } from "@/lib/nav";
import { UnreadBadge } from "./messages/client";

const ICONS: Record<NavIcon, LucideIcon> = {
  home: Home,
  schedule: CalendarDays,
  grades: BookMarked,
  requests: FilePenLine,
  messages: MessageSquare,
  gradebooks: ClipboardCheck,
  announcements: Megaphone,
  recordings: Film,
};

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const isActive = useIsActive();
  return (
    <nav aria-label="Основное меню" className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors ${
              active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Icon className="size-5" aria-hidden="true" />
            {item.label}
            {item.icon === "messages" && <UnreadBadge className="ml-auto" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const isActive = useIsActive();
  return (
    <nav
      aria-label="Основное меню"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[10.5px] font-medium tracking-tight ${
                  active ? "text-brand-600" : "text-slate-500"
                }`}
              >
                <span className="relative">
                  <Icon className="size-[22px]" aria-hidden="true" strokeWidth={active ? 2.3 : 1.9} />
                  {item.icon === "messages" && <UnreadBadge className="absolute -right-2.5 -top-1.5 ring-2 ring-white" />}
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
