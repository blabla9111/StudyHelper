import { Film } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { slotByNumber, formatWeekdayDayMonth } from "@/lib/schedule";
import { EmptyState } from "@/components/EmptyState";
import { RecordingGroup, type GroupRequest } from "@/components/RecordingGroup";

export const metadata = { title: "Запросы на запись" };

export const dynamic = "force-dynamic";

interface Row extends GroupRequest {
  groupName: string;
  subject: string;
  kind: string;
  slot: number;
  lessonId: number;
  date: string;
  createdAt: string;
}

interface PairGroup {
  key: string;
  lessonId: number;
  date: string;
  subject: string;
  kind: string;
  groupName: string;
  slot: number;
  requests: GroupRequest[];
  pending: number;
  lastAt: string;
}

// Запросы студентов на запись пар. Только по дисциплинам вошедшего преподавателя.
// Запросы на одну и ту же пару собраны в одну карточку: список студентов и причин, один ответ для всех.
export default async function RecordingsPage() {
  const user = await requireUser(["teacher"]);
  const rows = getDb()
    .prepare(
      `SELECT r.id, u.full_name AS student, g.name AS groupName, d.name AS subject, l.kind, l.slot, l.id AS lessonId, r.date,
              r.reason, r.comment, r.status, r.teacher_comment AS teacherComment, r.created_at AS createdAt
         FROM recording_requests r
         JOIN users u ON u.id = r.student_id
         JOIN lessons l ON l.id = r.lesson_id
         JOIN disciplines d ON d.id = l.discipline_id
         JOIN groups g ON g.id = d.group_id
        WHERE d.teacher_id = ?
        ORDER BY r.created_at ASC`,
    )
    .all(user.id) as Row[];

  const byPair = new Map<string, PairGroup>();
  for (const r of rows) {
    const key = `${r.lessonId}-${r.date}`;
    let g = byPair.get(key);
    if (!g) {
      g = { key, lessonId: r.lessonId, date: r.date, subject: r.subject, kind: r.kind, groupName: r.groupName, slot: r.slot, requests: [], pending: 0, lastAt: r.createdAt };
      byPair.set(key, g);
    }
    g.requests.push({ id: r.id, student: r.student, reason: r.reason, comment: r.comment, status: r.status, teacherComment: r.teacherComment });
    if (r.status === "sent") g.pending++;
    if (r.createdAt > g.lastAt) g.lastAt = r.createdAt;
  }
  // Сначала пары, где есть ждущие ответа, затем по давности запросов
  const groups = [...byPair.values()].sort((a, b) => Number(b.pending > 0) - Number(a.pending > 0) || b.lastAt.localeCompare(a.lastAt));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Запросы на запись</h1>
        <p className="mt-1 text-slate-600">Студенты просят записать пропущенные пары. Запросы на одну пару собраны вместе, ответ придёт каждому уведомлением.</p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-10 shadow-sm">
          <EmptyState icon={<Film className="size-7" />} title="Запросов нет">
            Когда студент попросит записать пару, запрос появится здесь.
          </EmptyState>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((g) => (
            <li key={g.key} id={`pair-${g.key}`} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm target:ring-2 target:ring-brand-300">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-snug">
                    {g.subject}, {g.kind.toLowerCase()}
                  </p>
                  <p className="text-sm text-slate-600">{g.groupName}</p>
                  <p className="text-sm text-slate-500">
                    {formatWeekdayDayMonth(g.date)}, {slotByNumber(g.slot)?.start}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${g.pending > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
                >
                  {g.pending > 0 ? `Ждут ответа: ${g.pending}` : "Все обработаны"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Просят записать: {g.requests.length}</p>
              <RecordingGroup lessonId={g.lessonId} date={g.date} requests={g.requests} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
