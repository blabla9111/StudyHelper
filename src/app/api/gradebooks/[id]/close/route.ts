import { NextResponse } from "next/server";
import { authorize, jsonError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getGradebookRows, getOwnedDiscipline } from "@/lib/gradebook";
import { finalResult, isComplete, totalPoints } from "@/lib/grades";
import { notifyUsers } from "@/lib/notify";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Закрытие ведомости: студенты получают итоговую оценку и уведомление со своим результатом
export async function POST(req: Request, ctx: Ctx) {
  const auth = await authorize(req, ["teacher"], { mutating: true });
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const discipline = getOwnedDiscipline(auth.user, Number(id));
  if (!discipline) return jsonError("Ведомость не найдена.", 404);
  if (discipline.closedAt) return jsonError("Ведомость уже закрыта.", 409);

  const rows = getGradebookRows(discipline.id, discipline.groupId);
  const missing = rows.filter((r) => !isComplete(r)).length;
  if (missing > 0) {
    return jsonError(`Нельзя закрыть ведомость: баллы не заполнены у студентов (${missing}).`, 400);
  }

  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE disciplines SET closed_at = ? WHERE id = ?").run(new Date().toISOString(), discipline.id);
    writeAudit(db, auth.user.id, "gradebook_close", `discipline:${discipline.id}`, null);
    for (const r of rows) {
      const total = totalPoints(r)!;
      const result = finalResult(discipline.control, total);
      notifyUsers(db, [r.studentId], {
        type: "grade",
        title: "Ведомость закрыта",
        body: `${discipline.name}: ${total} баллов, ${result.label}.`,
        link: "/grades",
      });
    }
  })();

  return NextResponse.json({ ok: true });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
