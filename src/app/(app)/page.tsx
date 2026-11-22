import Link from "next/link";
import { ClipboardCheck, Coffee, FilePenLine, Film, Inbox, Megaphone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { firstName, greeting, nameAndPatronymic, relativeTime, todayLabel } from "@/lib/format";
import { formatDayMonth, formatWeekdayDayMonth, todayIso, whereText } from "@/lib/schedule";
import { getNextOccurrence, getOccurrences } from "@/lib/schedule-data";
import { REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/request-catalog";
import type { Occurrence, SessionUser } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";
import { WidgetCard } from "@/components/WidgetCard";
import { MyDay } from "@/components/feed/MyDay";
import { StatusBadge } from "@/components/schedule/parts";
import { colorFor } from "@/components/schedule/palette";
import { getStudentFeed } from "@/lib/feed";

export const metadata = { title: "Главная" };

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const name = user.role === "student" ? firstName(user.fullName) : nameAndPatronymic(user.fullName);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {greeting()}, {name}!
        </h1>
        <p className="mt-1 text-slate-500">{todayLabel()}</p>
      </div>

      {user.role === "student" && <MyDay feed={getStudentFeed(user)} />}
      {user.role !== "student" && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {user.role === "teacher" && <TeacherWidgets user={user} />}
          {user.role === "staff" && <StaffWidgets />}
        </div>
      )}
    </div>
  );
}

function TodayWidget({ user, role }: { user: SessionUser; role: "student" | "teacher" }) {
  const today = todayIso();
  const items = getOccurrences(user, today, today).filter((o) => o.status !== "moved_away");
  const next = items.length === 0 ? getNextOccurrence(user, today) : null;

  return (
    <WidgetCard title="Расписание" href="/schedule">
      {items.length === 0 ? (
        <EmptyState icon={<Coffee className="size-7" />} title="Сегодня пар нет">
          {next
            ? `Ближайшая: ${formatWeekdayDayMonth(next.date).toLowerCase()}, ${next.start}, ${next.subject}.`
            : "В ближайшие две недели занятий не запланировано."}
        </EmptyState>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((o) => (
            <TodayItem key={o.key} o={o} role={role} />
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

function TodayItem({ o, role }: { o: Occurrence; role: "student" | "teacher" }) {
  const c = colorFor(o.disciplineId);
  const dead = o.status === "cancelled";
  return (
    <li>
      <Link href="/schedule" className="flex items-stretch gap-3 rounded-xl p-2 hover:bg-slate-50">
        <span className="w-12 shrink-0 text-sm tabular-nums">
          <span className="block font-semibold">{o.start}</span>
          <span className="block text-slate-400">{o.end}</span>
        </span>
        <span className={`w-1 shrink-0 rounded-full ${c.bar} ${dead ? "opacity-40" : ""}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={`block text-[15px] font-semibold leading-snug ${dead ? "line-through opacity-60" : ""}`}>{o.subject}</span>
          <span className="block text-sm text-slate-500">
            {whereText(o)} · {role === "student" ? o.teacher : `группа ${o.group}`}
          </span>
          {o.status !== "normal" && (
            <span className="mt-1 block">
              <StatusBadge status={o.status} />
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

function TeacherWidgets({ user }: { user: SessionUser }) {
  const open = getDb()
    .prepare(
      `SELECT d.id, d.name, g.name AS groupName,
              (SELECT COUNT(*) FROM student_profiles sp WHERE sp.group_id = d.group_id) AS students,
              (SELECT COUNT(*) FROM grades gr WHERE gr.discipline_id = d.id
                  AND gr.kt1 IS NOT NULL AND gr.kt2 IS NOT NULL AND gr.exam IS NOT NULL) AS complete
         FROM disciplines d JOIN groups g ON g.id = d.group_id
        WHERE d.teacher_id = ? AND d.closed_at IS NULL
        ORDER BY d.exam_date, d.name`,
    )
    .all(user.id) as { id: number; name: string; groupName: string; students: number; complete: number }[];

  return (
    <>
      <TodayWidget user={user} role="teacher" />

      <WidgetCard title="Ведомости" href="/gradebooks">
        {open.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="size-7" />} title="Все ведомости закрыты" />
        ) : (
          <ul className="mt-3 flex flex-col gap-1">
            {open.slice(0, 4).map((d) => (
              <li key={d.id}>
                <Link href={`/gradebooks/${d.id}`} className="block rounded-xl p-2 hover:bg-slate-50">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[15px] font-semibold">{d.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">{d.groupName}</span>
                  </span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(d.complete / d.students) * 100}%` }} />
                    </span>
                    <span className="text-xs tabular-nums text-slate-500">
                      {d.complete} из {d.students}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </WidgetCard>

      <RecordingsWidget teacherId={user.id} />
    </>
  );
}

function RecordingsWidget({ teacherId }: { teacherId: number }) {
  // Одна пара, много просящих: в виджете одна строка на пару со счётчиком ждущих ответа
  const rows = getDb()
    .prepare(
      `SELECT l.id AS lessonId, r.date, d.name AS subject, COUNT(*) AS total,
              SUM(r.status = 'sent') AS pending, MAX(r.created_at) AS lastAt
         FROM recording_requests r
         JOIN lessons l ON l.id = r.lesson_id
         JOIN disciplines d ON d.id = l.discipline_id
        WHERE d.teacher_id = ?
        GROUP BY l.id, r.date
       HAVING SUM(r.status = 'sent') > 0
        ORDER BY lastAt DESC LIMIT 4`,
    )
    .all(teacherId) as { lessonId: number; date: string; subject: string; total: number; pending: number; lastAt: string }[];
  return (
    <WidgetCard title="Запросы на запись" href="/recordings">
      {rows.length === 0 ? (
        <EmptyState icon={<Film className="size-7" />} title="Новых запросов нет">
          Студенты пока не просили записать пары.
        </EmptyState>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {rows.map((r) => (
            <li key={`${r.lessonId}-${r.date}`}>
              <Link href={`/recordings#pair-${r.lessonId}-${r.date}`} className="block rounded-xl p-2 hover:bg-slate-50">
                <span className="block text-[15px] font-semibold">
                  {r.subject}, {formatDayMonth(r.date)}
                </span>
                <span className="block text-sm text-slate-500">
                  Ждут ответа: {r.pending} · {relativeTime(r.lastAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

function StaffWidgets() {
  const db = getDb();
  const queue = db
    .prepare(
      `SELECT r.id, r.title, r.status, u.full_name AS student
         FROM requests r JOIN users u ON u.id = r.student_id
        WHERE r.status IN ('accepted', 'reviewing', 'signed')
        ORDER BY r.created_at DESC LIMIT 5`,
    )
    .all() as { id: number; title: string; status: RequestStatus; student: string }[];
  const total = (db.prepare("SELECT COUNT(*) AS c FROM requests WHERE status IN ('accepted', 'reviewing', 'signed')").get() as { c: number }).c;
  const news = db
    .prepare("SELECT id, title, created_at AS createdAt FROM announcements ORDER BY created_at DESC LIMIT 3")
    .all() as { id: number; title: string; createdAt: string }[];

  return (
    <>
      <WidgetCard title={`Заявки в работе${total ? `: ${total}` : ""}`} href="/requests">
        {queue.length === 0 ? (
          <EmptyState icon={<Inbox className="size-7" />} title="Очередь пуста">
            Новые заявки студентов появятся здесь.
          </EmptyState>
        ) : (
          <ul className="mt-3 flex flex-col gap-1">
            {queue.map((r) => (
              <li key={r.id}>
                <Link href={`/requests/${r.id}`} className="flex items-center justify-between gap-3 rounded-xl p-2 hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold">{r.title}</span>
                    <span className="block truncate text-sm text-slate-500">{r.student}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{REQUEST_STATUS_LABEL[r.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </WidgetCard>
      <WidgetCard title="Объявления" href="/announcements">
        {news.length === 0 ? (
          <EmptyState icon={<Megaphone className="size-7" />} title="Объявлений пока нет">
            Опубликуйте объявление для всех студентов, группы, курса или направления.
          </EmptyState>
        ) : (
          <ul className="mt-3 flex flex-col gap-1">
            {news.map((a) => (
              <li key={a.id} className="rounded-xl p-2">
                <span className="block text-[15px] font-semibold">{a.title}</span>
                <span className="block text-sm text-slate-500">{relativeTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </WidgetCard>
    </>
  );
}
