import { NextResponse } from "next/server";
import { authorize, jsonError, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getGradebookRows, getOwnedDiscipline } from "@/lib/gradebook";
import { lastGradebookEvent, writeAudit } from "@/lib/audit";
import { MAX_POINTS } from "@/lib/grades";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function parsePoints(v: unknown, max: number): number | null | "bad" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > max) return "bad";
  return v;
}

// Сохранение баллов (черновик). Только преподаватель этой дисциплины, пока ведомость открыта.
export async function POST(req: Request, ctx: Ctx) {
  const auth = await authorize(req, ["teacher"], { mutating: true });
  if ("error" in auth) return auth.error;

  const { id } = await ctx.params;
  const discipline = getOwnedDiscipline(auth.user, Number(id));
  if (!discipline) return jsonError("Ведомость не найдена.", 404);
  if (discipline.closedAt) return jsonError("Ведомость закрыта. Откройте её для правок.", 409);

  const body = await readJson(req);
  if (!body || !Array.isArray(body.rows) || body.rows.length > 300) return jsonError("Некорректный запрос.", 400);

  const allowed = new Set(getGradebookRows(discipline.id, discipline.groupId).map((r) => r.studentId));
  const parsed: { studentId: number; kt1: number | null; kt2: number | null; exam: number | null }[] = [];

  for (const raw of body.rows as unknown[]) {
    if (!raw || typeof raw !== "object") return jsonError("Некорректный запрос.", 400);
    const r = raw as Record<string, unknown>;
    if (typeof r.studentId !== "number" || !allowed.has(r.studentId)) {
      return jsonError("В списке есть студент не из этой группы.", 400);
    }
    const kt1 = parsePoints(r.kt1, MAX_POINTS.kt1);
    const kt2 = parsePoints(r.kt2, MAX_POINTS.kt2);
    const exam = parsePoints(r.exam, MAX_POINTS.exam);
    if (kt1 === "bad" || kt2 === "bad" || exam === "bad") {
      return jsonError(`Баллы должны быть целыми числами: контрольные до ${MAX_POINTS.kt1}, экзамен или зачёт до ${MAX_POINTS.exam}.`, 400);
    }
    parsed.push({ studentId: r.studentId, kt1, kt2, exam });
  }

  const db = getDb();
  const now = new Date().toISOString();
  const upsert = db.prepare(
    `INSERT INTO grades (discipline_id, student_id, kt1, kt2, exam, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (discipline_id, student_id)
     DO UPDATE SET kt1 = excluded.kt1, kt2 = excluded.kt2, exam = excluded.exam, updated_at = excluded.updated_at`,
  );
  db.transaction(() => {
    // Если ведомость уже закрывали и снова открыли, прежние баллы изменённых строк уходят в журнал
    if (lastGradebookEvent(db, discipline.id) === "gradebook_reopen") {
      const old = new Map(getGradebookRows(discipline.id, discipline.groupId).map((r) => [r.studentId, r]));
      const changes = parsed
        .filter((p) => {
          const o = old.get(p.studentId);
          return !o || o.kt1 !== p.kt1 || o.kt2 !== p.kt2 || o.exam !== p.exam;
        })
        .map((p) => {
          const o = old.get(p.studentId);
          return { studentId: p.studentId, old: o ? { kt1: o.kt1, kt2: o.kt2, exam: o.exam } : null, new: { kt1: p.kt1, kt2: p.kt2, exam: p.exam } };
        });
      if (changes.length > 0) writeAudit(db, auth.user.id, "grades_changed_after_reopen", `discipline:${discipline.id}`, { changes });
    }
    for (const p of parsed) upsert.run(discipline.id, p.studentId, p.kt1, p.kt2, p.exam, now);
  })();

  return NextResponse.json({ ok: true });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
