import { Check, X } from "lucide-react";
import { REQUEST_STATUS_LABEL, REQUEST_STEPS, type RequestStatus } from "@/lib/request-catalog";

/** Трекер заявки: Принята → Проверяется → Подписана → Готова. Даты шагов показываются, если переданы. */
export function Tracker({
  status,
  dates,
  compact = false,
}: {
  status: RequestStatus;
  dates?: Partial<Record<RequestStatus, string>>;
  compact?: boolean;
}) {
  if (status === "rejected") {
    return (
      <p className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-700">
        <X className="size-4" aria-hidden="true" /> Отклонена
      </p>
    );
  }
  const current = REQUEST_STEPS.indexOf(status);
  return (
    <ol className="flex items-start" aria-label={`Статус: ${REQUEST_STATUS_LABEL[status]}`}>
      {REQUEST_STEPS.map((s, i) => {
        const done = i < current || status === "ready";
        const active = i === current && status !== "ready";
        return (
          <li key={s} className="relative flex min-w-0 flex-1 flex-col items-center text-center" aria-current={active ? "step" : undefined}>
            {i > 0 && (
              <span
                className={`absolute right-1/2 top-[calc(0.75rem-1px)] h-0.5 w-full ${i <= current ? "bg-emerald-500" : "bg-slate-200"}`}
                aria-hidden="true"
              />
            )}
            <span
              className={`relative z-10 inline-flex size-6 items-center justify-center rounded-full border-2 text-white ${
                done ? "border-emerald-500 bg-emerald-500" : active ? "border-brand-600 bg-white ring-4 ring-brand-100" : "border-slate-200 bg-white"
              }`}
              aria-hidden="true"
            >
              {done ? <Check className="size-3.5" /> : active ? <span className="size-2 rounded-full bg-brand-600" /> : null}
            </span>
            <span className={`mt-1.5 max-w-full px-0.5 text-xs [overflow-wrap:anywhere] ${compact ? "" : "sm:text-xs"} leading-tight ${active ? "font-semibold text-brand-800" : done ? "font-medium text-slate-700" : "text-slate-400"}`}>
              {REQUEST_STATUS_LABEL[s]}
            </span>
            {!compact && dates?.[s] && <span className="mt-0.5 text-xs text-slate-400">{dates[s]}</span>}
          </li>
        );
      })}
    </ol>
  );
}
