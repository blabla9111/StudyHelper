"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ControlName, ResultName } from "./Short";
import { MAX_POINTS, examPartLabel, finalResult, totalPoints, type ControlType } from "@/lib/grades";
import { formatDayMonth } from "@/lib/schedule";

export interface GradeItem {
  id: number;
  name: string;
  control: ControlType;
  teacher: string;
  examDate: string | null;
  closed: boolean;
  kt1: number | null;
  kt2: number | null;
  exam: number | null;
}

const COLS = "@4xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1.5fr)_5rem_minmax(0,1.6fr)_7rem_1.5rem]";

function ResultChip({ item }: { item: GradeItem }) {
  const total = totalPoints(item);
  if (item.closed && total !== null) {
    const r = finalResult(item.control, total);
    return (
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.passed ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"}`}>
        <ResultName control={item.control} result={r} />
      </span>
    );
  }
  if (total === null) {
    return <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Баллов пока нет</span>;
  }
  return <span className="inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">В процессе</span>;
}

function Part({ label, value, max }: { label: string; value: number | null; max: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">
        {value ?? "—"} <span className="text-sm font-medium text-slate-400">/ {max}</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${value === null ? 0 : (value / max) * 100}%` }} />
      </div>
    </div>
  );
}

export function GradesView({ items }: { items: GradeItem[] }) {
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <section className="@container overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className={`hidden gap-3 border-b border-slate-100 px-5 py-3 text-sm text-slate-500 @4xl:grid ${COLS}`} aria-hidden="true">
        <span>Название предмета</span>
        <span>Тип контроля</span>
        <span>Баллы</span>
        <span>Итоговая оценка</span>
        <span>Дата экзамена</span>
        <span />
      </div>

      <ul className="divide-y divide-slate-100">
        {items.map((item) => {
          const total = totalPoints(item);
          const open = openId === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : item.id)}
                className="block w-full px-4 py-4 text-left transition-colors hover:bg-slate-50 @4xl:px-5"
              >
                {/* Компьютер: строка таблицы */}
                <span className={`hidden items-center gap-3 @4xl:grid ${COLS}`}>
                  <span className="min-w-0 break-words font-semibold leading-snug text-slate-900">{item.name}</span>
                  <span className="min-w-0 break-words text-slate-700"><ControlName control={item.control} /></span>
                  <span className="font-semibold tabular-nums">{total ?? "—"}</span>
                  <span>
                    <ResultChip item={item} />
                  </span>
                  <span className="text-slate-700">{item.examDate ? formatDayMonth(item.examDate) : "—"}</span>
                  <ChevronDown className={`size-5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
                </span>

                {/* Телефон: карточка */}
                <span className="flex items-start gap-3 @4xl:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug text-slate-900">{item.name}</span>
                    <span className="mt-0.5 block text-sm text-slate-500">
                      <ControlName control={item.control} />
                      {item.examDate && ` · ${formatDayMonth(item.examDate)}`}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      <ResultChip item={item} />
                      {total !== null && <span className="text-sm font-semibold tabular-nums text-slate-700">{total} баллов</span>}
                    </span>
                  </span>
                  <ChevronDown className={`mt-1 size-5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
                </span>
              </button>

              {open && (
                <div className="border-t border-slate-100 bg-white px-4 pb-4 pt-3 @4xl:px-5">
                  <div className="grid grid-cols-3 gap-2">
                    <Part label="Контрольная точка 1" value={item.kt1} max={MAX_POINTS.kt1} />
                    <Part label="Контрольная точка 2" value={item.kt2} max={MAX_POINTS.kt2} />
                    <Part label={examPartLabel(item.control)} value={item.exam} max={MAX_POINTS.exam} />
                  </div>
                  <p className="mt-3 text-sm text-slate-500">Преподаватель: {item.teacher}</p>
                  {!item.closed && (
                    <p className="mt-1 text-sm text-slate-500">
                      Итоговая оценка появится, когда преподаватель закроет ведомость. Для зачёта нужно набрать не меньше 60 баллов из 100.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
