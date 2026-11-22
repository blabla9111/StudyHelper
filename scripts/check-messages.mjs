// Сквозная проверка раздела «Сообщения»: диалоги, чат группы, рассылка, уведомления, непрочитанные, лимиты.
// Сайт должен быть запущен. ВНИМАНИЕ: скрипт меняет демо-данные, после него выполните `npm run seed`.
// Лимиты (20 сообщений в минуту, 5 рассылок в час) хранятся в памяти сервера, поэтому для повторного запуска
// перезапустите сайт.
//   npm run check:messages
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
  const headers = {};
  if (method !== "GET") headers.origin = ORIGIN;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
}
async function login(l, p) {
  const r = await req("/api/auth/login", { method: "POST", body: { login: l, password: p } });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
const json = async (r) => r.json().catch(() => ({}));
const get = async (p, cookie) => json(await req(p, { cookie }));
const post = (p, cookie, body) => req(p, { method: "POST", cookie, body });

const uid = (l) => db.prepare("SELECT id FROM users WHERE login = ?").get(l).id;
const pairKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
const directId = (a, b) => db.prepare("SELECT id FROM conversations WHERE pair_key = ?").get(pairKey(uid(a), uid(b)))?.id;
const groupChat = (name) => db.prepare("SELECT c.id FROM conversations c JOIN groups g ON g.id = c.group_id WHERE g.name = ?").get(name).id;
const g1 = db.prepare("SELECT id FROM groups WHERE name = 'ПИ-24-1'").get().id;

const student = await login("student1", "Study-One-26");
const student2 = await login("student2", "Study-Two-26");
const teacher = await login("teacher1", "Teach-One-26");
const dean = await login("dean1", "Dean-One-26");
const unread = async (c) => (await get("/api/messages/unread", c)).unread;
const notes = async (c) => (await get("/api/notifications", c)).items;

console.log("1. Список диалогов и непрочитанные");
const chat1 = groupChat("ПИ-24-1");
const t1 = directId("student1", "teacher1");
{
  const list = await get("/api/messages", student);
  ok(list.items[0]?.type === "group" && list.items[0].pinned && list.items[0].id === chat1, "чат группы закреплён первым");
  ok(list.items.length === 3, "у student1: чат группы и два диалога");
  ok(list.items[0].unread === 2 && list.items.find((i) => i.id === t1)?.unread === 1, "непрочитанные: 2 в чате группы и 1 у преподавателя");
  ok(list.unread === 3 && (await unread(student)) === 3, "общий счётчик для значка в меню равен 3");
  ok((await get("/api/messages", teacher)).items.every((i) => i.type === "direct"), "у преподавателя нет чата группы");
  const r = await post(`/api/messages/${t1}/read`, student, {});
  ok(r.status === 200 && (await json(r)).unread === 2, "после открытия диалога его счётчик сбрасывается (общий стал 2)");
  ok((await unread(student)) === 2, "значок в меню обновился");
  await post(`/api/messages/${chat1}/read`, student, {});
  ok((await unread(student)) === 0, "после чата группы непрочитанных нет");
  ok((await get("/api/messages", teacher)).items.some((i) => i.title.startsWith("Баранова") && i.unread === 1), "у преподавателя виден ответ студентки, а свои рассылки без ответов в списке не показаны");
  ok((await get("/api/messages", teacher)).items.length === 4, "в списке преподавателя 4 диалога (студенты с ответами, деканат, коллега), а не все 12 копий рассылки");
}

console.log("2. Студент ↔ преподаватель, уведомления, троттлинг");
{
  const before = (await notes(teacher)).filter((n) => n.link === `/messages/${t1}`).length;
  let r = await post(`/api/messages/${t1}`, student, { body: "Спасибо! Схему пришлю в среду." });
  ok(r.status === 200, "студент отправляет сообщение преподавателю");
  r = await post(`/api/messages/${t1}`, student, { body: "И ещё вопрос: запросы тоже прикладывать?" });
  ok(r.status === 200, "второе сообщение подряд отправлено");
  const after = (await notes(teacher)).filter((n) => n.link === `/messages/${t1}` && n.type === "message");
  ok(after.length === before + 1, "преподаватель получил одно уведомление на два сообщения (не чаще раза в 10 минут)");
  ok(after[0]?.title.startsWith("Сообщение от Лисицына"), "уведомление назвало отправителя");
  ok((await unread(teacher)) >= 4, "у преподавателя вырос счётчик непрочитанных");
  const view = await get(`/api/messages/${t1}`, teacher);
  ok(view.messages.at(-1).body.startsWith("И ещё вопрос"), "преподаватель видит новые сообщения");
  ok(view.conversation.title.startsWith("Лисицына") && view.conversation.canSend === true, "шапка диалога: имя собеседника и можно писать");
  const n0 = (await notes(student)).filter((n) => n.link === `/messages/${t1}`).length;
  r = await post(`/api/messages/${t1}`, teacher, { body: "Да, запросы тоже прикладывайте." });
  ok(r.status === 200, "преподаватель отвечает");
  ok((await notes(student)).filter((n) => n.link === `/messages/${t1}`).length === n0 + 1, "студент получил уведомление об ответе");
  ok((await unread(student)) === 1, "у студента появилось новое непрочитанное");
  ok((await get(`/api/messages/${t1}`, student)).messages.at(-1).body === "Да, запросы тоже прикладывайте.", "студент видит ответ");
  await post(`/api/messages/${t1}/read`, student, {});
}

console.log("3. Чат группы: только студенты, без уведомлений");
{
  const nBefore = (await notes(student2)).length;
  const r = await post(`/api/messages/${chat1}`, student, { body: "Кто сегодня на лабораторной?" });
  ok(r.status === 200, "студент пишет в чат своей группы");
  const view = await get(`/api/messages/${chat1}`, student);
  ok(view.conversation.type === "group" && view.conversation.title === "Группа ПИ-24-1", "это чат группы ПИ-24-1");
  ok(view.messages.every((m) => !["teacher1", "teacher2", "dean1"].some((l) => m.authorId === uid(l))), "в чате группы нет сообщений преподавателей и деканата");
  ok((await notes(student2)).length === nBefore, "чат группы не создаёт уведомлений в колокольчике");
  ok((await get("/api/messages", student2)).items.every((i) => i.id !== chat1), "студент другой группы чат не видит");
}

console.log("4. Новый диалог: адресаты, существующий диалог, деканат");
{
  const classmate = uid("s24-02");
  const sc = directId("student1", "s24-02");
  const r = await post("/api/messages/start", student, { userId: classmate });
  ok(r.status === 200 && (await json(r)).id === sc, "диалог с одногруппницей открывается тот же, второй не создаётся");
  const cnt = db.prepare("SELECT COUNT(*) AS c FROM conversations WHERE pair_key = ?").get(pairKey(uid("student1"), classmate)).c;
  ok(cnt === 1, "в базе один диалог на пару");
  const rev = await post("/api/messages/start", student, { userId: uid("teacher1") });
  ok((await json(rev)).id === t1, "диалог с преподавателем: тот же id");

  // Деканат начинает диалог, студент отвечает
  const ds1 = await post("/api/messages/start", dean, { userId: uid("student1") });
  const dId = (await json(ds1)).id;
  ok(ds1.status === 200 && dId > 0, "деканат начинает диалог со студентом");
  ok((await get("/api/messages", student)).items.every((i) => i.id !== dId), "пока в диалоге нет сообщений, он в списке не появляется");
  ok((await post(`/api/messages/${dId}`, dean, { body: "Арина, добрый день! Проверьте, пожалуйста, данные в профиле." })).status === 200, "деканат пишет студенту");
  ok((await get("/api/messages", student)).items.some((i) => i.id === dId && i.unread === 1 && i.subtitle === "Деканат"), "у студента новый диалог с пометкой «Деканат»");
  ok((await post(`/api/messages/${dId}`, student, { body: "Здравствуйте! Всё верно." })).status === 200, "студент отвечает деканату в том же диалоге");
  const again = await post("/api/messages/start", student, { userId: uid("dean1") });
  ok(again.status === 200 && (await json(again)).id === dId, "студент может открыть существующий диалог с деканатом");
}

console.log("5. Текст: проверки и защита");
{
  ok((await post(`/api/messages/${t1}`, student, { body: "   \n  " })).status === 400, "пустое сообщение отклоняется");
  ok((await post(`/api/messages/${t1}`, student, { body: "а".repeat(2001) })).status === 400, "сообщение длиннее 2000 символов отклоняется");
  ok((await post(`/api/messages/${t1}`, student, { body: 12345 })).status === 400, "не строка отклоняется");
  const xss = '<script>alert(1)</script> <img src=x onerror=alert(2)>';
  ok((await post(`/api/messages/${t1}`, student, { body: xss })).status === 200, "текст с разметкой принимается");
  const res = await req(`/api/messages/${t1}`, { cookie: teacher });
  ok((res.headers.get("content-type") ?? "").includes("application/json"), "сообщения отдаются как JSON, а не как HTML");
  ok((await res.json()).messages.at(-1).body === xss, "текст хранится как обычный текст без изменений (выводится React-ом без разметки)");
  const html = await (await req(`/messages/${t1}`, { cookie: teacher })).text();
  ok(!html.includes("onerror=alert"), "страница диалога не содержит вставленной разметки");
}

console.log("6. Удаление своего сообщения");
{
  const mine = (await get(`/api/messages/${t1}`, student)).messages.at(-1);
  ok(mine.mine && mine.deletableUntil !== null, "своё свежее сообщение можно удалить");
  const r = await post("/api/messages/delete", student, { messageId: mine.id });
  ok(r.status === 200, "удаление выполнено");
  const after = (await get(`/api/messages/${t1}`, teacher)).messages.find((m) => m.id === mine.id);
  ok(after?.deleted === true && after.body === "", "собеседник видит «сообщение удалено», текст не отдаётся");
  const theirs = (await get(`/api/messages/${t1}`, student)).messages.find((m) => !m.mine);
  ok((await post("/api/messages/delete", student, { messageId: theirs.id })).status === 403, "чужое сообщение удалить нельзя");
  const old = db.prepare("SELECT id FROM messages WHERE conversation_id = ? AND author_id = ? AND created_at < ? LIMIT 1").get(t1, uid("student1"), new Date(Date.now() - 6 * 60_000).toISOString());
  ok((await post("/api/messages/delete", student, { messageId: old.id })).status === 409, "сообщение старше 5 минут удалить нельзя (409)");
}

console.log("7. Рассылка преподавателя");
{
  const info = await get("/api/messages/broadcast", teacher);
  ok(info.groups.length === 2 && info.groups.some((g) => g.name === "ПИ-24-1" && g.students === 12), "преподаватель видит свои группы с числом студентов");
  ok(info.broadcasts.length === 1, "в истории одна демо-рассылка");
  const students = db.prepare("SELECT user_id AS id FROM student_profiles WHERE group_id = ?").all(g1).map((r) => r.id);
  const s2Before = (await get("/api/messages", student2)).unread;
  const nBefore = (await notes(student)).length;
  const r = await post("/api/messages/broadcast", teacher, { groupIds: [g1], body: "Консультация перед КТ2 состоится в среду в 15:00, ауд. 214.\nПриходите с вопросами." });
  const d = await json(r);
  ok(r.status === 200 && d.recipients === 12, "рассылка ушла 12 студентам группы");
  const bid = db.prepare("SELECT MAX(id) AS id FROM broadcasts").get().id;
  const copies = db.prepare("SELECT conversation_id AS c, author_id AS a FROM messages WHERE broadcast_id = ?").all(bid);
  ok(copies.length === 12 && copies.every((m) => m.a === uid("teacher1")), "у каждого студента своя копия в личном диалоге с преподавателем");
  ok(new Set(copies.map((c) => c.c)).size === 12, "копии лежат в 12 разных диалогах: ответ студента увидит только преподаватель");
  ok(students.every((sid) => copies.some((c) => db.prepare("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?").get(c.c, sid))), "каждый получатель участник своего диалога");
  const n = await notes(student);
  ok(n.length === nBefore + 1 && n[0].title.startsWith("Рассылка:"), "студент получил уведомление «Рассылка: …»");
  ok((await get("/api/messages", student2)).unread === s2Before, "студент другой группы ничего не получил");
  const dlg = (await get(`/api/messages/${t1}`, student)).messages.at(-1);
  ok(dlg.broadcast === "ПИ-24-1" && dlg.body.startsWith("Консультация"), "в диалоге студента сообщение помечено как рассылка группы");
  const reply = await post(`/api/messages/${t1}`, student, { body: "Спасибо, буду." });
  ok(reply.status === 200, "студент отвечает на рассылку в личном диалоге");
  ok((await get("/api/messages/broadcast", teacher)).broadcasts[0].recipients === 12, "рассылка видна в истории преподавателя");

  // Удаление рассылки у всех получателей
  const del = await post("/api/messages/broadcast/delete", teacher, { broadcastId: bid });
  ok(del.status === 200, "преподаватель удаляет свежую рассылку");
  ok(db.prepare("SELECT COUNT(*) AS c FROM messages WHERE broadcast_id = ? AND deleted_at IS NOT NULL").get(bid).c === 12, "рассылка удалена у всех 12 получателей");
  ok((await get(`/api/messages/${t1}`, student)).messages.some((m) => m.deleted && m.broadcast === "ПИ-24-1" && m.body === ""), "у студента вместо текста «сообщение удалено»");
  const demo = db.prepare("SELECT MIN(id) AS id FROM broadcasts").get().id;
  ok((await post("/api/messages/broadcast/delete", teacher, { broadcastId: demo })).status === 409, "старую рассылку (больше 5 минут) удалить нельзя");
  ok((await post("/api/messages/broadcast/delete", dean, { broadcastId: demo })).status === 403, "деканат не удаляет рассылки");
  ok((await post("/api/messages/broadcast/delete", (await login("teacher2", "Teach-Two-26")), { broadcastId: demo })).status === 404, "чужую рассылку удалить нельзя (404)");

  // Лимит: не больше 5 рассылок в час (одна уже отправлена выше)
  let last = 0;
  for (let i = 0; i < 4; i++) last = (await post("/api/messages/broadcast", teacher, { groupIds: [g1], body: `Проверка лимита ${i + 1}` })).status;
  ok(last === 200, "до пяти рассылок в час проходят");
  const over = await post("/api/messages/broadcast", teacher, { groupIds: [g1], body: "Шестая" });
  ok(over.status === 429 && Number(over.headers.get("retry-after")) > 0, "шестая рассылка за час получает 429 с Retry-After");
}

console.log("8. Лимит частоты сообщений");
{
  const dc = directId("dean1", "student2");
  let statuses = [];
  for (let i = 0; i < 21; i++) statuses.push((await post(`/api/messages/${dc}`, student2, { body: `Сообщение ${i + 1}` })).status);
  ok(statuses.slice(0, 20).every((s) => s === 200), "первые 20 сообщений за минуту отправлены");
  ok(statuses[20] === 429, "21-е сообщение за минуту получает 429");
  const r = await post(`/api/messages/${dc}`, student2, { body: "ещё" });
  ok(Number(r.headers.get("retry-after")) > 0, "в ответе есть Retry-After");
  ok((await post(`/api/messages/${dc}`, dean, { body: "Ответ деканата не ограничен лимитом студента" })).status === 200, "лимит считается на пользователя, а не на диалог");
  const page1 = await get(`/api/messages/${dc}`, student2);
  ok(page1.messages.length === 22 && page1.hasMore === false, "в диалоге 22 сообщения, одна порция");
  const older = await get(`/api/messages/${dc}?before=${page1.messages[5].id}`, student2);
  ok(older.messages.length === 5 && older.messages.every((m) => m.id < page1.messages[5].id), "подгрузка старых сообщений по ?before работает");
}

console.log("10. Преподаватели и деканат пишут друг другу");
{
  const t2 = await login("teacher2", "Teach-Two-26");
  const tt = directId("teacher1", "teacher2");
  const dt = directId("dean1", "teacher1");
  const ids = (j) => j.blocks.flatMap((b) => b.items.map((i) => i.id));
  const tr = await get("/api/messages/recipients", teacher);
  ok(ids(tr).includes(uid("teacher2")) && ids(tr).includes(uid("dean1")) && !ids(tr).includes(uid("teacher1")), "преподаватель находит коллег и деканат (себя в списке нет)");
  ok(tr.blocks[0].title === "Деканат" && tr.blocks[1].title === "Преподаватели", "в списке адресатов преподавателя блоки «Деканат» и «Преподаватели» идут перед группами");
  const dr = await get("/api/messages/recipients", dean);
  ok(ids(dr).includes(uid("teacher1")) && ids(dr).includes(uid("teacher2")), "деканат находит преподавателей");

  let r = await post("/api/messages/start", teacher, { userId: uid("teacher2") });
  ok(r.status === 200 && (await json(r)).id === tt, "преподаватель открывает существующий диалог с коллегой");
  const nBefore = (await notes(t2)).length;
  ok((await post(`/api/messages/${tt}`, teacher, { body: "Нина Олеговна, давайте сдвинем лабораторную на 14:30." })).status === 200, "преподаватель пишет коллеге");
  ok((await notes(t2)).length === nBefore + 1, "коллега получил уведомление");
  ok((await get(`/api/messages/${tt}`, t2)).conversation.subtitle === "Преподаватель", "у коллеги подпись собеседника «Преподаватель»");

  // Преподаватель → деканат и ответ
  r = await post("/api/messages/start", teacher, { userId: uid("dean1") });
  ok(r.status === 200 && (await json(r)).id === dt, "преподаватель открывает диалог с деканатом");
  ok((await post(`/api/messages/${dt}`, teacher, { body: "Добрый день! Ведомость закрою до конца недели." })).status === 200, "преподаватель пишет деканату");
  ok((await get(`/api/messages/${dt}`, dean)).messages.at(-1).body.startsWith("Добрый день"), "деканат видит сообщение");
  ok((await post(`/api/messages/${dt}`, dean, { body: "Спасибо, ждём." })).status === 200, "деканат отвечает преподавателю");

  // Деканат начинает диалог с преподавателем, которого ещё нет в переписке
  r = await post("/api/messages/start", dean, { userId: uid("teacher2") });
  const d2 = (await json(r)).id;
  ok(r.status === 200 && d2 > 0, "деканат начинает диалог с преподавателем");
  ok((await post(`/api/messages/${d2}`, dean, { body: "Нина Олеговна, проверьте, пожалуйста, расписание на четверг." })).status === 200, "деканат пишет преподавателю");
  ok((await get("/api/messages", t2)).items.some((i) => i.id === d2 && i.subtitle === "Деканат" && i.unread === 1), "у преподавателя новый диалог с пометкой «Деканат»");
  ok((await post(`/api/messages/${d2}`, t2, { body: "Проверю сегодня." })).status === 200, "преподаватель отвечает деканату");

  // Чат группы по-прежнему только студентам
  ok((await req(`/api/messages/${chat1}`, { cookie: teacher })).status === 404, "в чат группы по-прежнему нельзя ни преподавателю, ни деканату");
}

console.log("9. Страницы раздела");
{
  for (const [who, c] of [["студент", student], ["преподаватель", teacher], ["деканат", dean]]) {
    ok((await req("/messages", { cookie: c })).status === 200, `${who}: /messages открывается`);
  }
  ok((await req(`/messages/${t1}`, { cookie: student })).status === 200, "диалог открывается у участника");
  ok((await req(`/messages/${chat1}`, { cookie: student })).status === 200, "чат группы открывается у студента группы");
  ok((await req("/messages/9999999", { cookie: student })).status === 404, "несуществующий диалог → страница 404");
  {
    // Next отдаёт для адресов, начинающихся с буквы, код 200 вместе со страницей «Такой страницы нет»; пользователь видит 404-страницу
    const r = await req("/messages/abc", { cookie: student });
    ok(r.status === 404 || (await r.text()).includes("Такой страницы нет"), "нечисловой адрес → страница «Такой страницы нет»");
  }
}

console.log(failed === 0 ? "\nВсе проверки пройдены. Выполните `npm run seed`, чтобы вернуть демо-данные." : `\nНе пройдено проверок: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
