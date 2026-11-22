import { authorize, jsonError, limitUser } from "@/lib/api";
import { getDb } from "@/lib/db";
import fs from "node:fs";
import path from "node:path";
import { kindById } from "@/lib/request-catalog";
import { REQUEST_SELECT, type RequestRow } from "@/lib/requests-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function baseUrl(req: Request): string {
  const env = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (env) return env;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || /^[\d.]+(:\d+)?$/.test(host) ? "http" : "https");
  return /^[a-z0-9.\-:[\]]+$/i.test(host) && /^https?$/.test(proto) ? `${proto}://${host}` : "http://localhost:3000";
}

// Электронная справка в PDF. Скачать её может владелец заявки (или сотрудник деканата), когда справка готова.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(req, ["student", "staff"]);
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const limited = limitUser(user.id, "pdf", 30);
  if (limited) return limited;
  const { id } = await params;

  const db = getDb();
  const r = db.prepare(`${REQUEST_SELECT} WHERE id = ?`).get(Number(id)) as RequestRow | undefined;
  if (!r || (user.role === "student" && r.studentId !== user.id)) return jsonError("Заявка не найдена.", 404);
  const kind = kindById(r.kind);
  if (r.status !== "ready" || r.delivery !== "pdf" || kind?.category !== "certificate") {
    return jsonError("PDF будет доступен, когда справка станет готова.", 409);
  }

  const s = db
    .prepare(
      `SELECT u.full_name AS fullName, g.name AS "group", g.course, g.direction, g.faculty,
              sp.study_form AS form, sp.record_book AS recordBook
         FROM users u
         JOIN student_profiles sp ON sp.user_id = u.id
         JOIN groups g ON g.id = sp.group_id
        WHERE u.id = ?`,
    )
    .get(r.studentId) as { fullName: string; group: string; course: number; direction: string; faculty: string; form: string; recordBook: string };
  const signer = db
    .prepare("SELECT u.full_name AS name, e.position FROM users u JOIN employee_profiles e ON e.user_id = u.id WHERE u.role = 'staff' ORDER BY u.id LIMIT 1")
    .get() as { name: string; position: string } | undefined;
  const ready = db.prepare("SELECT at FROM request_events WHERE request_id = ? AND status = 'ready' ORDER BY at DESC LIMIT 1").get(r.id) as { at: string } | undefined;

  let bytes: Uint8Array;
  let fallback = false;
  try {
    // Библиотека PDF подключается здесь, а не вверху файла: если пакеты не установлены (не выполнен npm install),
    // страница не падает, а студент получает запасной образец справки.
    const { buildCertificatePdf } = await import("@/lib/pdf");
    bytes = await buildCertificatePdf({
      title: r.title,
      kindId: r.kind,
      number: r.code,
      issuedDate: (ready?.at ?? r.updatedAt).slice(0, 10),
      validUntil: r.validUntil,
      purpose: r.purpose,
      student: s,
      signer: signer ?? { name: "Специалист деканата", position: "Специалист по учебной работе" },
      verifyUrl: `${baseUrl(req)}/verify/${r.verifyCode}`,
    });
  } catch (e) {
    console.error("[pdf] не удалось собрать справку, отдаю запасной образец:", e instanceof Error ? e.message : e);
    bytes = fs.readFileSync(path.join(process.cwd(), "assets", "demo-certificate.pdf"));
    fallback = true;
  }

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fallback ? `${r.code}-obrazets` : r.code}.pdf"`,
      ...(fallback ? { "X-Demo-Fallback": "1" } : {}),
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
