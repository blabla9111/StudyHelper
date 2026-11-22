import Link from "next/link";
import type { ReactNode } from "react";
import { UserRound } from "lucide-react";
import { NAV } from "@/lib/nav";
import { ROLE_LABEL, type SessionUser } from "@/lib/types";
import { Logo, LogoMark } from "./Logo";
import { ConceptStrip } from "./ConceptStrip";
import { Avatar } from "./Avatar";
import { BottomNav, SidebarNav } from "./NavLinks";
import { NotificationBell } from "./NotificationBell";
import { LogoutButton } from "./LogoutButton";

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const items = NAV[user.role];

  return (
    <div className="flex min-h-dvh flex-col">
      <ConceptStrip />
      <div className="flex min-w-0 flex-1">
        {/* Боковое меню — только на компьютере */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5 md:flex">
          <Link href="/" className="mb-6 px-3" aria-label="StudyHelper — на главную">
            <Logo />
          </Link>
          <SidebarNav items={items} />
          <div className="mt-auto flex flex-col gap-1 border-t border-slate-100 pt-3">
            <Link
              href="/profile"
              className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <UserRound className="size-5" aria-hidden="true" />
              Профиль
            </Link>
            <LogoutButton />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-8">
            <Link href="/" className="md:hidden" aria-label="StudyHelper — на главную">
              <LogoMark />
            </Link>
            <div className="ml-auto flex items-center gap-1.5">
              <NotificationBell />
              <Link
                href="/profile"
                className="flex min-h-11 items-center gap-2.5 rounded-full pl-1 pr-1 hover:bg-slate-100 md:pr-3"
                aria-label="Мой профиль"
              >
                <Avatar name={user.fullName} size="sm" />
                <span className="hidden text-left leading-tight md:block">
                  <span className="block text-sm font-semibold text-slate-900">{shortName(user.fullName)}</span>
                  <span className="block text-xs text-slate-500">{ROLE_LABEL[user.role]}</span>
                </span>
              </Link>
            </div>
          </header>

          <main id="main" tabIndex={-1} className="mx-auto outline-none w-full max-w-6xl flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>
        </div>
      </div>
      <BottomNav items={items} />
    </div>
  );
}

/** «Лисицына Арина Романовна» → «Лисицына А. Р.» */
function shortName(fullName: string) {
  const [last, first, middle] = fullName.trim().split(/\s+/);
  return [last, first && `${first[0]}.`, middle && `${middle[0]}.`].filter(Boolean).join(" ");
}
