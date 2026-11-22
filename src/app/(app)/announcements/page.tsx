import { Megaphone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { AUDIENCE_LABEL, type AudienceType } from "@/lib/announcements";
import { relativeTime } from "@/lib/format";
import { AnnouncementForm } from "@/components/AnnouncementForm";
import { DeleteAnnouncement } from "@/components/DeleteAnnouncement";
import { EmptyState } from "@/components/EmptyState";

export const metadata = { title: "Объявления" };

export const dynamic = "force-dynamic";

interface Row {
  id: number;
  title: string;
  body: string;
  audienceType: AudienceType;
  audienceValue: string | null;
  needsAction: number;
  createdAt: string;
}

export default async function AnnouncementsPage() {
  await requireUser(["staff"]);
  const db = getDb();
  const groups = (db.prepare("SELECT name FROM groups ORDER BY name").all() as { name: string }[]).map((g) => g.name);
  const courses = (db.prepare("SELECT DISTINCT course FROM groups ORDER BY course").all() as { course: number }[]).map((g) => g.course);
  const directions = (db.prepare("SELECT DISTINCT direction FROM groups ORDER BY direction").all() as { direction: string }[]).map((g) => g.direction);
  const rows = db
    .prepare(
      `SELECT id, title, body, audience_type AS audienceType, audience_value AS audienceValue, needs_action AS needsAction, created_at AS createdAt
         FROM announcements ORDER BY created_at DESC LIMIT 30`,
    )
    .all() as Row[];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Объявления</h1>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2 lg:items-start">
        <AnnouncementForm groups={groups} courses={courses} directions={directions} />
        <section aria-label="Опубликованные объявления" className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Опубликованные</h2>
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-8">
              <EmptyState icon={<Megaphone className="size-7" />} title="Объявлений пока нет" />
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((a) => (
                <li key={a.id} className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full px-2 py-0.5 font-bold uppercase tracking-wide ${a.needsAction ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                        {a.needsAction ? "Нужно действие" : "К сведению"}
                      </span>
                      <span className="text-slate-500">
                        {AUDIENCE_LABEL[a.audienceType]}
                        {a.audienceValue ? `: ${a.audienceType === "course" ? `${a.audienceValue} курс` : a.audienceValue}` : ""} · {relativeTime(a.createdAt)}
                      </span>
                    </p>
                    <p className="text-[15px] font-semibold leading-snug">{a.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{a.body}</p>
                  </div>
                  <DeleteAnnouncement id={a.id} title={a.title} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
