import { Bookmark } from "lucide-react";
import type { Occurrence } from "@/lib/types";
import { colorFor, STATUS_BADGE } from "./palette";
import { FormatIcon } from "./format-ui";
import { whereText } from "@/lib/schedule";

export function StatusBadge({ status }: { status: Occurrence["status"] }) {
  const b = STATUS_BADGE[status];
  if (!b) return null;
  return <span className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${b.cls}`}>{b.label}</span>;
}

const inactive = (o: Occurrence) => o.status === "cancelled" || o.status === "moved_away";

/** Компактная карточка занятия для ячейки недельной или месячной сетки */
export function LessonChip({
  o,
  onOpen,
  showTime = false,
}: {
  o: Occurrence;
  onOpen: (o: Occurrence) => void;
  showTime?: boolean;
}) {
  const c = colorFor(o.disciplineId);
  return (
    <button
      type="button"
      onClick={() => onOpen(o)}
      className={`flex w-full min-w-0 overflow-hidden rounded-lg text-left transition hover:brightness-95 ${c.soft} ${inactive(o) ? "opacity-70" : ""}`}
      aria-label={`${o.subject}, ${o.kind}, ${o.start}`}
    >
      <span className={`w-1 shrink-0 ${c.bar}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 px-2 py-1.5">
        <span className={`block text-xs font-semibold leading-snug ${c.text} ${inactive(o) ? "line-through" : ""} ${showTime ? "truncate" : "line-clamp-2"}`}>
          {showTime && <span className="font-normal opacity-70">{o.start} </span>}
          {o.subject}
        </span>
        {!showTime && (
          <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <FormatIcon format={o.format} className="size-3 shrink-0" />
            <span className="truncate">{o.format === "online" ? "Онлайн" : o.room}</span>
            {o.recordingMark && <Bookmark className="size-3 shrink-0 text-emerald-600" aria-label="запись будет" />}
          </span>
        )}
        {!showTime && STATUS_BADGE[o.status] && (
          <span className="mt-1 block">
            <StatusBadge status={o.status} />
          </span>
        )}
      </span>
    </button>
  );
}

/** Строка занятия для списка дня (телефон и нижняя часть месячного вида) */
export function LessonRow({
  o,
  role,
  onOpen,
}: {
  o: Occurrence;
  role: "student" | "teacher";
  onOpen: (o: Occurrence) => void;
}) {
  const c = colorFor(o.disciplineId);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(o)}
        className="flex w-full items-stretch gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-300"
      >
        <span className="flex w-14 shrink-0 flex-col items-start justify-center text-sm tabular-nums">
          <span className="font-semibold text-slate-900">{o.start}</span>
          <span className="text-slate-400">{o.end}</span>
        </span>
        <span className={`w-1 shrink-0 rounded-full ${c.bar} ${inactive(o) ? "opacity-40" : ""}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={`block font-semibold leading-snug text-slate-900 ${inactive(o) ? "line-through opacity-60" : ""}`}>
            {o.subject}
          </span>
          <span className="mt-0.5 block text-sm text-slate-500">
            {o.kind} ·{" "}
            <span className="inline-flex items-center gap-1">
              <FormatIcon format={o.format} className="inline size-3.5" /> {whereText(o)}
            </span>
          </span>
          <span className="mt-0.5 block text-sm text-slate-500">{role === "student" ? o.teacher : `Группа ${o.group}`}</span>
          {(o.status !== "normal" || o.recordingMark || o.hasRecording) && (
            <span className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusBadge status={o.status} />
              {o.recordingMark === "will_record" && <MarkBadge>запись будет</MarkBadge>}
              {o.recordingMark === "will_send_notes" && <MarkBadge>пришлют конспект</MarkBadge>}
              {o.hasRecording && !o.recordingMark && <MarkBadge>есть запись</MarkBadge>}
              {o.status === "room_changed" && o.prevRoom && (
                <span className="text-xs text-slate-500">вместо {o.prevRoom}</span>
              )}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function MarkBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
      <Bookmark className="size-3" aria-hidden="true" />
      {children}
    </span>
  );
}
