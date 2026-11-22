import { NextResponse } from "next/server";
import { authorize, jsonError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getGradebookRows, getOwnedDiscipline } from "@/lib/gradebook";
import { writeAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Открыть закрытую ведомость для исправления баллов
export async function POST(req: Request, ctx: Ctx) {
  const auth = await authorize(req, ["teacher"], { mutating: true });
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const discipline = getOwnedDiscipline(auth.user, Number(id));
  if (!discipline) return jsonError("Ведомость не найдена.", 404);
  if (!discipline.closedAt) return jsonError("Ведомость и так открыта.", 409);

  const db = getDb();
  db.transaction(() => {
    // Прежние итоги сохраняем в журнале: по ним можно разобрать спор об оценке
    const before = getGradebookRows(discipline.id, discipline.groupId).map((r) => ({ studentId: r.studentId, kt1: r.kt1, kt2: r.kt2, exam: r.exam }));
    writeAudit(db, auth.user.id, "gradebook_reopen", `discipline:${discipline.id}`, { closedAt: discipline.closedAt, rows: before });
    db.prepare("UPDATE disciplines SET closed_at = NULL WHERE id = ?").run(discipline.id);
    const staff = (db.prepare("SELECT id FROM users WHERE role = 'staff'").all() as { id: number }[]).map((r) => r.id);
    notifyUsers(db, staff, {
      type: "grade",
      title: "Ведомость открыта для правок",
      body: `${auth.user.fullName} открыл(а) закрытую ведомость: ${discipline.name}, группа ${discipline.groupName}.`,
      link: "/",
    });
  })();
  return NextResponse.json({ ok: true });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
