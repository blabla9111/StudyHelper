// Сквозная проверка сценариев: преподаватель ставит баллы и закрывает ведомость, меняет расписание,
// а студент видит результат и получает уведомления. Сайт должен быть запущен.
// ВНИМАНИЕ: скрипт меняет демо-данные, после него выполните `npm run seed`.
//   npm run check:flows
import Database from "better-sqlite3";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ORIGIN = new URL(BASE).origin;
const db = new Database(process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "studyhelper.db"), { readonly: true });

let failed = 0;
const ok = (cond, name) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${name}`);
  if (!cond) failed++;
};

async function req(p, { method = "GET", body, cookie } = {}) {
  const headers = { origin: ORIGIN };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
}
async function login(l, p) {
  const r = await req("/api/auth/login", { method: "POST", body: { login: l, password: p } });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}

const teacher = await login("teacher1", "Teach-One-26");
const student = await login("student1", "Study-One-26");
const uid = (login) => db.prepare("SELECT id FROM users WHERE login = ?").get(login).id;
const studentId = uid("student1");

console.log("Ведомость: баллы и закрытие");
const bd = db.prepare("SELECT id, group_id AS groupId FROM disciplines WHERE name = 'Базы данных' AND semester = 5").get();
const groupStudents = db.prepare("SELECT user_id AS id FROM student_profiles WHERE group_id = ?").all(bd.groupId).map((r) => r.id);
const notifCount = async (c) => (await (await req("/api/notifications", { cookie: c })).json()).items.filter((n) => n.type === "grade").length;

const before = await notifCount(student);
let r = await req(`/api/gradebooks/${bd.id}/close`, { method: "POST", cookie: teacher });
ok(r.status === 400, "закрыть ведомость с пустыми баллами нельзя");

r = await req(`/api/gradebooks/${bd.id}`, { method: "POST", cookie: teacher, body: { rows: [{ studentId, kt1: 31, kt2: 10, exam: 10 }] } });
ok(r.status === 400, "баллы выше максимума отклоняются");
r = await req(`/api/gradebooks/${bd.id}`, { method: "POST", cookie: teacher, body: { rows: [{ studentId: uid("student2"), kt1: 1, kt2: 1, exam: 1 }] } });
ok(r.status === 400, "студента не из этой группы добавить нельзя");

const rows = groupStudents.map((id) => ({ studentId: id, kt1: 25, kt2: 25, exam: id === studentId ? 36 : 30 }));
r = await req(`/api/gradebooks/${bd.id}`, { method: "POST", cookie: teacher, body: { rows } });
ok(r.status === 200, "преподаватель сохраняет баллы");
let html = await (await req("/grades", { cookie: student })).text();
ok(html.includes("86") || html.includes("В процессе"), "студент сразу видит сохранённые баллы");

r = await req(`/api/gradebooks/${bd.id}/close`, { method: "POST", cookie: teacher });
ok(r.status === 200, "ведомость закрывается");
r = await req(`/api/gradebooks/${bd.id}`, { method: "POST", cookie: teacher, body: { rows } });
ok(r.status === 409, "в закрытую ведомость баллы не записываются");
ok((await notifCount(student)) === before + 1, "студент получил уведомление о закрытии");
const notes = (await (await req("/api/notifications", { cookie: student })).json()).items;
ok(notes.some((n) => n.title === "Ведомость закрыта" && n.body.includes("Базы данных") && n.body.includes("86")), "в уведомлении итоговый балл студента (86)");
html = await (await req("/grades", { cookie: student })).text();
ok(/5(<!-- -->)? · (<!-- -->)?Отлично/.test(html), "в зачётке появилась итоговая оценка «5 · Отлично»");
r = await req(`/api/gradebooks/${bd.id}/reopen`, { method: "POST", cookie: teacher });
ok(r.status === 200, "ведомость открывается для правок");

console.log("Расписание: отмена, перенос, возврат");
const lesson = db.prepare("SELECT l.id FROM lessons l JOIN disciplines d ON d.id = l.discipline_id WHERE d.name = 'Базы данных' AND d.semester = 5 AND l.kind = 'Лабораторная'").get();
const iso = (d) => d.toISOString().slice(0, 10);
const from = iso(new Date());
const to = iso(new Date(Date.now() + 21 * 86400000));
const occ = async (c) => (await (await req(`/api/schedule?from=${from}&to=${to}`, { cookie: c })).json()).occurrences;
const target = (await occ(teacher)).find((o) => o.lessonId === lesson.id && o.status === "normal");
ok(!!target, "найдено ближайшее занятие для проверки");

const nBefore = (await (await req("/api/notifications", { cookie: student })).json()).items.length;
r = await req("/api/schedule/changes", { method: "POST", cookie: teacher, body: { lessonId: lesson.id, date: target.date, action: "cancel", reason: "проверка" } });
ok(r.status === 200, "преподаватель отменяет пару");
ok((await occ(student)).some((o) => o.lessonId === lesson.id && o.date === target.date && o.status === "cancelled"), "студент видит пару отменённой");
const n1 = (await (await req("/api/notifications", { cookie: student })).json()).items;
ok(n1.length === Math.min(30, nBefore + 1) && n1[0].title === "Пара отменена", "студент получил уведомление об отмене");

const newDate = iso(new Date(new Date(target.date).getTime() + 2 * 86400000));
r = await req("/api/schedule/changes", { method: "POST", cookie: teacher, body: { lessonId: lesson.id, date: target.date, action: "move", newDate, newSlot: 6, newRoom: "101" } });
ok(r.status === 200, "преподаватель переносит пару");
const afterMove = await occ(student);
ok(afterMove.some((o) => o.status === "moved_away" && o.date === target.date) && afterMove.some((o) => o.status === "moved_here" && o.date === newDate && o.slot === 6 && o.room === "101"), "студент видит пару на старом (перенесена) и новом месте");

r = await req("/api/schedule/changes", { method: "POST", cookie: teacher, body: { lessonId: lesson.id, date: target.date, action: "room", newRoom: "999" } });
ok(r.status === 200, "смена аудитории заменяет перенос");
ok(!(await occ(student)).some((o) => o.status === "moved_here" && o.lessonId === lesson.id), "после смены аудитории перенос снят");

r = await req("/api/schedule/changes", { method: "POST", cookie: teacher, body: { lessonId: lesson.id, date: target.date, action: "restore" } });
ok(r.status === 200, "пара возвращается по расписанию");
ok((await occ(student)).filter((o) => o.lessonId === lesson.id && o.date === target.date).every((o) => o.status === "normal"), "студент снова видит обычную пару");

console.log(failed === 0 ? "\nВсе сценарии пройдены. Выполните npm run seed, чтобы вернуть демо-данные." : `\nПровалено проверок: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
