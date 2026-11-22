import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { GroupList } from "@/components/GroupList";

export const metadata = { title: "Моя группа" };

export const dynamic = "force-dynamic";

export default async function GroupPage() {
  const user = await requireUser(["student"]);
  const db = getDb();

  // Группа определяется по сессии: чужую группу открыть нельзя, в адресе её номера нет
  const group = db
    .prepare(
      `SELECT g.id, g.name, g.direction, g.course
         FROM student_profiles sp JOIN groups g ON g.id = sp.group_id
        WHERE sp.user_id = ?`,
    )
    .get(user.id) as { id: number; name: string; direction: string; course: number } | undefined;

  if (!group) {
    return <p className="text-slate-500">Группа не найдена.</p>;
  }

  // Одногруппникам отдаём только ФИО — без зачёток, оценок и контактов
  const members = (
    db
      .prepare(
        `SELECT u.id, u.full_name AS fullName
           FROM student_profiles sp JOIN users u ON u.id = sp.user_id
          WHERE sp.group_id = ?
          ORDER BY u.full_name COLLATE NOCASE`,
      )
      .all(group.id) as { id: number; fullName: string }[]
  ).map((m) => ({ id: m.id, fullName: m.fullName, isMe: m.id === user.id }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <Link
          href="/profile"
          className="-ml-2 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> Профиль
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Группа {group.name}</h1>
        <p className="mt-1 text-slate-500">
          {group.direction} · {group.course} курс · {members.length} студентов
        </p>
      </div>

      <GroupList members={members} />
    </div>
  );
}
