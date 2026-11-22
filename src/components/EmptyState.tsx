import type { ReactNode } from "react";

// Спокойное пустое состояние: иконка в круге, заголовок и пояснение
export function EmptyState({
  icon,
  title,
  children,
  badge,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  badge?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
      <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        {icon}
      </span>
      <p className="font-semibold text-slate-900">{title}</p>
      {children && <p className="mt-1 max-w-xs text-sm text-slate-500">{children}</p>}
      {badge && (
        <span className="mt-3 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {badge}
        </span>
      )}
    </div>
  );
}
