import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";

// Заглушка для разделов, которые появятся на следующих шагах
export function ComingSoon({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <div className="rounded-2xl border border-slate-200 bg-white py-10 shadow-sm">
        <EmptyState icon={icon} title="Раздел в разработке" badge="Скоро">
          {children}
        </EmptyState>
      </div>
    </div>
  );
}
