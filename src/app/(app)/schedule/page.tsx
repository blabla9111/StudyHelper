import { requireUser } from "@/lib/auth";
import { isDateString, todayIso } from "@/lib/schedule";
import { ScheduleView } from "@/components/schedule/ScheduleView";

export const metadata = { title: "Расписание" };

export const dynamic = "force-dynamic";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ d?: string; l?: string }> }) {
  const user = await requireUser(["student", "teacher"]);
  const sp = await searchParams;
  const lessonId = Number(sp.l);
  const initial = isDateString(sp.d) && Number.isInteger(lessonId) && lessonId > 0 ? { date: sp.d, lessonId } : null;
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Расписание</h1>
      <ScheduleView role={user.role === "teacher" ? "teacher" : "student"} today={todayIso()} initial={initial} />
    </div>
  );
}
