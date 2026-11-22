import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { notifyUsers } from "./notify";
import { addDays, formatDayMonth, todayIso } from "./schedule";
import { kindById, REQUEST_STEPS, type Delivery, type RequestStatus } from "./request-catalog";

export interface RequestRow {
  id: number;
  studentId: number;
  kind: string;
  title: string;
  purpose: string | null;
  delivery: Delivery;
  note: string | null;
  status: RequestStatus;
  code: string;
  verifyCode: string;
  createdAt: string;
  updatedAt: string;
  expectedAt: string;
  validUntil: string | null;
  rejectReason: string | null;
}

export const REQUEST_SELECT = `SELECT id, student_id AS studentId, kind, title, purpose, delivery, note, status, code,
  verify_code AS verifyCode, created_at AS createdAt, updated_at AS updatedAt, expected_at AS expectedAt,
  valid_until AS validUntil, reject_reason AS rejectReason FROM requests`;

export function newCode(db: Database.Database, now = new Date()): string {
  const n = (db.prepare("SELECT COUNT(*) AS c FROM requests").get() as { c: number }).c + 1;
  return `SH-${now.getUTCFullYear()}-${String(n).padStart(6, "0")}`;
}

export const newVerifyCode = () => crypto.randomBytes(8).toString("hex");

const STATUS_NOTE: Record<RequestStatus, (r: { title: string; delivery: Delivery; statement: boolean }) => { title: string; body: string }> = {
  accepted: (r) => ({ title: "Заявка принята", body: `${r.title}: деканат получил заявку.` }),
  reviewing: (r) => ({ title: "Заявка проверяется", body: `${r.title}: сотрудник деканата проверяет данные.` }),
  signed: (r) => ({ title: r.statement ? "Заявление подписано" : "Справка подписана", body: `${r.title}: документ подписан.` }),
  ready: (r) => ({
    title: r.statement ? "Решение готово" : "Справка готова",
    body: r.delivery === "pdf" ? `${r.title}: электронную справку можно скачать в PDF.` : `${r.title}: заберите в деканате (ауд. 101, вымышленный адрес).`,
  }),
  rejected: (r) => ({ title: "Заявка отклонена", body: `${r.title}: подробности в карточке заявки.` }),
};

/** Создаёт заявку, первое событие трекера и уведомления студенту и деканату */
export function createRequest(
  db: Database.Database,
  p: { studentId: number; studentName: string; kind: string; delivery: Delivery; purpose: string | null; note: string | null },
): number {
  const kind = kindById(p.kind)!;
  const now = new Date();
  const iso = now.toISOString();
  const expected = addDays(todayIso(now), kind.days);
  const id = Number(
    db
      .prepare(
        `INSERT INTO requests (student_id, kind, title, purpose, delivery, note, status, code, verify_code, created_at, updated_at, expected_at)
         VALUES (?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?)`,
      )
      .run(p.studentId, kind.id, kind.title, p.purpose, p.delivery, p.note, newCode(db, now), newVerifyCode(), iso, iso, expected)
      .lastInsertRowid,
  );
  db.prepare("INSERT INTO request_events (request_id, status, at, comment) VALUES (?, 'accepted', ?, NULL)").run(id, iso);

  const n = STATUS_NOTE.accepted({ title: kind.title, delivery: p.delivery, statement: kind.category === "statement" });
  notifyUsers(db, [p.studentId], {
    type: "request_status",
    title: n.title,
    body: `${n.body} Ожидаемый срок: ${formatDayMonth(expected)}.`,
    link: `/requests/${id}`,
  });
  const staff = (db.prepare("SELECT id FROM users WHERE role = 'staff'").all() as { id: number }[]).map((r) => r.id);
  notifyUsers(db, staff, {
    type: "request_status",
    title: "Новая заявка",
    body: `${p.studentName}: ${kind.title.toLowerCase()}.`,
    link: `/requests/${id}`,
  });
  return id;
}

export const nextStatus = (s: RequestStatus): RequestStatus | null => {
  const i = REQUEST_STEPS.indexOf(s);
  return i >= 0 && i < REQUEST_STEPS.length - 1 ? REQUEST_STEPS[i + 1] : null;
};

/** Переводит заявку на следующий шаг, пишет событие и уведомляет студента. Возвращает новый статус или null. */
export function advanceRequest(db: Database.Database, r: RequestRow): RequestStatus | null {
  const next = nextStatus(r.status);
  if (!next) return null;
  const kind = kindById(r.kind);
  const now = new Date();
  const iso = now.toISOString();
  const validUntil = next === "ready" && kind?.validDays ? addDays(todayIso(now), kind.validDays) : r.validUntil;
  db.prepare("UPDATE requests SET status = ?, updated_at = ?, valid_until = ? WHERE id = ?").run(next, iso, validUntil, r.id);
  db.prepare("INSERT INTO request_events (request_id, status, at, comment) VALUES (?, ?, ?, NULL)").run(r.id, next, iso);
  const n = STATUS_NOTE[next]({ title: r.title, delivery: r.delivery, statement: kind?.category === "statement" });
  notifyUsers(db, [r.studentId], { type: "request_status", title: n.title, body: n.body, link: `/requests/${r.id}` });
  return next;
}

export function rejectRequest(db: Database.Database, r: RequestRow, reason: string) {
  const iso = new Date().toISOString();
  db.prepare("UPDATE requests SET status = 'rejected', updated_at = ?, reject_reason = ? WHERE id = ?").run(iso, reason, r.id);
  db.prepare("INSERT INTO request_events (request_id, status, at, comment) VALUES (?, 'rejected', ?, ?)").run(r.id, iso, reason);
  const n = STATUS_NOTE.rejected({ title: r.title, delivery: r.delivery, statement: false });
  notifyUsers(db, [r.studentId], { type: "request_status", title: n.title, body: `${n.body} Причина: ${reason}`, link: `/requests/${r.id}` });
}
