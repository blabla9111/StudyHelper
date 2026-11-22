import { CalendarCheck, GraduationCap, Target } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { formatDayMonth, todayIso } from "@/lib/schedule";
import { getGradeItems, getSemesters, getStudentGroup, summarize } from "@/lib/student-grades";
import { GradesView } from "@/components/GradesView";
import { SemesterSelect } from "@/components/SemesterSelect";
import { EmptyState } from "@/components/EmptyState";
import { BookX } from "lucide-react";

export const metadata = { title: "Зачётка" };

export const dynamic = "force-dynamic";

export default async function GradesPage({ searchParams }: { searchParams: Promise<{ semester?: string }> }) {
  const user = await requireUser(["student"]);
  const group = getStudentGroup(user.id);
  if (!group) return <p className="text-slate-500">Группа не найдена.</p>;

  const semesters = getSemesters(group.groupId);
  const asked = Number((await searchParams).semester);
  const semester = semesters.includes(asked) ? asked : (semesters[0] ?? 1);

  // Оценки выбираются по id студента из сессии: чужую зачётку открыть нельзя
  const items = getGradeItems(user.id, group.groupId, semester);
  const summary = summarize(items, todayIso());

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Зачётка</h1>

      <div className="flex flex-wrap items-center gap-2">
        <span className="max-w-full truncate rounded-xl bg-slate-100 px-4 py-2.5 text-[15px] font-medium text-slate-800">
          {group.direction} ({group.studyForm.toLowerCase()})
        </span>
        <SemesterSelect semesters={semesters} current={semester} />
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-3">
          <Tile icon={<GraduationCap className="size-5" />} label="Сдано">
            <span className="text-2xl font-bold">
              {summary.passed} <span className="text-base font-medium text-slate-400">из {summary.total}</span>
            </span>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(summary.passed / summary.total) * 100}%` }} />
            </span>
            {summary.failed > 0 && <span className="mt-1.5 block text-xs text-rose-600">Не сдано: {summary.failed}</span>}
          </Tile>
          <Tile icon={<Target className="size-5" />} label="Средний балл по закрытым">
            <span className="text-2xl font-bold">{summary.averagePoints ?? "—"}</span>
            <span className="mt-1 block text-xs text-slate-500">
              {summary.averagePoints === null ? "Пока нет закрытых ведомостей" : "из 100 возможных"}
            </span>
          </Tile>
          <Tile icon={<CalendarCheck className="size-5" />} label="Ближайший экзамен или зачёт">
            {summary.nextExam ? (
              <>
                <span className="block text-lg font-bold leading-snug">{formatDayMonth(summary.nextExam.date)}</span>
                <span className="mt-0.5 block text-sm text-slate-600">{summary.nextExam.name}</span>
              </>
            ) : (
              <span className="text-lg font-bold">Нет впереди</span>
            )}
          </Tile>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-8 shadow-sm">
          <EmptyState icon={<BookX className="size-7" />} title="В этом семестре дисциплин нет">
            Выберите другой семестр.
          </EmptyState>
        </div>
      ) : (
        <GradesView items={items} />
      )}
    </div>
  );
}

function Tile({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-500">
        <span className="text-brand-600">{icon}</span>
        {label}
      </h2>
      {children}
    </section>
  );
}
