import { NextResponse } from "next/server";
import { authorize, jsonError, limitUser, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { clean, tooLong } from "@/lib/lesson-access";
import { kindById, type Delivery } from "@/lib/request-catalog";
import { createRequest } from "@/lib/requests-data";

export const dynamic = "force-dynamic";

// Студент заказывает справку или подаёт заявление. Данные студента берутся из его профиля, а не из запроса.
export async function POST(req: Request) {
  const auth = await authorize(req, ["student"], { mutating: true });
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const limited = limitUser(user.id, "requests", 30);
  if (limited) return limited;
  const body = await readJson(req);
  if (!body || typeof body.kind !== "string") return jsonError("Некорректный запрос.", 400);

  const kind = kindById(body.kind);
  if (!kind) return jsonError("Такой справки нет в каталоге.", 400);
  const delivery = (kind.pdfAllowed ? body.delivery : "paper") as Delivery;
  if (delivery !== "pdf" && delivery !== "paper") return jsonError("Выберите формат: электронный PDF или бумажная.", 400);

  if (tooLong(body.purpose, 200)) return jsonError("Поле «Куда предоставляется» не длиннее 200 символов.", 400);
  if (tooLong(body.note, 500)) return jsonError("Комментарий не длиннее 500 символов.", 400);
  const purpose = clean(body.purpose, 200);
  if (kind.purposeRequired && !purpose) return jsonError("Укажите, куда предоставляется справка.", 400);
  const note = clean(body.note, 500);
  if (kind.noteRequired && !note) return jsonError("Заполните поле с основанием или причиной.", 400);

  const db = getDb();
  // Защита от дублей: не больше трёх незавершённых заявок одного вида
  const open = (
    db
      .prepare("SELECT COUNT(*) AS c FROM requests WHERE student_id = ? AND kind = ? AND status IN ('accepted', 'reviewing', 'signed')")
      .get(user.id, kind.id) as { c: number }
  ).c;
  if (open >= 3) return jsonError("У вас уже есть три незавершённые заявки этого вида. Дождитесь их готовности.", 429);

  const id = db.transaction(() =>
    createRequest(db, {
      studentId: user.id,
      studentName: user.fullName,
      kind: kind.id,
      delivery,
      purpose: purpose || null,
      note: note || null,
    }),
  )();
  return NextResponse.json({ ok: true, id });
}

// Остальные методы: понятный ответ 405 в формате JSON
import { notAllowed } from "@/lib/api-fallback";
export const GET = notAllowed(["POST"]);
export const PUT = notAllowed(["POST"]);
export const PATCH = notAllowed(["POST"]);
export const DELETE = notAllowed(["POST"]);
