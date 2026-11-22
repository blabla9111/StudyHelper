import { authorize, jsonError } from "@/lib/api";
import { getLessonOnDate } from "@/lib/lesson-access";
import { FORMAT_LABEL, lessonWindow } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// Файл календаря (.ics) для одного занятия. Только для занятий пользователя.
export async function GET(req: Request) {
  const auth = await authorize(req, ["student", "teacher"]);
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const found = getLessonOnDate(auth.user, Number(url.searchParams.get("lessonId")), url.searchParams.get("date"));
  if (!found) return jsonError("Занятие не найдено.", 404);
  const { occ } = found;
  if (occ.status === "cancelled" || occ.status === "moved_away") return jsonError("Эта пара не состоится.", 400);

  const { startMs, endMs } = lessonWindow(occ.date, occ.start, occ.end);
  const where = occ.format === "online" ? (occ.onlineUrl ?? "Онлайн") : `ауд. ${occ.room}`;
  const desc = [
    `${occ.kind}. ${FORMAT_LABEL[occ.format]}.`,
    occ.format !== "offline" && occ.onlineUrl ? `Ссылка: ${occ.onlineUrl}` : "",
    occ.onlineComment ?? "",
    `Преподаватель: ${occ.teacher}.`,
    "StudyHelper: учебный концепт, данные вымышленные.",
  ]
    .filter(Boolean)
    .join("\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StudyHelper//Concept//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:lesson-${occ.lessonId}-${occ.date}@studyhelper.example`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(startMs)}`,
    `DTEND:${stamp(endMs)}`,
    `SUMMARY:${esc(`${occ.subject} (${occ.kind.toLowerCase()})`)}`,
    `LOCATION:${esc(where)}`,
    `DESCRIPTION:${esc(desc)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Скоро пара",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="lesson-${occ.date}.ics"`,
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
