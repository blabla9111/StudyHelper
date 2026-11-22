"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { RecordingAnswer } from "./RecordingAnswer";

export interface GroupRequest {
  id: number;
  student: string;
  reason: string;
  comment: string | null;
  status: string;
  teacherComment: string | null;
}

export const REASON: Record<string, string> = { illness: "болею", work: "работа или стажировка", event: "олимпиада или мероприятие", other: "другое" };
const STATUS: Record<string, { label: string; cls: string }> = {
  sent: { label: "Ждёт ответа", cls: "bg-amber-100 text-amber-800" },
  will_record: { label: "Запишу", cls: "bg-emerald-100 text-emerald-800" },
  will_send_notes: { label: "Конспект", cls: "bg-brand-100 text-brand-800" },
  declined: { label: "Не получится", cls: "bg-rose-100 text-rose-700" },
};

/** Одна пара: таблица «студент, причина, ответ» и один ответ сразу всем. Отдельному студенту можно ответить иначе. */
export function RecordingGroup({
  lessonId,
  date,
  requests,
}: {
  lessonId: number;
  date: string;
  requests: GroupRequest[];
}) {
  const [single, setSingle] = useState<number | null>(null);
  const pending = requests.filter((r) => r.status === "sent").length;
  const answeredAll = pending === 0;

  return (
    <div className="mt-3">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <caption className="sr-only">Студенты, просящие записать пару, и причины</caption>
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
            <th scope="col" className="w-[36%] py-1.5 pr-2 font-semibold [overflow-wrap:anywhere]">Студент</th>
            <th scope="col" className="w-[40%] py-1.5 pr-2 font-semibold [overflow-wrap:anywhere]">Причина</th>
            <th scope="col" className="w-[24%] py-1.5 font-semibold">Ответ</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => {
            const s = STATUS[r.status];
            return (
              <FragmentRows key={r.id}>
                <tr className="border-b border-slate-100 align-top">
                  <td className="[overflow-wrap:anywhere] py-2.5 pr-2 font-medium leading-snug">{r.student}</td>
                  <td className="[overflow-wrap:anywhere] py-2.5 pr-2 leading-snug">
                    {REASON[r.reason]}
                    {r.comment && <span className="mt-0.5 block text-xs text-slate-500">«{r.comment}»</span>}
                  </td>
                  <td className="py-2.5">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold leading-tight ${s.cls}`}>{s.label}</span>
                    <button
                      type="button"
                      onClick={() => setSingle((cur) => (cur === r.id ? null : r.id))}
                      aria-expanded={single === r.id}
                      className="mt-1 flex min-h-9 items-center gap-0.5 text-xs font-medium text-slate-500 hover:text-brand-700"
                    >
                      Отдельно <ChevronDown className={`size-3.5 transition-transform ${single === r.id ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
                {single === r.id && (
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <td colSpan={3} className="px-1 pb-3">
                      <p className="pt-2 text-xs font-semibold text-slate-500">Ответ только для: {r.student}</p>
                      <RecordingAnswer target={{ id: r.id }} current={r.status} currentComment={r.teacherComment} />
                    </td>
                  </tr>
                )}
              </FragmentRows>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 rounded-xl bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-800">
          {answeredAll ? `Изменить ответ для всех (${requests.length})` : `Ответить всем, кто ждёт (${pending})`}
        </p>
        <p className="text-xs text-slate-500">Каждый студент получит уведомление с вашим ответом.</p>
        <RecordingAnswer
          target={{ lessonId, date, all: answeredAll }}
          current={null}
          currentComment={null}
          commentLabel="Комментарий для всех"
        />
      </div>

      <Link href={`/schedule?d=${date}&l=${lessonId}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:underline">
        Открыть карточку пары
      </Link>
    </div>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
