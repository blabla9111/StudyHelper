"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

export function SemesterSelect({ semesters, current }: { semesters: number[]; current: number }) {
  const router = useRouter();
  return (
    <label className="relative inline-flex">
      <span className="sr-only">Семестр</span>
      <select
        value={current}
        onChange={(e) => router.push(`/grades?semester=${e.target.value}`)}
        className="h-11 min-w-36 cursor-pointer appearance-none rounded-xl bg-slate-100 pl-4 pr-10 text-[15px] font-medium text-slate-800 outline-none hover:bg-slate-200/70 focus:ring-4 focus:ring-brand-100"
      >
        {semesters.map((s) => (
          <option key={s} value={s}>
            {s} семестр
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
    </label>
  );
}
