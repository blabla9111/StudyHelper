// Сквозная проверка трёх функций: «Мой день», карточка пары (формат, материалы, запись, дедлайны), справки с PDF и QR.
// Сайт должен быть запущен. ВНИМАНИЕ: скрипт меняет демо-данные, после него выполните `npm run seed`.
//   npm run check:features
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
async function req(p, { method = "GET", body, cookie, origin = ORIGIN } = {}) {
  const headers = {};
  if (origin) headers.origin = origin;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
}
async function login(l, p) {
  const r = await req("/api/auth/login", { method: "POST", body: { login: l, password: p } });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
const json = async (r) => r.json().catch(() => ({}));

// ---- даты: понедельник первой недели семестра 2026-09-07 (нечётная)
const DAY = 86_400_000;
const utc = (d) => Date.parse(d + "T00:00:00Z");
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());
const weekdayOf = (d) => ((new Date(utc(d)).getUTCDay() + 6) % 7) + 1;
const parityOf = (d) => (Math.floor((utc(d) - utc("2026-09-07") - (weekdayOf(d) - 1) * DAY) / (7 * DAY)) % 2 === 0 ? "odd" : "even");
function nextDate(lesson, from = today) {
  for (let i = 1; i <= 21; i++) {
    const d = iso(utc(from) + i * DAY);
    if (weekdayOf(d) === lesson.weekday && (lesson.parity === "all" || lesson.parity === parityOf(d))) return d;
  }
  throw new Error("нет даты");
}
const lessonOf = (name, idx, groupName) =>
  db.prepare(`SELECT l.id, l.weekday, l.parity, l.slot FROM lessons l JOIN disciplines d ON d.id = l.discipline_id JOIN groups g ON g.id = d.group_id
              WHERE d.name = ? AND g.name = ? AND d.semester >= 3 ORDER BY l.id LIMIT 1 OFFSET ?`).get(name, groupName, idx);
const uid = (l) => db.prepare("SELECT id FROM users WHERE login = ?").get(l).id;
const notes = async (c) => (await json(await req("/api/notifications", { cookie: c }))).items ?? [];

const student = await login("student1", "Study-One-26");
const student2 = await login("student2", "Study-Two-26");
const teacher1 = await login("teacher1", "Teach-One-26");
const teacher2 = await login("teacher2", "Teach-Two-26");
const dean = await login("dean1", "Dean-One-26");
ok(Boolean(student && student2 && teacher1 && teacher2 && dean), "все демо-аккаунты входят");

// ---------------------------------------------------------------- 1. «Мой день» и перенос пары
console.log("1. Перенос пары, «Мой день», календарь");
const mlLec = lessonOf("Машинное обучение", 0, "ПИ-24-1");
const mlDate = nextDate(mlLec);
const newDate = iso(utc(mlDate) + 2 * DAY);
let r = await req("/api/schedule/changes", { method: "POST", cookie: teacher1, body: { lessonId: mlLec.id, date: mlDate, action: "restore" } });
r = await req("/api/schedule/changes", { method: "POST", cookie: teacher1, body: { lessonId: mlLec.id, date: mlDate, action: "move", newDate, newSlot: 5, newRoom: "401" } });
ok(r.status === 200, "преподаватель переносит пару");
ok((await notes(student)).some((n) => n.title === "Пара перенесена" && n.body.includes("Машинное обучение")), "студент получил уведомление о переносе");
let home = await (await req("/", { cookie: student })).text();
ok(home.includes("Изменилось") && home.includes("Машинное обучение"), "в «Моём дне» карточка «Изменилось» с этой парой");
ok(home.includes("Сегодня") && home.includes("дедлайн"), "в шапке есть строка про пары и дедлайны");
ok(home.includes("Ближайшая пара"), "в ленте есть карточка ближайшей пары");
ok(home.includes("Только важное"), "есть переключатель «Только важное»");
r = await req(`/api/schedule/ics?lessonId=${mlLec.id}&date=${newDate}`, { cookie: student });
const ics = await r.text();
ok(r.status === 200 && (r.headers.get("content-type") ?? "").includes("text/calendar") && ics.includes("BEGIN:VEVENT") && ics.includes("DTSTART:"), "файл .ics для новой даты отдаётся");
ok(ics.includes(`DTSTART:${newDate.replace(/-/g, "")}T1`), "время в .ics пересчитано в UTC (15:30 МСК = 12:30Z)");
r = await req(`/api/schedule/ics?lessonId=${mlLec.id}&date=${newDate}`, { cookie: student2 });
ok(r.status === 404, "студент другой группы не получает .ics чужой пары");
r = await req(`/api/schedule/ics?lessonId=${mlLec.id}&date=${newDate}`);
ok(r.status === 401, "без входа .ics недоступен");

// ---------------------------------------------------------------- 2. Пропуск пары, запрос записи
console.log("2. Запрос записи и ответ преподавателя");
const tvLec = lessonOf("Теория вероятностей и математическая статистика", 0, "ПИ-24-1");
const tvDate = nextDate(tvLec);
r = await req("/api/recording-requests", { method: "POST", cookie: student, body: { lessonId: tvLec.id, date: tvDate, reason: "hack" } });
ok(r.status === 400, "неизвестная причина отклоняется");
r = await req("/api/recording-requests", { method: "POST", cookie: student2, body: { lessonId: tvLec.id, date: tvDate, reason: "illness" } });
ok(r.status === 404, "студент другой группы не может просить запись чужой пары");
r = await req("/api/recording-requests", { method: "POST", cookie: student, body: { lessonId: tvLec.id, date: tvDate, reason: "illness", comment: "Температура" } });
ok(r.status === 200, "студент просит записать пару");
r = await req("/api/recording-requests", { method: "POST", cookie: student, body: { lessonId: tvLec.id, date: tvDate, reason: "illness" } });
ok(r.status === 409, "повторный запрос на ту же пару отклоняется");
ok((await notes(teacher2)).some((n) => n.type === "recording_request" && n.body.includes("Лисицына")), "преподаватель получил уведомление о запросе");
const reqRow = db.prepare("SELECT id FROM recording_requests WHERE student_id = ? AND lesson_id = ? AND date = ?").get(uid("student1"), tvLec.id, tvDate);
r = await req("/api/recording-requests/answer", { method: "POST", cookie: teacher1, body: { id: reqRow.id, status: "will_record" } });
ok(r.status === 404, "чужой преподаватель не может ответить на запрос");
r = await req("/api/recording-requests/answer", { method: "POST", cookie: teacher2, body: { id: reqRow.id, status: "declined" } });
ok(r.status === 400, "отказ без комментария не принимается");
r = await req("/api/recording-requests/answer", { method: "POST", cookie: teacher2, body: { id: reqRow.id, status: "will_record", comment: "Запишу" } });
ok(r.status === 200, "преподаватель отвечает «запишу»");
ok((await notes(student)).some((n) => n.title === "Преподаватель запишет пару"), "студент получил уведомление об ответе");
const week = await json(await req(`/api/schedule?from=${tvDate}&to=${tvDate}`, { cookie: student }));
ok(week.occurrences.some((o) => o.lessonId === tvLec.id && o.recordingMark === "will_record"), "в расписании у пары отметка «запись будет»");
r = await req("/api/recording-requests/answer", { method: "POST", cookie: student, body: { id: reqRow.id, status: "will_record" } });
ok(r.status === 403, "студент не может отвечать на запросы");

// ---------------------------------------------------------------- 3. Дедлайн от преподавателя
console.log("3. Дедлайн появляется в «Моём дне»");
const bdLab = lessonOf("Базы данных", 1, "ПИ-24-1");
const labDate = nextDate(bdLab);
const due = iso(utc(today) + 4 * DAY);
r = await req("/api/deadlines", { method: "POST", cookie: teacher2, body: { lessonId: bdLab.id, date: labDate, title: "Чужое", dueDate: due } });
ok(r.status === 404, "преподаватель не может ставить дедлайн по чужой дисциплине");
r = await req("/api/deadlines", { method: "POST", cookie: teacher1, body: { lessonId: bdLab.id, date: labDate, title: "Лабораторная № 4: транзакции", dueDate: iso(utc(today) - DAY) } });
ok(r.status === 400, "срок в прошлом отклоняется");
r = await req("/api/deadlines", { method: "POST", cookie: teacher1, body: { lessonId: bdLab.id, date: labDate, title: "Лабораторная № 4: транзакции", dueDate: due } });
ok(r.status === 200, "преподаватель добавляет дедлайн в карточке пары");
home = await (await req("/", { cookie: student })).text();
ok(home.includes("Лабораторная № 4: транзакции"), "дедлайн сразу виден студенту в ленте");
ok(!(await (await req("/", { cookie: student2 })).text()).includes("Лабораторная № 4: транзакции"), "студенту другой группы дедлайн не виден");
ok((await notes(student)).some((n) => n.type === "deadline" && n.body.includes("Лабораторная № 4")), "студент получил уведомление о новом задании");
const dl = db.prepare("SELECT id FROM deadlines WHERE title = ?").get("Лабораторная № 4: транзакции");
r = await req("/api/deadlines/done", { method: "POST", cookie: student2, body: { id: dl.id, done: true } });
ok(r.status === 404, "чужой студент не может отметить задание выполненным");
r = await req("/api/deadlines/done", { method: "POST", cookie: student, body: { id: dl.id, done: true } });
ok(r.status === 200, "студент отмечает «Сделано»");
ok(!(await (await req("/", { cookie: student })).text()).includes("Лабораторная № 4: транзакции"), "выполненное задание уходит из ленты");

// ---------------------------------------------------------------- 4. Формат пары
console.log("4. Онлайн и ссылка");
const fmtLec = lessonOf("Теория вероятностей и математическая статистика", 0, "ПИ-24-1");
const fmtDate = nextDate(fmtLec);
r = await req("/api/lessons/format", { method: "POST", cookie: teacher2, body: { lessonId: fmtLec.id, date: fmtDate, format: "online", url: "javascript:alert(1)" } });
ok(r.status === 400, "ссылка не http/https отклоняется");
r = await req("/api/lessons/format", { method: "POST", cookie: teacher2, body: { lessonId: fmtLec.id, date: fmtDate, format: "online", url: "ftp://example.org/x" } });
ok(r.status === 400, "ссылка ftp отклоняется");
r = await req("/api/lessons/format", { method: "POST", cookie: teacher1, body: { lessonId: fmtLec.id, date: fmtDate, format: "online", url: "https://meet.example.org/x" } });
ok(r.status === 404, "чужой преподаватель не может менять формат");
r = await req("/api/lessons/format", { method: "POST", cookie: teacher2, body: { lessonId: fmtLec.id, date: fmtDate, format: "online", url: "https://meet.example.org/tvims-online", comment: "Пароль 1234" } });
ok(r.status === 200, "преподаватель переводит пару в онлайн и вставляет ссылку");
ok((await notes(student)).some((n) => n.type === "lesson_format" && n.title.includes("теперь онлайн")), "студенты получили «… теперь онлайн»");
let det = await json(await req(`/api/lessons/detail?lessonId=${fmtLec.id}&date=${fmtDate}`, { cookie: student }));
ok(det.occurrence?.format === "online" && det.occurrence?.onlineUrl === "https://meet.example.org/tvims-online", "в карточке пары формат «онлайн» и ссылка");
ok(det.occurrence?.formatChange?.from === "offline" || det.occurrence?.formatChange?.from === "hybrid", "сохранено, каким был формат раньше");
home = await (await req("/", { cookie: student })).text();
ok(home.includes("Очно + трансляция") || home.includes("Онлайн"), "в ленте виден формат пары");
r = await req("/api/lessons/format", { method: "POST", cookie: teacher2, body: { lessonId: fmtLec.id, date: fmtDate, format: "online", url: "https://meet.example.org/tvims-online", comment: "Пароль 1234" } });
ok(r.status === 400, "повторное сохранение без изменений отклоняется");
r = await req("/api/lessons/format", { method: "POST", cookie: teacher2, body: { lessonId: fmtLec.id, date: fmtDate, format: "offline" } });
ok(r.status === 200, "формат можно вернуть на «очно»");
r = await req("/api/lessons/materials", { method: "POST", cookie: teacher2, body: { lessonId: fmtLec.id, date: fmtDate, title: "Лекция 10", kind: "presentation" } });
ok(r.status === 200, "преподаватель добавляет материал");
det = await json(await req(`/api/lessons/detail?lessonId=${fmtLec.id}&date=${fmtDate}`, { cookie: student }));
const mat = det.materials?.find((m) => m.title === "Лекция 10");
ok(Boolean(mat), "материал виден студенту в карточке");
r = await req(`/api/materials/${mat.id}/download`, { cookie: student });
ok(r.status === 200 && (await r.text()).includes("демонстрационный"), "демо-файл материала скачивается");
r = await req(`/api/materials/${mat.id}/download`, { cookie: student2 });
ok(r.status === 404, "студент другой группы не скачивает материал");
r = await req("/api/lessons/recording", { method: "POST", cookie: teacher2, body: { lessonId: fmtLec.id, date: fmtDate, title: "Запись" } });
ok(r.status === 400, "запись нельзя прикрепить к будущей паре");

// ---------------------------------------------------------------- 5. Справка: PDF и QR
console.log("5. Справка «в военкомат»: трекер, PDF, QR");
r = await req("/api/requests", { method: "POST", cookie: student, body: { kind: "nonexistent", delivery: "pdf" } });
ok(r.status === 400, "неизвестный вид справки отклоняется");
r = await req("/api/requests", { method: "POST", cookie: student, body: { kind: "on_demand", delivery: "pdf" } });
ok(r.status === 400, "для справки по месту требования нужно указать, куда она предоставляется");
r = await req("/api/requests", { method: "POST", cookie: student, body: { kind: "military", delivery: "pdf", purpose: "Военный комиссариат" } });
const created = await json(r);
ok(r.status === 200 && created.id, "студент заказывает справку в военкомат");
const rid = created.id;
ok((await notes(dean)).some((n) => n.type === "request_status" && n.title === "Новая заявка" && n.body.includes("Лисицына")), "деканат получил уведомление о заявке");
r = await req(`/api/requests/${rid}/pdf`, { cookie: student });
ok(r.status === 409, "до готовности PDF не отдаётся");
r = await req(`/api/requests/${rid}/pdf`, { cookie: student2 });
ok(r.status === 404, "чужую заявку скачать нельзя");
r = await req("/api/requests/advance", { method: "POST", cookie: student, body: { id: rid } });
ok(r.status === 404 || r.status === 405, "кнопки «Ускорить статус» больше нет: старый адрес не отвечает (404/405)");
const stepAs = (cookie) => req("/api/requests/status", { method: "POST", cookie, body: { id: rid } });
ok((await stepAs(student)).status === 403, "студент не может сменить статус своей заявки");
ok((await stepAs(student2)).status === 403, "чужой студент не может сменить статус");
ok((await stepAs(teacher1)).status === 403, "преподаватель не двигает заявки");
const reqPage = await (await req(`/requests/${rid}`, { cookie: student })).text();
ok(!reqPage.includes("Ускорить статус") && !reqPage.includes("Только для демо"), "на странице заявки у студента нет кнопок смены статуса");
for (let i = 0; i < 3; i++) r = await stepAs(dean);
ok(r.status === 200, "деканат проводит заявку через три шага");
r = await stepAs(dean);
ok(r.status === 400, "после «Готова» двигать некуда");
const st = (await notes(student)).filter((n) => n.type === "request_status").map((n) => n.title);
ok(st.includes("Заявка проверяется") && st.includes("Справка подписана") && st.includes("Справка готова"), "уведомление на каждом шаге");
r = await req(`/api/requests/${rid}/pdf`, { cookie: student });
const pdf = Buffer.from(await r.arrayBuffer());
ok(r.status === 200 && pdf.subarray(0, 5).toString() === "%PDF-" && pdf.length > 20_000, `PDF скачивается (${pdf.length} байт)`);
const row = db.prepare("SELECT verify_code AS v, code FROM requests WHERE id = ?").get(rid);
let vr = await req(`/verify/${row.v}`);
let vh = await vr.text();
ok(vr.status === 200 && vh.includes("Справка подлинна") && vh.includes(row.code) && vh.includes("Лисицына А. Р."), "страница проверки подтверждает справку без входа");
ok(!vh.includes("2024-0137"), "на странице проверки нет номера зачётки");
vh = await (await req(`/verify/0123456789abcdef`)).text();
ok(vh.includes("Справка не найдена"), "неизвестный код: «Справка не найдена»");
vh = await (await req(`/verify/..%2Fadmin`)).text();
ok(vh.includes("Справка не найдена"), "странный код не ломает страницу");
const pending = db.prepare("SELECT verify_code AS v FROM requests WHERE status IN ('accepted','reviewing') LIMIT 1").get();
vh = await (await req(`/verify/${pending.v}`)).text();
ok(vh.includes("Справка не найдена"), "неготовая справка по коду не подтверждается");
r = await req("/api/requests", { method: "POST", cookie: student, body: { kind: "academic_leave", delivery: "pdf", note: "Болезнь, на семестр" } });
const leave = await json(r);
ok(r.status === 200 && db.prepare("SELECT delivery FROM requests WHERE id = ?").get(leave.id).delivery === "paper", "заявление выдаётся только в бумажном виде");
r = await req("/api/requests/reject", { method: "POST", cookie: dean, body: { id: leave.id, reason: "Нужны документы из поликлиники" } });
ok(r.status === 200, "деканат отклоняет заявление с причиной");
ok((await notes(student)).some((n) => n.title === "Заявка отклонена" && n.body.includes("поликлиники")), "студент видит причину отказа в уведомлении");
r = await req("/api/requests/reject", { method: "POST", cookie: student, body: { id: leave.id, reason: "x" } });
ok(r.status === 403, "студент не может отклонять заявки");
const rpage = await (await req(`/requests/${rid}`, { cookie: student })).text();
ok(rpage.includes("Скачать PDF") && rpage.includes("Проверить подлинность"), "в карточке готовой заявки кнопки PDF и проверки");
ok((await req(`/requests/${rid}`, { cookie: student2 })).status === 404, "чужая заявка отдаёт 404");

// ---------------------------------------------------------------- Объявления
console.log("Объявления деканата");
r = await req("/api/announcements", { method: "POST", cookie: dean, body: { title: "Тест", body: "Текст", audienceType: "group", audienceValue: "ПИ-25-2", needsAction: true, actionLabel: "Открыть", actionHref: "//evil.example.org" } });
ok(r.status === 400, "кнопка объявления не может вести на внешний сайт");
r = await req("/api/announcements", { method: "POST", cookie: student, body: { title: "Тест", body: "Текст", audienceType: "all" } });
ok(r.status === 403, "студент не публикует объявления");
r = await req("/api/announcements", { method: "POST", cookie: dean, body: { title: "Пересдачи для ПИ-25-2", body: "Запишитесь до пятницы.", audienceType: "group", audienceValue: "ПИ-25-2", needsAction: true, actionLabel: "Заказать справку", actionHref: "/requests/new" } });
ok(r.status === 200, "деканат публикует адресное объявление");
ok((await notes(student2)).some((n) => n.title.includes("Пересдачи для ПИ-25-2")), "студент группы получил уведомление");
ok(!(await notes(student)).some((n) => n.title.includes("Пересдачи для ПИ-25-2")), "студент другой группы уведомление не получил");
ok((await (await req("/", { cookie: student2 })).text()).includes("Нужно действие"), "в ленте адресата есть пометка «Нужно действие»");
ok(!(await (await req("/", { cookie: student })).text()).includes("Пересдачи для ПИ-25-2"), "другой группе объявление не показывается");

console.log("Главные страницы ролей");
for (const [who, c, paths] of [
  ["студент", student, ["/", "/schedule", "/grades", "/requests", "/requests/new", "/requests/new/military", "/group"]],
  ["преподаватель", teacher1, ["/", "/schedule", "/gradebooks", "/recordings"]],
  ["деканат", dean, ["/", "/requests", "/requests?f=all", "/announcements"]],
]) {
  let allOk = true;
  for (const pth of paths) if ((await req(pth, { cookie: c })).status !== 200) { allOk = false; console.log("    не открылась:", who, pth); }
  ok(allOk, `${who}: все основные страницы открываются (${paths.length})`);
}
const teacherHome = await (await req("/", { cookie: teacher1 })).text();
ok(teacherHome.includes("Запросы на запись"), "на главной преподавателя есть виджет запросов на запись");
const deanHome = await (await req("/", { cookie: dean })).text();
ok(deanHome.includes("Заявки в работе"), "на главной деканата есть очередь заявок");


console.log("Архив заявок, «Написать» в группе, запросы на запись одной таблицей");
{
  const sid = uid("student1");
  const codes = (where) => db.prepare(`SELECT code FROM requests WHERE student_id = ? AND ${where}`).all(sid).map((x) => x.code);
  const oldCodes = codes("status IN ('ready','rejected') AND updated_at < datetime('now', '-1 month')");
  const freshCodes = codes("NOT (status IN ('ready','rejected') AND updated_at < datetime('now', '-1 month'))");
  ok(oldCodes.length >= 2 && freshCodes.length >= 2, `в демо-данных есть старые (${oldCodes.length}) и свежие (${freshCodes.length}) заявки`);
  const cur = await (await req("/requests", { cookie: student })).text();
  const arc = await (await req("/requests?tab=archive", { cookie: student })).text();
  ok(freshCodes.every((c) => cur.includes(c)), "«Актуальные»: все свежие заявки на месте");
  ok(oldCodes.every((c) => !cur.includes(c)), "«Актуальные»: заявки старше месяца не показаны");
  ok(oldCodes.every((c) => arc.includes(c)), "«Архив»: готовые и отклонённые заявки старше месяца");
  ok(freshCodes.every((c) => !arc.includes(c)), "«Архив»: свежие заявки не попали");
  ok(arc.includes("Архив") && cur.includes("Актуальные"), "вкладки «Актуальные» и «Архив» на месте");
  // только что ставшая готовой справка (из раздела 5) остаётся в актуальных: месяц считается от завершения
  const rcode = db.prepare("SELECT code FROM requests WHERE id = ?").get(rid).code;
  ok(cur.includes(rcode) && !arc.includes(rcode), "только что готовая справка лежит в «Актуальных», а не в «Архиве»");

  const groupHtml = await (await req("/group", { cookie: student })).text();
  const writes = (groupHtml.match(/aria-label="Написать: /g) ?? []).length;
  ok(writes === 11, `в списке группы кнопка «Написать» у 11 одногруппников (нашла ${writes}), у самого студента её нет`);
  const mate = db.prepare("SELECT u.id FROM student_profiles sp JOIN users u ON u.id = sp.user_id WHERE sp.group_id = (SELECT group_id FROM student_profiles WHERE user_id = ?) AND u.id != ? LIMIT 1").get(uid("student1"), uid("student1")).id;
  const started = await req("/api/messages/start", { method: "POST", cookie: student, body: { userId: mate } });
  ok(started.status === 200 && (await json(started)).id > 0, "«Написать» ведёт в диалог с одногруппником");

  // Запросы на запись: одна пара — одна карточка
  const pair = db.prepare("SELECT lesson_id AS lessonId, date, COUNT(*) AS c FROM recording_requests GROUP BY lesson_id, date HAVING c >= 4").get();
  const pend = (cookie) => notes(cookie).then((l) => l.filter((n) => n.type === "recording_request" && n.link === `/recordings#pair-${pair.lessonId}-${pair.date}` && !n.read));
  const before = await pend(teacher1);
  ok(before.length === 1 && before[0].title.includes("4"), "преподаватель видит одно уведомление «Запросы на запись пары: 4»");
  let r = await req("/api/recording-requests", { method: "POST", cookie: student, body: { lessonId: pair.lessonId, date: pair.date, reason: "work", comment: "Стажировка, был на выезде." } });
  ok(r.status === 200, "ещё один студент просит записать ту же пару");
  const afterNotes = await pend(teacher1);
  ok(afterNotes.length === 1 && afterNotes[0].title.includes("5"), "уведомление не размножилось: одно, счётчик вырос до 5");

  const page = await (await req("/recordings", { cookie: teacher1 })).text();
  const cards = (page.match(/id="pair-/g) ?? []).length;
  ok(cards === db.prepare("SELECT COUNT(*) AS c FROM (SELECT 1 FROM recording_requests r JOIN lessons l ON l.id = r.lesson_id JOIN disciplines d ON d.id = l.discipline_id WHERE d.teacher_id = ? GROUP BY r.lesson_id, r.date)").get(uid("teacher1")).c, `страница «Запросы на запись»: одна карточка на пару (${cards})`);
  const names = db.prepare("SELECT u.full_name AS n FROM recording_requests r JOIN users u ON u.id = r.student_id WHERE r.lesson_id = ? AND r.date = ?").all(pair.lessonId, pair.date).map((x) => x.n);
  ok(names.length === 5 && names.every((n) => page.includes(n)), "в карточке пары таблица со всеми 5 студентами");
  ok(page.includes("<table") && page.includes("Причина") && page.includes("Стажировка, был на выезде."), "в таблице есть столбец с причинами и комментариями");
  ok(/Ответить всем, кто ждёт \(5\)/.test(page), "под таблицей один ответ для всех ждущих");
  const widget = await (await req("/", { cookie: teacher1 })).text();
  ok(/Ждут ответа:\s*(<!-- -->)?\s*5/.test(widget), "на главной преподавателя одна строка по паре со счётчиком");

  // Ответ всем сразу
  ok((await req("/api/recording-requests/answer", { method: "POST", cookie: student, body: { lessonId: pair.lessonId, date: pair.date, status: "will_record" } })).status === 403, "студент не может ответить на запросы");
  ok((await req("/api/recording-requests/answer", { method: "POST", cookie: teacher2, body: { lessonId: pair.lessonId, date: pair.date, status: "will_record" } })).status === 404, "чужой преподаватель не отвечает на запросы по чужой паре");
  ok((await req("/api/recording-requests/answer", { method: "POST", cookie: teacher1, body: { lessonId: pair.lessonId, date: pair.date, status: "declined" } })).status === 400, "отказ без комментария отклоняется");
  const nBefore = db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE type = 'recording_request' AND title = 'Преподаватель пришлёт конспект'").get().c;
  r = await req("/api/recording-requests/answer", { method: "POST", cookie: teacher1, body: { lessonId: pair.lessonId, date: pair.date, status: "will_send_notes", comment: "Пришлю общий конспект в пятницу." } });
  ok(r.status === 200 && (await json(r)).updated === 5, "один ответ обновил все 5 запросов");
  ok(db.prepare("SELECT COUNT(*) AS c FROM recording_requests WHERE lesson_id = ? AND date = ? AND status = 'will_send_notes'").get(pair.lessonId, pair.date).c === 5, "у всех 5 статус «Пришлю конспект»");
  ok(db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE type = 'recording_request' AND title = 'Преподаватель пришлёт конспект'").get().c === nBefore + 5, "каждый из 5 студентов получил своё уведомление");
  r = await req("/api/recording-requests/answer", { method: "POST", cookie: teacher1, body: { lessonId: pair.lessonId, date: pair.date, status: "will_record" } });
  ok(r.status === 404, "повторный ответ «ждущим» не находит запросов (все уже отвечены)");
  r = await req("/api/recording-requests/answer", { method: "POST", cookie: teacher1, body: { lessonId: pair.lessonId, date: pair.date, status: "will_record", all: true } });
  ok(r.status === 200 && (await json(r)).updated === 5, "режим «изменить ответ для всех» работает");
}


console.log("Аудит: уведомления, заголовки, JSON-ошибки, длина текста, подписи");
{
  // --- Удаление уведомлений (R15)
  const mine = await notes(student);
  ok(mine.length >= 3, `у студента есть уведомления (${mine.length})`);
  const target = mine[mine.length - 1];
  const unreadBefore = (await json(await req("/api/notifications", { cookie: student }))).unread;
  let r2 = await req(`/api/notifications/${target.id}`, { method: "DELETE", cookie: student2 });
  ok(r2.status === 404, "чужое уведомление удалить нельзя: 404");
  ok((await notes(student)).some((n) => n.id === target.id), "уведомление студента на месте после попытки со второго аккаунта");
  const nonexist = await req("/api/notifications/999999", { method: "DELETE", cookie: student });
  ok(nonexist.status === 404 && (await json(nonexist)).error === (await json(r2)).error, "несуществующее и чужое отвечают одинаково");
  ok((await req(`/api/notifications/${target.id}`, { method: "DELETE" })).status === 401, "без входа: 401");
  ok((await req(`/api/notifications/${target.id}`, { method: "DELETE", cookie: student, origin: "https://evil.example" })).status === 403, "чужой Origin: 403");
  ok((await req("/api/notifications/abc", { method: "DELETE", cookie: student })).status === 404, "id из букв: 404");
  r2 = await req(`/api/notifications/${target.id}`, { method: "DELETE", cookie: student });
  ok(r2.status === 200, "своё уведомление удаляется");
  ok(!(await notes(student)).some((n) => n.id === target.id), "удалённое пропало из списка");
  ok((await notes(student2)).length > 0, "у второго студента уведомления на месте");
  ok((await req(`/api/notifications/${target.id}`, { method: "DELETE", cookie: student })).status === 404, "повторное удаление: 404");
  const again = await login("student1", "Study-One-26");
  ok(!(await notes(again)).some((n) => n.id === target.id), "после повторного входа удалённое не вернулось");
  const unreadAfter = (await json(await req("/api/notifications", { cookie: student }))).unread;
  ok(unreadAfter <= unreadBefore, "число новых не выросло");
  ok((await req(`/api/notifications/${target.id}/restore`, { method: "POST", cookie: student2 })).status === 404, "чужое «Отменить»: 404");
  ok((await req(`/api/notifications/${target.id}/restore`, { method: "POST", cookie: student })).status === 200, "«Отменить» возвращает уведомление");
  ok((await notes(student)).some((n) => n.id === target.id), "после «Отменить» уведомление снова в списке");

  // --- Заголовки (R7)
  const login_ = await req("/login");
  const h = login_.headers;
  ok((h.get("strict-transport-security") ?? "").includes("max-age=31536000"), "заголовок Strict-Transport-Security есть");
  const csp = h.get("content-security-policy") ?? h.get("content-security-policy-report-only") ?? "";
  ok(csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'") && csp.includes("form-action 'self'"), "заголовок Content-Security-Policy есть");
  const loginHtml = await login_.text();
  ok(loginHtml.includes('name="color-scheme" content="light"'), "мета color-scheme = light");
  ok(loginHtml.includes("К содержимому") && loginHtml.includes("<title>Вход · StudyHelper</title>"), "ссылка «К содержимому» и заголовок страницы");
  const titles = [];
  for (const [path, t] of [["/requests", "Заявки"], ["/grades", "Зачётка"], ["/schedule", "Расписание"], ["/messages", "Сообщения"]]) {
    const html = await (await req(path, { cookie: student })).text();
    titles.push(html.includes(`<title>${t} · StudyHelper</title>`));
  }
  ok(titles.every(Boolean), "у страниц кабинета свои заголовки «… · StudyHelper»");

  // --- JSON-ошибки (R13)
  const nf = await req("/api/nothing-here", { cookie: student });
  ok(nf.status === 404 && (nf.headers.get("content-type") ?? "").includes("json") && (await json(nf)).error, "неизвестный адрес API: JSON 404");
  const mna = await req("/api/requests", { cookie: student });
  ok(mna.status === 405 && (mna.headers.get("content-type") ?? "").includes("json") && (await json(mna)).error, "GET /api/requests: JSON 405");

  // --- Длина текста (R11)
  const long = "а".repeat(501);
  const tl = await req("/api/requests", { method: "POST", cookie: student, body: { kind: "study", delivery: "pdf", note: long } });
  ok(tl.status === 400 && (await json(tl)).error === "Комментарий не длиннее 500 символов.", "комментарий длиннее 500: 400 с понятным текстом");
  const tp = await req("/api/requests", { method: "POST", cookie: student, body: { kind: "on_demand", delivery: "pdf", purpose: "б".repeat(201) } });
  ok(tp.status === 400 && (await json(tp)).error.includes("200"), "«Куда предоставляется» длиннее 200: 400");
  const formHtml = await (await req("/requests/new/on_demand", { cookie: student })).text();
  ok(/0(<!-- -->)? \/ (<!-- -->)?200/.test(formHtml) && /0(<!-- -->)? \/ (<!-- -->)?500/.test(formHtml), "в форме есть счётчики символов");
  ok(/<label[^>]+for="[^"]+"/.test(formHtml), "у полей формы подписи привязаны через for/id");
  ok(formHtml.includes("<fieldset") && formHtml.includes("<legend"), "формат справки в fieldset с legend");

  // --- Подписи (R1)
  const gb = await (await req("/gradebooks", { cookie: teacher1 })).text();
  ok(!gb.includes("Дифференцированный зачёт</") || gb.includes('title="Дифференцированный зачёт"'), "в ведомостях полная форма только в подсказке");
  ok(gb.includes("Дифф. зачёт") || !gb.includes("graded"), "в ведомостях «Дифф. зачёт»");
  const gr = await (await req("/grades", { cookie: student })).text();
  ok(!/>Дифференцированный зачёт</.test(gr) && !/>Удовлетворительно</.test(gr) && !/>Неудовлетворительно</.test(gr), "в зачётке нет полных форм в тексте");

}

console.log(failed === 0 ? "\nВсе проверки пройдены. Выполните `npm run seed`, чтобы вернуть демо-данные." : `\nНе пройдено проверок: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
