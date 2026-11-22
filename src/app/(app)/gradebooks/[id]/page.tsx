import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getGradebookRows, getOwnedDiscipline } from "@/lib/gradebook";
import { ControlName } from "@/components/Short";
import { formatDayMonth } from "@/lib/schedule";
import { GradebookEditor } from "@/components/GradebookEditor";

export const metadata = { title: "Ведомость" };

export const dynamic = "force-dynamic";

export default async function GradebookPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["teacher"]);
  const { id } = await params;

  // Чужая ведомость даёт ту же страницу «не найдено», что и несуществующая
  const discipline = getOwnedDiscipline(user, Number(id));
  if (!discipline) notFound();

  const rows = getGradebookRows(discipline.id, discipline.groupId);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/gradebooks"
          className="-ml-2 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> Ведомости
        </Link>
        <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{discipline.name}</h1>
        <p className="mt-1 text-slate-500">
          Группа {discipline.groupName} · <ControlName control={discipline.control} /> · {discipline.semester} семестр
          {discipline.examDate && ` · ${formatDayMonth(discipline.examDate)}`}
        </p>
      </div>

      <GradebookEditor
        key={discipline.closedAt ?? "open"}
        disciplineId={discipline.id}
        control={discipline.control}
        closedAt={discipline.closedAt}
        rows={rows}
      />
    </div>
  );
}
