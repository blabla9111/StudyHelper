// Проверка разделения данных и защиты. Запуск: сначала `npm run dev` (или `npm start`), затем
//   npm run check:security            (адрес по умолчанию http://localhost:3000)
//   BASE_URL=https://example.ru npm run check:security
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

async function req(path, { method = "GET", body, cookie, origin = ORIGIN } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && origin) headers.origin = origin;
  return fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
}

async function login(loginName, password) {
  const res = await req("/api/auth/login", { method: "POST", body: { login: loginName, password } });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  return { res, cookie, setCookie };
}

const location = (res) => res.headers.get("location") ?? "";

console.log("Без входа");
{
  const r1 = await req("/api/notifications");
  ok(r1.status === 401, "GET /api/notifications без входа → 401");
  for (const p of ["/", "/profile", "/group", "/grades", "/schedule", "/requests"]) {
    const r = await req(p);
    ok([302, 303, 307, 308].includes(r.status) && location(r).includes("/login"), `GET ${p} без входа → редирект на /login`);
  }
  const r2 = await req("/api/notifications/read", { method: "POST", body: { all: true } });
  ok(r2.status === 401, "POST /api/notifications/read без входа → 401");
}

console.log("Вход");
const s1 = await login("student1", "Study-One-26");
const s2 = await login("student2", "Study-Two-26");
const t1 = await login("teacher1", "Teach-One-26");
const d1 = await login("dean1", "Dean-One-26");
ok(s1.res.status === 200 && s1.cookie.startsWith("sh_session="), "student1 входит, выдана сессия");
ok(/HttpOnly/i.test(s1.setCookie), "cookie сессии помечена HttpOnly");
ok(/SameSite=lax/i.test(s1.setCookie), "cookie сессии помечена SameSite=Lax");
{
  const bad = await login("student1", "неверный-пароль");
  ok(bad.res.status === 401, "неверный пароль → 401");
  const none = await login("нет-такого", "что-угодно");
  ok(none.res.status === 401, "несуществующий логин → 401 (тот же ответ)");
  const forged = await req("/api/notifications", { cookie: "sh_session=forged-token-123" });
  ok(forged.status === 401, "поддельная cookie → 401");
  const noOrigin = await req("/api/auth/login", { method: "POST", body: { login: "student1", password: "Study-One-26" }, origin: null });
  ok(noOrigin.status === 403, "POST без Origin отклоняется (защита от CSRF)");
  const evil = await req("/api/auth/login", { method: "POST", body: { login: "student1", password: "Study-One-26" }, origin: "https://evil.example" });
  ok(evil.status === 403, "POST с чужим Origin отклоняется");
}

console.log("Разделение данных");
const notifs = async (c) => (await (await req("/api/notifications", { cookie: c })).json());
const n1 = await notifs(s1.cookie);
const n2 = await notifs(s2.cookie);
ok(n1.items.length > 0 && n2.items.length > 0, "у обоих студентов есть уведомления");
const ids1 = new Set(n1.items.map((i) => i.id));
ok(n2.items.every((i) => !ids1.has(i.id)), "списки уведомлений студентов не пересекаются");

{
  // student1 пытается пометить прочитанными уведомления student2
  const before = n2.unread;
  const foreign = n2.items.filter((i) => !i.read).map((i) => i.id);
  const r = await req("/api/notifications/read", { method: "POST", cookie: s1.cookie, body: { ids: foreign } });
  const after = (await notifs(s2.cookie)).unread;
  ok(r.status === 200 && after === before, "чужие уведомления нельзя пометить прочитанными");
  const bad = await req("/api/notifications/read", { method: "POST", cookie: s1.cookie, body: { ids: ["1; DROP TABLE users"] } });
  ok(bad.status === 400, "некорректные id отклоняются");
}

{
  const html1 = await (await req("/group", { cookie: s1.cookie })).text();
  const html2 = await (await req("/group", { cookie: s2.cookie })).text();
  ok(html1.includes("ПИ-24-1") && html1.includes("Баранова Софья"), "student1 видит свою группу ПИ-24-1");
  ok(!html1.includes("ПИ-25-2") && !html1.includes("Миронов Егор"), "student1 не видит группу ПИ-25-2");
  ok(html2.includes("ПИ-25-2") && html2.includes("Миронов Егор"), "student2 видит свою группу ПИ-25-2");
  ok(!html2.includes("ПИ-24-1") && !html2.includes("Баранова Софья"), "student2 не видит группу ПИ-24-1");
  ok(!/2024-0137|2025-0418/.test(html1 + html2), "в списках группы нет номеров зачёток");

  const p1 = await (await req("/profile", { cookie: s1.cookie })).text();
  ok(p1.includes("Лисицына Арина") && !p1.includes("Громов Тимур"), "профиль показывает только данные владельца");
}

console.log("Доступ по ролям");
{
  const r = async (path, cookie) => {
    const res = await req(path, { cookie });
    return [302, 303, 307, 308].includes(res.status) ? `redirect:${location(res)}` : res.status;
  };
  ok((await r("/gradebooks", s1.cookie)).toString().startsWith("redirect:"), "студент не открывает ведомости преподавателя");
  ok((await r("/grades", t1.cookie)).toString().startsWith("redirect:"), "преподаватель не открывает зачётку студента");
  ok((await r("/group", t1.cookie)).toString().startsWith("redirect:"), "преподаватель не открывает список группы студента");
  ok((await r("/announcements", s1.cookie)).toString().startsWith("redirect:"), "студент не открывает раздел сотрудника");
  ok((await r("/announcements", d1.cookie)) === 200, "сотрудник деканата открывает свой раздел");
}

console.log("Расписание, зачётка, ведомости");
{
  const iso = (d) => d.toISOString().slice(0, 10);
  const from = iso(new Date());
  const to = iso(new Date(Date.now() + 14 * 86400000));
  const sched = async (c) => (await (await req(`/api/schedule?from=${from}&to=${to}`, { cookie: c })).json()).occurrences ?? [];
  const subjects = (list) => new Set(list.map((o) => o.subject));

  const o1 = await sched(s1.cookie);
  const o2 = await sched(s2.cookie);
  const ot1 = await sched(t1.cookie);
  const t2 = await login("teacher2", "Teach-Two-26");
  const ot2 = await sched(t2.cookie);
  ok(o1.length > 0 && o2.length > 0, "у студентов есть занятия");
  ok(subjects(o1).has("Базы данных") && !subjects(o1).has("Дискретная математика"), "student1 видит расписание только своей группы");
  ok(subjects(o2).has("Дискретная математика") && !subjects(o2).has("Базы данных"), "student2 видит расписание только своей группы");
  ok(subjects(ot1).has("Базы данных") && !subjects(ot1).has("Дискретная математика"), "teacher1 видит только свои занятия");
  ok(subjects(ot2).has("Дискретная математика") && !subjects(ot2).has("Базы данных"), "teacher2 видит только свои занятия");
  ok((await req("/api/schedule?from=bad&to=bad", { cookie: s1.cookie })).status === 400, "некорректный период расписания → 400");
  ok((await req("/api/schedule?from=2026-01-01&to=2027-12-31", { cookie: s1.cookie })).status === 400, "слишком большой период → 400");
  ok((await req(`/api/schedule?from=${from}&to=${to}`)).status === 401, "расписание без входа → 401");

  // Новые функции: «Мой день», карточка пары, справки
  const postPaths = [
    "/api/lessons/format", "/api/lessons/materials", "/api/lessons/recording", "/api/deadlines", "/api/deadlines/done",
    "/api/recording-requests", "/api/recording-requests/answer", "/api/requests", "/api/requests/status",
    "/api/requests/reject", "/api/announcements",
  ];
  let unauthOk = true, originOk = true;
  for (const pth of postPaths) {
    if ((await req(pth, { method: "POST", body: {} })).status !== 401) unauthOk = false;
    if ((await req(pth, { method: "POST", body: {}, cookie: t1.cookie, origin: "https://evil.example" })).status !== 403) originOk = false;
  }
  ok(unauthOk, `все ${postPaths.length} новых изменяющих запросов без входа → 401`);
  {
    const old = await req("/api/requests/advance", { method: "POST", body: { id: 1 }, cookie: s1.cookie });
    ok(old.status === 404 || old.status === 405, "старый адрес «Ускорить статус» убран (404/405)");
  }
  ok(originOk, "все новые изменяющие запросы с чужого Origin → 403");
  ok((await req("/api/lessons/detail?lessonId=1&date=2026-11-17")).status === 401, "карточка пары без входа → 401");
  ok((await req("/api/materials/1/download")).status === 401, "материал без входа → 401");
  ok((await req("/api/requests/1/pdf")).status === 401, "PDF справки без входа → 401");
  ok((await req("/api/schedule/ics?lessonId=1&date=2026-11-17")).status === 401, ".ics без входа → 401");
  ok((await req("/api/requests/1/pdf", { cookie: s2.cookie })).status === 404, "PDF чужой справки → 404");
  ok((await req("/requests/1", { cookie: s2.cookie })).status === 404, "страница чужой заявки → 404");
  ok((await req("/api/recording-requests", { method: "POST", cookie: t1.cookie, body: {} })).status === 403, "преподаватель не создаёт запросы на запись");
  ok((await req("/api/deadlines", { method: "POST", cookie: s1.cookie, body: {} })).status === 403, "студент не создаёт дедлайны");
  ok((await req("/recordings", { cookie: s1.cookie })).status === 307, "студента не пускают на экран «Запросы на запись»");
  ok((await req("/recordings")).status === 307, "экран «Запросы на запись» без входа → редирект на вход");
  const pubVerify = await req("/verify/0000000000000000");
  ok(pubVerify.status === 200, "страница проверки справки открыта без входа");
  ok((pubVerify.headers.get("x-frame-options") ?? "").length > 0, "у страницы проверки есть защитные заголовки");

  const lessonOfT1 = ot1[0].lessonId;
  const change = (c, body) => req("/api/schedule/changes", { method: "POST", cookie: c, body });
  ok((await change(s1.cookie, { lessonId: lessonOfT1, date: ot1[0].date, action: "cancel" })).status === 403, "студент не может отменять пары");
  ok((await change(t2.cookie, { lessonId: lessonOfT1, date: ot1[0].date, action: "cancel" })).status === 404, "преподаватель не может менять чужие пары");
  ok((await change(t1.cookie, { lessonId: lessonOfT1, date: "2020-01-06", action: "cancel" })).status === 400, "нельзя менять занятия в прошлом или в несуществующую дату");

  const idsFrom = async (c) => {
    const html = await (await req("/gradebooks?status=all", { cookie: c })).text();
    return [...new Set([...html.matchAll(/\/gradebooks\/(\d+)/g)].map((m) => m[1]))];
  };
  const g1 = await idsFrom(t1.cookie);
  const g2 = await idsFrom(t2.cookie);
  ok(g1.length > 0 && g2.length > 0 && g1.every((id) => !g2.includes(id)), "у преподавателей разные списки ведомостей");
  ok((await req(`/gradebooks/${g1[0]}`, { cookie: t2.cookie })).status === 404, "чужая ведомость не открывается (404)");
  for (const sub of ["", "/close", "/reopen"]) {
    const r = await req(`/api/gradebooks/${g1[0]}${sub}`, { method: "POST", cookie: t2.cookie, body: { rows: [] } });
    ok(r.status === 404, `POST /api/gradebooks/<чужая>${sub} → 404`);
    const r2 = await req(`/api/gradebooks/${g1[0]}${sub}`, { method: "POST", cookie: s1.cookie, body: { rows: [] } });
    ok(r2.status === 403, `студент: POST /api/gradebooks${sub} → 403`);
  }
  ok((await req(`/gradebooks/${g1[0]}`, { cookie: s1.cookie })).status !== 200, "студент не открывает страницу ведомости");

  const gr1 = await (await req("/grades", { cookie: s1.cookie })).text();
  const gr2 = await (await req("/grades", { cookie: s2.cookie })).text();
  ok(gr1.includes("Базы данных") && !gr1.includes("Дискретная математика"), "зачётка student1 содержит только дисциплины его группы");
  ok(gr2.includes("Дискретная математика") && !gr2.includes("Базы данных"), "зачётка student2 содержит только дисциплины его группы");
}

console.log("Сообщения: доступы и запреты");
{
  const uid = (l) => db.prepare("SELECT id FROM users WHERE login = ?").get(l).id;
  const groupChat = (name) => db.prepare("SELECT c.id FROM conversations c JOIN groups g ON g.id = c.group_id WHERE g.name = ?").get(name).id;
  const direct = (a, b) => db.prepare("SELECT id FROM conversations WHERE pair_key = ?").get(`${Math.min(uid(a), uid(b))}-${Math.max(uid(a), uid(b))}`).id;
  const chat1 = groupChat("ПИ-24-1");
  const chat2 = groupChat("ПИ-25-2");
  const s1t1 = direct("student1", "teacher1");
  const dean2 = direct("dean1", "student2");
  const outsider = uid("s26-01"); // студент группы ИБ-25-1: у демо-преподавателей и студентов там нет общих дисциплин и групп
  const post = (p, cookie, body, origin) => req(p, { method: "POST", cookie, body, origin });

  for (const [m, p] of [["GET", "/api/messages"], ["GET", "/api/messages/unread"], ["GET", "/api/messages/recipients"], ["GET", `/api/messages/${s1t1}`], ["POST", `/api/messages/${s1t1}`], ["POST", `/api/messages/${s1t1}/read`], ["POST", "/api/messages/start"], ["POST", "/api/messages/delete"], ["GET", "/api/messages/broadcast"], ["POST", "/api/messages/broadcast"]]) {
    const r = await req(p, { method: m, body: m === "POST" ? {} : undefined });
    ok(r.status === 401, `${m} ${p.replace(String(s1t1), "<id>")} без входа → 401`);
  }
  ok([302, 303, 307, 308].includes((await req("/messages")).status), "страница /messages без входа → редирект");
  ok([302, 303, 307, 308].includes((await req(`/messages/${s1t1}`)).status), "страница диалога без входа → редирект");

  // Чужие диалоги: чат группы ПИ-24-1 не открывается ни студентом другой группы, ни преподавателем, ни деканатом
  for (const [who, c] of [["студент другой группы", s2.cookie], ["преподаватель", t1.cookie], ["деканат", d1.cookie]]) {
    ok((await req(`/api/messages/${chat1}`, { cookie: c })).status === 404, `${who}: GET чат группы ПИ-24-1 → 404`);
    ok((await post(`/api/messages/${chat1}`, c, { body: "тест" })).status === 404, `${who}: отправка в чат группы → 404`);
    ok((await post(`/api/messages/${chat1}/read`, c, {})).status === 404, `${who}: «прочитано» в чате группы → 404`);
    ok((await req(`/messages/${chat1}`, { cookie: c })).status === 404, `${who}: страница чата группы → 404`);
  }
  ok((await req(`/api/messages/${chat2}`, { cookie: s1.cookie })).status === 404, "student1 не читает чат группы ПИ-25-2");
  ok((await req(`/api/messages/${s1t1}`, { cookie: s2.cookie })).status === 404, "student2 не читает личный диалог student1 и преподавателя");
  ok((await post(`/api/messages/${s1t1}`, s2.cookie, { body: "тест" })).status === 404, "student2 не пишет в чужой личный диалог");
  ok((await req(`/api/messages/${dean2}`, { cookie: s1.cookie })).status === 404, "student1 не читает диалог деканата и student2");
  ok((await req(`/api/messages/${dean2}`, { cookie: t1.cookie })).status === 404, "преподаватель не читает диалог деканата и студента");
  ok((await req("/api/messages/abc", { cookie: s1.cookie })).status === 404, "нечисловой id диалога → 404");
  ok((await req("/api/messages/999999", { cookie: s1.cookie })).status === 404, "несуществующий диалог → 404");
  {
    const mid = db.prepare("SELECT id FROM messages WHERE conversation_id = ? AND author_id = ? LIMIT 1").get(s1t1, uid("teacher1")).id;
    ok((await post("/api/messages/delete", s2.cookie, { messageId: mid })).status === 404, "чужое сообщение нельзя удалить (404)");
    ok((await post("/api/messages/delete", s1.cookie, { messageId: mid })).status === 403, "чужое сообщение в своём диалоге нельзя удалить (403)");
  }

  // Запрещённые пары: ответ одинаковый для «нельзя» и «не существует»
  const bodies = [];
  for (const [who, c, target] of [
    ["student1 → student2 (другая группа)", s1.cookie, uid("student2")],
    ["student1 → студент другой группы", s1.cookie, outsider],
    ["student1 → деканат первым", s1.cookie, uid("dean1")],
    ["student1 → несуществующий пользователь", s1.cookie, 987654],
    ["student1 → сам себе", s1.cookie, uid("student1")],
    ["teacher1 → студент чужой группы", t1.cookie, outsider],
    ["teacher1 → сам себе", t1.cookie, uid("teacher1")],
    ["деканат → сам себе", d1.cookie, uid("dean1")],
  ]) {
    const r = await post("/api/messages/start", c, { userId: target });
    ok(r.status === 404, `${who}: запрещено (404)`);
    bodies.push(await r.text());
  }
  ok(new Set(bodies).size === 1, "ответы на запрещённую пару и несуществующий id одинаковы (нельзя выяснить, кто есть в системе)");
  for (const bad of [undefined, "abc", -1, 0, 1.5, null]) {
    ok((await post("/api/messages/start", s1.cookie, { userId: bad })).status === 404, `userId=${JSON.stringify(bad)} → 404`);
  }
  ok(!db.prepare("SELECT 1 FROM conversations WHERE pair_key = ?").get(`${Math.min(uid("student1"), uid("student2"))}-${Math.max(uid("student1"), uid("student2"))}`), "запрещённый диалог в базе не создан");

  // В списке адресатов только разрешённые
  {
    const ids = (j) => j.blocks.flatMap((b) => b.items.map((i) => i.id));
    const r1 = ids(await (await req("/api/messages/recipients", { cookie: s1.cookie })).json());
    ok(!r1.includes(uid("student2")) && !r1.includes(uid("dean1")) && !r1.includes(outsider) && r1.includes(uid("teacher1")), "список адресатов студента: свои преподаватели и одногруппники, без деканата и чужих групп");
    const r2 = ids(await (await req("/api/messages/recipients?q=" + encodeURIComponent("Орлов"), { cookie: t1.cookie })).json());
    ok(!r2.includes(outsider), "список адресатов преподавателя не содержит студентов чужих групп");
    const r3 = ids(await (await req("/api/messages/recipients?q=" + encodeURIComponent("Орлов"), { cookie: d1.cookie })).json());
    ok(r3.includes(outsider), "деканат находит любого студента");
  }

  // Преподаватели и деканат переписываются свободно, но чужие диалоги закрыты
  const t1dean = direct("teacher1", "dean1");
  const t1t2 = direct("teacher1", "teacher2");
  const t2 = (await login("teacher2", "Teach-Two-26")).cookie;
  ok((await req(`/api/messages/${t1dean}`, { cookie: t2 })).status === 404, "teacher2 не читает диалог teacher1 и деканата");
  ok((await req(`/api/messages/${t1t2}`, { cookie: d1.cookie })).status === 404, "деканат не читает диалог двух преподавателей");
  ok((await req(`/api/messages/${t1t2}`, { cookie: s1.cookie })).status === 404, "студент не читает диалог двух преподавателей");
  ok((await post(`/api/messages/${t1t2}`, s1.cookie, { body: "тест" })).status === 404, "студент не пишет в диалог двух преподавателей");

  // CSRF
  ok((await post("/api/messages/start", s1.cookie, { userId: uid("teacher1") }, "https://evil.example")).status === 403, "start с чужим Origin → 403");
  ok((await post(`/api/messages/${s1t1}`, s1.cookie, { body: "тест" }, null)).status === 403, "отправка без Origin → 403");
  ok((await post(`/api/messages/${s1t1}/read`, s1.cookie, {}, "https://evil.example")).status === 403, "«прочитано» с чужим Origin → 403");
  ok((await post("/api/messages/broadcast", t1.cookie, { groupIds: [1], body: "x" }, "https://evil.example")).status === 403, "рассылка с чужим Origin → 403");

  // Рассылка: только преподаватель и только свои группы
  const g3 = db.prepare("SELECT id FROM groups WHERE name = 'ИБ-25-1'").get().id;
  const g1id = db.prepare("SELECT id FROM groups WHERE name = 'ПИ-24-1'").get().id;
  ok((await post("/api/messages/broadcast", s1.cookie, { groupIds: [g1id], body: "x" })).status === 403, "студент не делает рассылку (403)");
  ok((await post("/api/messages/broadcast", d1.cookie, { groupIds: [g1id], body: "x" })).status === 403, "деканат не делает рассылку (403)");
  ok((await req("/api/messages/broadcast", { cookie: s1.cookie })).status === 403, "студент не видит историю рассылок (403)");
  const before = db.prepare("SELECT COUNT(*) AS c FROM broadcasts").get().c;
  ok((await post("/api/messages/broadcast", t1.cookie, { groupIds: [g3], body: "тест" })).status === 403, "рассылка в группу без дисциплин преподавателя → 403");
  ok((await post("/api/messages/broadcast", t1.cookie, { groupIds: [g1id, g3], body: "тест" })).status === 403, "рассылка со смесью своей и чужой группы → 403, ничего не уходит");
  ok((await post("/api/messages/broadcast", t1.cookie, { groupIds: [], body: "тест" })).status === 400, "рассылка без групп → 400");
  ok((await post("/api/messages/broadcast", t1.cookie, { groupIds: [g1id], body: "   " })).status === 400, "рассылка с пустым текстом → 400");
  ok(db.prepare("SELECT COUNT(*) AS c FROM broadcasts").get().c === before, "неудачные рассылки в базе не сохранились");
}

console.log("Выход");
{
  const out = await req("/api/auth/logout", { method: "POST", cookie: d1.cookie });
  ok(out.status === 200, "выход выполняется");
  const after = await req("/api/notifications", { cookie: d1.cookie });
  ok(after.status === 401, "после выхода старая cookie больше не работает");
}

console.log("Ограничение попыток входа");
{
  const name = `bruteforce-${Date.now()}`;
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await login(name, "неверный")).res.status;
  ok(last === 429, "после 5 неудачных попыток вход временно блокируется (429)");
}

console.log("Вход: лимит на пару «логин + адрес», адрес клиента, потолок на логин");
{
  const loginFrom = (name, pwd, xff) =>
    fetch(BASE + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, ...(xff ? { "x-forwarded-for": xff } : {}) },
      body: JSON.stringify({ login: name, password: pwd }),
    });
  const A = "203.0.113.10";
  const B = "203.0.113.11";
  let last = 0;
  for (let i = 0; i < 5; i++) last = (await loginFrom("student2", "неверный", A)).status;
  ok(last === 401, "пять неудач с одного адреса ещё отвечают 401");
  const blocked = await loginFrom("student2", "Study-Two-26", A);
  ok(blocked.status === 429 && Number(blocked.headers.get("retry-after")) > 0, "шестая попытка с того же адреса → 429 с Retry-After, даже с верным паролем");
  ok((await loginFrom("student2", "Study-Two-26", B)).status === 200, "владелец с другого адреса входит: чужие неудачи его не блокируют");
  const spoofed = await loginFrom("student2", "Study-Two-26", `1.2.3.4, ${A}`);
  ok(spoofed.status === 429, "подделанное начало X-Forwarded-For не помогает обойти лимит: берётся адрес с конца цепочки");

  const soft = `soft-${Date.now()}`;
  let softLast = 0;
  for (let i = 1; i <= 31; i++) softLast = (await loginFrom(soft, "неверный", `198.51.100.${i}`)).status;
  ok(softLast === 429, "30 неудач по одному логину с разных адресов включают мягкий потолок (429)");
}

console.log("Ограничение размера тела запроса");
{
  const big = "x".repeat(1_000_000);
  const r1 = await req("/api/auth/login", { method: "POST", body: { login: "a", password: big } });
  ok(r1.status === 413, "1 МБ на /api/auth/login → 413");
  const r2 = await req("/api/requests", { method: "POST", cookie: s1.cookie, body: { kind: "x", comment: big } });
  ok(r2.status === 413, "1 МБ на /api/requests → 413");
  const r3 = await req("/api/notifications/read", { method: "POST", cookie: s1.cookie, body: { all: true, pad: big } });
  ok(r3.status === 413, "1 МБ на /api/notifications/read → 413");
  const r4 = await req("/api/requests", { method: "POST", cookie: s1.cookie, body: { kind: "x" } });
  ok(r4.status !== 413, "обычный маленький запрос не режется");
}

console.log("Origin привязан к PUBLIC_BASE_URL");
if (process.env.PUBLIC_BASE_URL) {
  const mk = (origin, extra) => fetch(BASE + "/api/notifications/read", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: s1.cookie, origin, ...extra },
    body: JSON.stringify({ all: true }),
  });
  ok((await mk("http://evil.example", { "x-forwarded-host": "evil.example" })).status === 403, "чужой Origin вместе с поддельным X-Forwarded-Host → 403");
  ok((await mk(ORIGIN, { "x-forwarded-host": "evil.example" })).status === 200, "заголовок X-Forwarded-Host не меняет ожидаемый адрес");
} else {
  console.log("  – пропущено: PUBLIC_BASE_URL не задан");
}

if (process.env.EXPECT_SECURE_COOKIE) {
  const want = process.env.EXPECT_SECURE_COOKIE === "1";
  const c = await login("student1", "Study-One-26");
  ok(/;\s*Secure/i.test(c.setCookie) === want, want ? "cookie сессии помечена Secure" : "cookie сессии без Secure (как и задано)");
}

console.log("Защита от прототипных ключей");
{
  const t = await login("teacher1", "Teach-One-26");
  for (const status of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    const r = await req("/api/recording-requests/answer", { method: "POST", cookie: t.cookie, body: { id: 1, status } });
    ok(r.status === 400, `ответ на запись со статусом «${status}» → 400`);
  }
  // настоящая пара группы student1 и ближайшая дата, на которую она выпадает
  const DAY = 86_400_000;
  const utc = (d) => Date.parse(d + "T00:00:00Z");
  const isoD = (ms) => new Date(ms).toISOString().slice(0, 10);
  const wd = (d) => ((new Date(utc(d)).getUTCDay() + 6) % 7) + 1;
  const par = (d) => (Math.floor((utc(d) - utc("2026-09-07") - (wd(d) - 1) * DAY) / (7 * DAY)) % 2 === 0 ? "odd" : "even");
  const todayMsk = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());
  const lec = db.prepare("SELECT l.id, l.weekday, l.parity FROM lessons l JOIN disciplines d ON d.id = l.discipline_id WHERE d.id = 3 LIMIT 1").get();
  let lecDate = null;
  for (let i = 1; i <= 21 && !lecDate; i++) {
    const d = isoD(utc(todayMsk) + i * DAY);
    if (wd(d) === lec.weekday && (lec.parity === "all" || lec.parity === par(d))) lecDate = d;
  }
  const r2 = await req("/api/recording-requests", { method: "POST", cookie: s1.cookie, body: { lessonId: lec.id, date: lecDate, reason: "constructor" } });
  ok(r2.status === 400, "причина «constructor» в запросе на запись → 400");
}

console.log("Лимиты на дорогие действия и поиск адресатов");
{
  // пока не получим 429; потолок 30 в минуту (поиск адресатов 60)
  const burst = async (fn, cap) => {
    let n = 0;
    let res;
    do {
      res = await fn();
      n++;
    } while (res.status !== 429 && n < cap);
    return { n, res };
  };
  const u = await login("student2", "Study-Two-26");
  const w = await login("student1", "Study-One-26");
  const rq = await burst(() => req("/api/requests", { method: "POST", cookie: u.cookie, body: {} }), 45);
  ok(rq.res.status === 429 && rq.n <= 31 && rq.n > 15 && Number(rq.res.headers.get("retry-after")) > 0, `POST /api/requests: 429 с Retry-After после ${rq.n - 1} запросов`);
  const other = await req("/api/requests", { method: "POST", cookie: w.cookie, body: {} });
  ok(other.status !== 429, "лимит личный: другой студент не затронут");
  const rr = await burst(() => req("/api/recording-requests", { method: "POST", cookie: u.cookie, body: {} }), 45);
  ok(rr.res.status === 429 && rr.n <= 31, `POST /api/recording-requests: 429 после ${rr.n - 1} запросов`);
  const pdf = await burst(() => req("/api/requests/999999/pdf", { cookie: u.cookie }), 45);
  ok(pdf.res.status === 429 && pdf.n <= 31, `GET /api/requests/<id>/pdf: 429 после ${pdf.n - 1} запросов`);
  const rc = await burst(() => req("/api/messages/recipients?q=", { cookie: u.cookie }), 80);
  ok(rc.res.status === 429 && rc.n <= 61 && rc.n > 20, `GET /api/messages/recipients: 429 после ${rc.n - 1} запросов`);

  const d = await login("dean1", "Dean-One-26");
  const names = (await (await req("/api/messages/recipients?q=", { cookie: d.cookie })).json());
  const students = (b) => b.blocks.find((x) => x.title === "Студенты")?.items ?? [];
  ok(students(names).length === 0 && typeof names.note === "string", "деканат без запроса не получает список студентов, только подсказку");
  ok(students(await (await req("/api/messages/recipients?q=%D0%B0", { cookie: d.cookie })).json()).length === 0, "один символ в поиске студента → пусто");
  const full = db.prepare("SELECT full_name AS n FROM users WHERE login = 's24-01'").get().n;
  const found = students(await (await req(`/api/messages/recipients?q=${encodeURIComponent(full.slice(0, 3))}`, { cookie: d.cookie })).json());
  ok(found.length > 0 && found.length <= 30, "два-три символа фамилии находят студентов (не больше 30)");
}

console.log("Журнал: открытие ведомости и правка баллов");
{
  const t = await login("teacher1", "Teach-One-26");
  const d = await login("dean1", "Dean-One-26");
  const obj = "discipline:6"; // «Операционные системы», закрыта в сиде
  const count = (action) => db.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE object = ? AND action = ?").get(obj, action).c;
  const before = count("gradebook_reopen");
  const re = await req("/api/gradebooks/6/reopen", { method: "POST", cookie: t.cookie, body: {} });
  ok(re.status === 200, "преподаватель открывает свою закрытую ведомость");
  const ev = db.prepare("SELECT user_id, details FROM audit_log WHERE object = ? AND action = 'gradebook_reopen' ORDER BY id DESC LIMIT 1").get(obj);
  ok(count("gradebook_reopen") === before + 1 && ev.user_id === 3 && JSON.parse(ev.details).rows.length > 0, "в журнале запись об открытии с прежними баллами");
  ok(((await notifs(d.cookie)).items ?? []).some((n) => n.title === "Ведомость открыта для правок"), "деканат получил уведомление об открытии");

  const rows = db
    .prepare("SELECT u.id, gr.kt1, gr.kt2, gr.exam FROM student_profiles sp JOIN users u ON u.id = sp.user_id LEFT JOIN grades gr ON gr.discipline_id = 6 AND gr.student_id = u.id WHERE sp.group_id = (SELECT group_id FROM disciplines WHERE id = 6)")
    .all();
  const payload = rows.map((r) => ({ studentId: r.id, kt1: r.kt1, kt2: r.kt2, exam: r.exam }));
  const same = await req("/api/gradebooks/6", { method: "POST", cookie: t.cookie, body: { rows: payload } });
  ok(same.status === 200 && count("grades_changed_after_reopen") === 0, "сохранение без изменений в журнал не пишет");
  const changed = payload.map((r, i) => (i === 0 ? { ...r, kt1: r.kt1 === 10 ? 9 : 10 } : r));
  const save = await req("/api/gradebooks/6", { method: "POST", cookie: t.cookie, body: { rows: changed } });
  ok(save.status === 200, "правка балла после открытия сохраняется");
  const ch = db.prepare("SELECT details FROM audit_log WHERE object = ? AND action = 'grades_changed_after_reopen' ORDER BY id DESC LIMIT 1").get(obj);
  const det = ch ? JSON.parse(ch.details).changes : [];
  ok(det.length === 1 && det[0].old?.kt1 === payload[0].kt1 && det[0].new.kt1 === changed[0].kt1, "в журнале старое и новое значение изменённой строки");
  // вернуть как было и закрыть снова
  await req("/api/gradebooks/6", { method: "POST", cookie: t.cookie, body: { rows: payload } });
  ok((await req("/api/gradebooks/6/close", { method: "POST", cookie: t.cookie, body: {} })).status === 200, "ведомость закрывается снова");
  ok(count("gradebook_close") >= 1, "закрытие тоже записано в журнал");
  ok((await req("/api/gradebooks/6", { method: "POST", cookie: t.cookie, body: { rows: changed } })).status === 409, "в закрытую ведомость баллы не сохраняются");
  ok((await req("/api/gradebooks/6/reopen", { method: "POST", cookie: s1.cookie, body: {} })).status === 403, "студент не может открыть ведомость (403)");
}

console.log(failed === 0 ? "\nВсе проверки пройдены." : `\nПровалено проверок: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
