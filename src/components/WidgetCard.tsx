import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export function WidgetCard({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-56 min-w-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0 px-5 pt-4">
        <h2 className="min-w-0 break-words text-lg font-bold text-slate-900">{title}</h2>
        {href && (
          <Link
            href={href}
            className="inline-flex min-h-9 shrink-0 items-center gap-0.5 text-sm font-medium text-brand-600 hover:text-brand-800"
          >
            см. больше <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </header>
      <div className="flex flex-1 flex-col justify-center px-5 pb-4">{children}</div>
    </section>
  );
}
