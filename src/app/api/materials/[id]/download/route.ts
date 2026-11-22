import { authorize, jsonError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getLessonForUser } from "@/lib/lesson-access";
import { formatWeekdayDayMonth } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const KIND_RU: Record<string, string> = { presentation: "Презентация", notes: "Конспект", sources: "Источники" };

// Демо-файл материала. Реальных файлов в концепте нет, поэтому отдаём короткий текст.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, ["student", "teacher"]);
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const m = getDb()
    .prepare("SELECT lesson_id AS lessonId, date, title, kind FROM materials WHERE id = ?")
    .get(Number(id)) as { lessonId: number; date: string; title: string; kind: string } | undefined;
  const lesson = m ? getLessonForUser(auth.user, m.lessonId) : null;
  if (!m || !lesson) return jsonError("Материал не найден.", 404);

  const text =
    `${KIND_RU[m.kind] ?? "Материал"}: ${m.title}\n` +
    `Дисциплина: ${lesson.subject}\nЗанятие: ${formatWeekdayDayMonth(m.date)}\n\n` +
    `Это демонстрационный файл учебного концепта StudyHelper. В настоящей системе здесь был бы файл, ` +
    `который прикрепил преподаватель. Все данные вымышленные.\n`;
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(m.title)}.txt`,
      "Cache-Control": "private, no-store",
    },
  });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const POST = notAllowed(["GET"]);
export const PUT = notAllowed(["GET"]);
export const PATCH = notAllowed(["GET"]);
export const DELETE = notAllowed(["GET"]);
