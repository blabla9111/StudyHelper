// Сообщения: права, диалоги, отправка, рассылки. Все проверки доступа живут здесь, на сервере.
import type Database from "better-sqlite3";
import { notifyUsers } from "./notify";
import type { Role, SessionUser } from "./types";

type Db = Database.Database;

export const MAX_BODY = 2000;
export const PAGE_SIZE = 50;
export const DELETE_WINDOW_MS = 5 * 60_000;
export const NOTIFY_EVERY_MS = 10 * 60_000;
export const MSG_PER_MINUTE = 20;
export const BROADCASTS_PER_HOUR = 5;

// ───────────── Тексты и имена ─────────────

/** Обычный текст: без управляющих символов, с переносами строк, не длиннее лимита */
export function normalizeBody(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function shortName(fullName: string): string {
  const [last, first, middle] = fullName.trim().split(/\s+/);
  return [last, first && `${first[0]}.`, middle && `${middle[0]}.`].filter(Boolean).join(" ");
}

const snippet = (s: string, n = 100) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ───────────── Кто кого может найти ─────────────

export function groupOfStudent(db: Db, userId: number): { id: number; name: string } | null {
  return (
    (db
      .prepare("SELECT g.id, g.name FROM student_profiles sp JOIN groups g ON g.id = sp.group_id WHERE sp.user_id = ?")
      .get(userId) as { id: number; name: string } | undefined) ?? null
  );
}

/** Преподаватели группы студента: те, кто ведёт у неё дисциплины */
export function teachersOfStudent(db: Db, studentId: number) {
  return db
    .prepare(
      `SELECT u.id, u.full_name AS fullName, GROUP_CONCAT(DISTINCT d.name) AS subjects
         FROM student_profiles sp
         JOIN disciplines d ON d.group_id = sp.group_id
         JOIN users u ON u.id = d.teacher_id
        WHERE sp.user_id = ?
        GROUP BY u.id ORDER BY u.full_name COLLATE NOCASE`,
    )
    .all(studentId) as { id: number; fullName: string; subjects: string }[];
}

/** Группы, где преподаватель ведёт дисциплины, с числом студентов */
export function groupsOfTeacher(db: Db, teacherId: number) {
  return db
    .prepare(
      `SELECT g.id, g.name,
              (SELECT COUNT(*) FROM student_profiles sp WHERE sp.group_id = g.id) AS students
         FROM groups g
        WHERE g.id IN (SELECT group_id FROM disciplines WHERE teacher_id = ?)
        ORDER BY g.name`,
    )
    .all(teacherId) as { id: number; name: string; students: number }[];
}

function roleOf(db: Db, userId: number): Role | null {
  const r = db.prepare("SELECT role FROM users WHERE id = ?").get(userId) as { role: Role } | undefined;
  return r?.role ?? null;
}

/** Может ли отправитель НАЧАТЬ диалог с получателем (правила из ТЗ) */
export function canInitiate(db: Db, sender: SessionUser, recipientId: number): boolean {
  if (recipientId === sender.id) return false;
  const recipientRole = roleOf(db, recipientId);
  if (!recipientRole) return false;

  if (sender.role === "student") {
    if (recipientRole === "teacher") return teachersOfStudent(db, sender.id).some((t) => t.id === recipientId);
    if (recipientRole === "student") {
      const mine = groupOfStudent(db, sender.id);
      const theirs = groupOfStudent(db, recipientId);
      return !!mine && !!theirs && mine.id === theirs.id;
    }
    return false; // деканату студент первым не пишет
  }
  if (sender.role === "teacher") {
    // Коллегам и деканату преподаватель пишет свободно, студентам только своих групп
    if (recipientRole === "teacher" || recipientRole === "staff") return true;
    const g = groupOfStudent(db, recipientId);
    return !!g && groupsOfTeacher(db, sender.id).some((x) => x.id === g.id);
  }
  return recipientRole === "student" || recipientRole === "teacher"; // деканат: любому студенту и преподавателю
}

/** Может ли отправитель писать в уже существующий диалог: то же правило, плюс студент отвечает деканату */
export function canWriteTo(db: Db, sender: SessionUser, otherId: number): boolean {
  if (canInitiate(db, sender, otherId)) return true;
  return sender.role === "student" && roleOf(db, otherId) === "staff";
}

// ───────────── Диалоги ─────────────

export interface ConvAccess {
  id: number;
  type: "direct" | "group";
  groupId: number | null;
  otherId: number | null;
}

/**
 * Диалог, к которому у пользователя есть доступ. Личный: пользователь указан среди участников.
 * Чат группы: только для студента этой группы (преподаватели и деканат туда не попадают).
 * Чужой диалог неотличим от несуществующего.
 */
export function getConversationForUser(db: Db, user: SessionUser, convId: number): ConvAccess | null {
  if (!Number.isInteger(convId) || convId <= 0) return null;
  const c = db
    .prepare("SELECT id, type, group_id AS groupId FROM conversations WHERE id = ?")
    .get(convId) as { id: number; type: "direct" | "group"; groupId: number | null } | undefined;
  if (!c) return null;

  if (c.type === "group") {
    if (user.role !== "student") return null;
    const g = groupOfStudent(db, user.id);
    return g && g.id === c.groupId ? { id: c.id, type: "group", groupId: c.groupId, otherId: null } : null;
  }
  const other = db
    .prepare(
      `SELECT o.user_id AS otherId FROM conversation_members me
         JOIN conversation_members o ON o.conversation_id = me.conversation_id AND o.user_id != me.user_id
        WHERE me.conversation_id = ? AND me.user_id = ?`,
    )
    .get(convId, user.id) as { otherId: number } | undefined;
  return other ? { id: c.id, type: "direct", groupId: null, otherId: other.otherId } : null;
}

/** Личный диалог пары: находит существующий или создаёт новый (второй для той же пары не появится) */
export function getOrCreateDirect(db: Db, a: number, b: number): number {
  const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
  const found = db.prepare("SELECT id FROM conversations WHERE pair_key = ?").get(key) as { id: number } | undefined;
  if (found) return found.id;
  const id = Number(
    db
      .prepare("INSERT INTO conversations (type, pair_key, created_at) VALUES ('direct', ?, ?)")
      .run(key, new Date().toISOString()).lastInsertRowid,
  );
  const ins = db.prepare("INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)");
  ins.run(id, a);
  ins.run(id, b);
  return id;
}

/** Чат группы создаётся при первом обращении; новый участник начинает с чистого листа (старое не «непрочитано») */
export function ensureGroupChat(db: Db, groupId: number, userId: number): number {
  db.prepare("INSERT OR IGNORE INTO conversations (type, group_id, created_at) VALUES ('group', ?, ?)").run(
    groupId,
    new Date().toISOString(),
  );
  const id = (db.prepare("SELECT id FROM conversations WHERE group_id = ?").get(groupId) as { id: number }).id;
  db.prepare(
    `INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, last_read_message_id)
     VALUES (?, ?, (SELECT COALESCE(MAX(id), 0) FROM messages WHERE conversation_id = ?))`,
  ).run(id, userId, id);
  return id;
}

export interface ConversationItem {
  id: number;
  type: "direct" | "group";
  title: string;
  subtitle: string;
  lastText: string | null;
  lastAt: string | null;
  lastMine: boolean;
  unread: number;
  pinned: boolean;
}

function unreadIn(db: Db, convId: number, userId: number): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM messages
          WHERE conversation_id = ? AND author_id != ? AND deleted_at IS NULL
            AND id > COALESCE((SELECT last_read_message_id FROM conversation_members WHERE conversation_id = ? AND user_id = ?), 0)`,
      )
      .get(convId, userId, convId, userId) as { c: number }
  ).c;
}

/** Диалоги, которые видит пользователь. Свои рассылки в список не попадают, пока в диалоге нет ответа. */
export function listConversations(db: Db, user: SessionUser): { items: ConversationItem[]; unread: number } {
  const items: ConversationItem[] = [];

  if (user.role === "student") {
    const g = groupOfStudent(db, user.id);
    if (g) {
      const convId = ensureGroupChat(db, g.id, user.id);
      const members = (
        db.prepare("SELECT COUNT(*) AS c FROM student_profiles WHERE group_id = ?").get(g.id) as { c: number }
      ).c;
      const last = db
        .prepare(
          `SELECT m.created_at AS at, m.author_id AS authorId, m.deleted_at AS deletedAt, m.body, u.full_name AS author
             FROM messages m JOIN users u ON u.id = m.author_id
            WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT 1`,
        )
        .get(convId) as { at: string; authorId: number; deletedAt: string | null; body: string; author: string } | undefined;
      items.push({
        id: convId,
        type: "group",
        title: `Группа ${g.name}`,
        subtitle: `Чат группы · ${members} студентов`,
        lastText: last
          ? last.deletedAt
            ? "Сообщение удалено"
            : `${last.authorId === user.id ? "Вы" : last.author.split(/\s+/)[1] ?? last.author}: ${snippet(last.body)}`
          : null,
        lastAt: last?.at ?? null,
        lastMine: last?.authorId === user.id,
        unread: unreadIn(db, convId, user.id),
        pinned: true,
      });
    }
  }

  const direct = db
    .prepare(
      `SELECT c.id, o.user_id AS otherId, u.full_name AS otherName, u.role AS otherRole,
              (SELECT g.name FROM student_profiles sp JOIN groups g ON g.id = sp.group_id WHERE sp.user_id = u.id) AS otherGroup
         FROM conversations c
         JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = ?
         JOIN conversation_members o ON o.conversation_id = c.id AND o.user_id != me.user_id
         JOIN users u ON u.id = o.user_id
        WHERE c.type = 'direct'`,
    )
    .all(user.id) as { id: number; otherId: number; otherName: string; otherRole: Role; otherGroup: string | null }[];

  const myGroup = user.role === "student" ? groupOfStudent(db, user.id) : null;
  const lastStmt = db.prepare(
    `SELECT created_at AS at, author_id AS authorId, deleted_at AS deletedAt, body
       FROM messages
      WHERE conversation_id = ? AND NOT (author_id = ? AND broadcast_id IS NOT NULL)
      ORDER BY id DESC LIMIT 1`,
  );

  for (const d of direct) {
    const last = lastStmt.get(d.id, user.id) as
      | { at: string; authorId: number; deletedAt: string | null; body: string }
      | undefined;
    if (!last) continue; // пустые диалоги и собственные рассылки без ответов не показываем
    const subtitle =
      d.otherRole === "teacher"
        ? "Преподаватель"
        : d.otherRole === "staff"
          ? "Деканат"
          : d.otherGroup && myGroup && d.otherGroup === myGroup.name
            ? "Одногруппник"
            : `Студент${d.otherGroup ? ` · ${d.otherGroup}` : ""}`;
    items.push({
      id: d.id,
      type: "direct",
      title: d.otherName,
      subtitle,
      lastText: last.deletedAt ? "Сообщение удалено" : `${last.authorId === user.id ? "Вы: " : ""}${snippet(last.body)}`,
      lastAt: last.at,
      lastMine: last.authorId === user.id,
      unread: unreadIn(db, d.id, user.id),
      pinned: false,
    });
  }

  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.lastAt ?? "").localeCompare(a.lastAt ?? "");
  });
  return { items, unread: items.reduce((s, i) => s + i.unread, 0) };
}

/** Сумма непрочитанных для значка в меню (без создания чата группы) */
export function unreadTotal(db: Db, user: SessionUser): number {
  let total = 0;
  const direct = db
    .prepare(
      `SELECT c.id FROM conversations c
         JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = ?
        WHERE c.type = 'direct'`,
    )
    .all(user.id) as { id: number }[];
  for (const d of direct) total += unreadIn(db, d.id, user.id);
  if (user.role === "student") {
    const g = groupOfStudent(db, user.id);
    const chat = g ? (db.prepare("SELECT id FROM conversations WHERE group_id = ?").get(g.id) as { id: number } | undefined) : undefined;
    if (chat) total += unreadIn(db, chat.id, user.id);
  }
  return total;
}

export function markRead(db: Db, convId: number, userId: number) {
  const max = (db.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM messages WHERE conversation_id = ?").get(convId) as { m: number }).m;
  db.prepare(
    `INSERT INTO conversation_members (conversation_id, user_id, last_read_message_id) VALUES (?, ?, ?)
     ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_message_id = MAX(last_read_message_id, excluded.last_read_message_id)`,
  ).run(convId, userId, max);
}

// ───────────── Сообщения ─────────────

export interface MessageDTO {
  id: number;
  authorId: number;
  authorName: string;
  mine: boolean;
  body: string;
  createdAt: string;
  deleted: boolean;
  broadcast: string | null;
  deletableUntil: string | null;
}

interface MsgRow {
  id: number;
  authorId: number;
  authorName: string;
  body: string | null;
  createdAt: string;
  deletedAt: string | null;
  broadcastGroups: string | null;
}

export function getMessages(db: Db, convId: number, user: SessionUser, before?: number): { messages: MessageDTO[]; hasMore: boolean } {
  const rows = db
    .prepare(
      `SELECT m.id, m.author_id AS authorId, u.full_name AS authorName,
              CASE WHEN m.deleted_at IS NULL THEN m.body ELSE NULL END AS body,
              m.created_at AS createdAt, m.deleted_at AS deletedAt, b.group_names AS broadcastGroups
         FROM messages m
         JOIN users u ON u.id = m.author_id
         LEFT JOIN broadcasts b ON b.id = m.broadcast_id
        WHERE m.conversation_id = ? AND (? IS NULL OR m.id < ?)
        ORDER BY m.id DESC LIMIT ?`,
    )
    .all(convId, before ?? null, before ?? null, PAGE_SIZE + 1) as MsgRow[];
  const hasMore = rows.length > PAGE_SIZE;
  const now = Date.now();
  const messages = rows
    .slice(0, PAGE_SIZE)
    .reverse()
    .map((r): MessageDTO => {
      const mine = r.authorId === user.id;
      const until = new Date(r.createdAt).getTime() + DELETE_WINDOW_MS;
      return {
        id: r.id,
        authorId: r.authorId,
        authorName: r.authorName,
        mine,
        body: r.body ?? "",
        createdAt: r.createdAt,
        deleted: r.deletedAt !== null,
        broadcast: r.broadcastGroups,
        deletableUntil: mine && !r.deletedAt && until > now ? new Date(until).toISOString() : null,
      };
    });
  return { messages, hasMore };
}

/** Шапка диалога: название, подпись и можно ли писать */
export function conversationHeader(db: Db, user: SessionUser, access: ConvAccess) {
  if (access.type === "group") {
    const g = groupOfStudent(db, user.id)!;
    const members = (db.prepare("SELECT COUNT(*) AS c FROM student_profiles WHERE group_id = ?").get(g.id) as { c: number }).c;
    return { id: access.id, type: "group" as const, title: `Группа ${g.name}`, subtitle: `Чат группы · ${members} студентов`, canSend: true };
  }
  const o = db
    .prepare(
      `SELECT u.full_name AS name, u.role,
              (SELECT g.name FROM student_profiles sp JOIN groups g ON g.id = sp.group_id WHERE sp.user_id = u.id) AS grp
         FROM users u WHERE u.id = ?`,
    )
    .get(access.otherId) as { name: string; role: Role; grp: string | null };
  const subtitle = o.role === "teacher" ? "Преподаватель" : o.role === "staff" ? "Деканат" : `Студент${o.grp ? ` · ${o.grp}` : ""}`;
  return {
    id: access.id,
    type: "direct" as const,
    title: o.name,
    subtitle,
    canSend: canWriteTo(db, user, access.otherId!),
  };
}

export type SendResult = { ok: true; id: number } | { ok: false; status: number; error: string };

/** Сохраняет сообщение и (для личных диалогов) уведомляет собеседника не чаще раза в 10 минут */
export function sendMessage(db: Db, user: SessionUser, access: ConvAccess, body: string): SendResult {
  if (access.type === "direct" && !canWriteTo(db, user, access.otherId!)) {
    return { ok: false, status: 403, error: "Писать этому собеседнику сейчас нельзя." };
  }
  const now = new Date().toISOString();
  const id = Number(
    db
      .prepare("INSERT INTO messages (conversation_id, author_id, body, created_at) VALUES (?, ?, ?, ?)")
      .run(access.id, user.id, body, now).lastInsertRowid,
  );
  db.prepare("UPDATE conversations SET last_message_at = ? WHERE id = ?").run(now, access.id);
  markRead(db, access.id, user.id);

  if (access.type === "direct") {
    const link = `/messages/${access.id}`;
    const since = new Date(Date.now() - NOTIFY_EVERY_MS).toISOString();
    const recent = db
      .prepare("SELECT 1 FROM notifications WHERE user_id = ? AND type = 'message' AND link = ? AND created_at > ?")
      .get(access.otherId, link, since);
    if (!recent) {
      notifyUsers(db, [access.otherId!], {
        type: "message",
        title: `Сообщение от ${shortName(user.fullName)}`,
        body: snippet(body, 120),
        link,
      });
    }
  }
  return { ok: true, id };
}

/** Удаление своего сообщения в течение 5 минут. Рассылка удаляется сразу у всех получателей. */
export function deleteMessage(db: Db, user: SessionUser, messageId: number): { ok: boolean; status: number; error?: string } {
  const m = db
    .prepare("SELECT id, conversation_id AS convId, author_id AS authorId, created_at AS createdAt, deleted_at AS deletedAt, broadcast_id AS broadcastId FROM messages WHERE id = ?")
    .get(messageId) as { id: number; convId: number; authorId: number; createdAt: string; deletedAt: string | null; broadcastId: number | null } | undefined;
  if (!m || !getConversationForUser(db, user, m.convId)) return { ok: false, status: 404, error: "Сообщение не найдено." };
  if (m.authorId !== user.id) return { ok: false, status: 403, error: "Удалить можно только своё сообщение." };
  if (m.deletedAt) return { ok: true, status: 200 };
  if (Date.now() - new Date(m.createdAt).getTime() > DELETE_WINDOW_MS) {
    return { ok: false, status: 409, error: "Сообщение можно удалить только в течение 5 минут." };
  }
  const now = new Date().toISOString();
  if (m.broadcastId) {
    db.prepare("UPDATE messages SET deleted_at = ? WHERE broadcast_id = ? AND deleted_at IS NULL").run(now, m.broadcastId);
    db.prepare("UPDATE broadcasts SET deleted_at = ? WHERE id = ?").run(now, m.broadcastId);
  } else {
    db.prepare("UPDATE messages SET deleted_at = ? WHERE id = ?").run(now, m.id);
  }
  return { ok: true, status: 200 };
}

// ───────────── Адресаты ─────────────

export interface Recipient {
  id: number;
  fullName: string;
  hint: string;
}

export function recipientsFor(db: Db, user: SessionUser, query: string) {
  const q = query.trim().toLowerCase();
  const match = (r: Recipient) => !q || r.fullName.toLowerCase().includes(q) || r.hint.toLowerCase().includes(q);

  if (user.role === "student") {
    const g = groupOfStudent(db, user.id);
    const teachers = teachersOfStudent(db, user.id)
      .map((t) => ({ id: t.id, fullName: t.fullName, hint: t.subjects.split(",").join(", ") }))
      .filter(match);
    const classmates = (
      g
        ? (db
            .prepare(
              `SELECT u.id, u.full_name AS fullName FROM student_profiles sp JOIN users u ON u.id = sp.user_id
                WHERE sp.group_id = ? AND u.id != ? ORDER BY u.full_name COLLATE NOCASE`,
            )
            .all(g.id, user.id) as { id: number; fullName: string }[])
        : []
    )
      .map((c) => ({ ...c, hint: g!.name }))
      .filter(match);
    return { blocks: [{ title: "Преподаватели", items: teachers }, { title: "Одногруппники", items: classmates }] };
  }

  const employees = (role: Role) =>
    (
      db
        .prepare(
          `SELECT u.id, u.full_name AS fullName, COALESCE(e.department, '') AS hint
             FROM users u LEFT JOIN employee_profiles e ON e.user_id = u.id
            WHERE u.role = ? AND u.id != ? ORDER BY u.full_name COLLATE NOCASE`,
        )
        .all(role, user.id) as Recipient[]
    ).filter(match);

  if (user.role === "teacher") {
    const groupBlocks = groupsOfTeacher(db, user.id).map((g) => ({
      title: `Группа ${g.name}`,
      items: (
        db
          .prepare(
            `SELECT u.id, u.full_name AS fullName FROM student_profiles sp JOIN users u ON u.id = sp.user_id
              WHERE sp.group_id = ? ORDER BY u.full_name COLLATE NOCASE`,
          )
          .all(g.id) as { id: number; fullName: string }[]
      )
        .map((s) => ({ ...s, hint: g.name }))
        .filter(match),
    }));
    return {
      blocks: [
        { title: "Деканат", items: employees("staff") },
        { title: "Преподаватели", items: employees("teacher") },
        ...groupBlocks.filter((b) => b.items.length > 0 || !q),
      ],
    };
  }

  // LOWER() в SQLite не понимает кириллицу, поэтому поиск по имени делаем в коде (для прототипа этого достаточно)
  // Деканату видны все студенты, поэтому список выдаём только по запросу от 2 символов, а не целиком
  if (q.length < 2) {
    return {
      blocks: [{ title: "Преподаватели", items: employees("teacher") }, { title: "Студенты", items: [] as Recipient[] }],
      note: "Чтобы найти студента, введите хотя бы две буквы фамилии.",
    };
  }
  const rows = (
    db
      .prepare(
        `SELECT u.id, u.full_name AS fullName, g.name AS hint
           FROM student_profiles sp JOIN users u ON u.id = sp.user_id JOIN groups g ON g.id = sp.group_id
          ORDER BY g.name, u.full_name COLLATE NOCASE LIMIT 3000`,
      )
      .all() as Recipient[]
  )
    .filter(match)
    .slice(0, 30);
  return { blocks: [{ title: "Преподаватели", items: employees("teacher") }, { title: "Студенты", items: rows }] };
}

// ───────────── Рассылки ─────────────

export interface BroadcastDTO {
  id: number;
  body: string;
  groups: string;
  recipients: number;
  createdAt: string;
  deletableUntil: string | null;
}

export function listBroadcasts(db: Db, authorId: number): BroadcastDTO[] {
  const now = Date.now();
  return (
    db
      .prepare(
        `SELECT id, body, group_names AS groups, recipients_count AS recipients, created_at AS createdAt
           FROM broadcasts WHERE author_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 20`,
      )
      .all(authorId) as Omit<BroadcastDTO, "deletableUntil">[]
  ).map((b) => {
    const until = new Date(b.createdAt).getTime() + DELETE_WINDOW_MS;
    return { ...b, deletableUntil: until > now ? new Date(until).toISOString() : null };
  });
}

/**
 * Рассылка группам: получатели определяются здесь, по базе, а не по списку от клиента.
 * Каждый студент получает копию в личном диалоге с преподавателем и уведомление.
 */
export function createBroadcast(
  db: Db,
  teacher: SessionUser,
  groupIds: number[],
  body: string,
): { ok: true; recipients: number } | { ok: false; status: number; error: string } {
  const allowed = groupsOfTeacher(db, teacher.id);
  const chosen = allowed.filter((g) => groupIds.includes(g.id));
  if (chosen.length === 0 || chosen.length !== new Set(groupIds).size) {
    return { ok: false, status: 403, error: "Рассылать можно только группам, у которых вы ведёте дисциплины." };
  }
  const studentIds = chosen.flatMap(
    (g) => (db.prepare("SELECT user_id AS id FROM student_profiles WHERE group_id = ?").all(g.id) as { id: number }[]).map((r) => r.id),
  );
  if (studentIds.length === 0) return { ok: false, status: 400, error: "В выбранных группах нет студентов." };

  const now = new Date().toISOString();
  db.transaction(() => {
    const bid = Number(
      db
        .prepare("INSERT INTO broadcasts (author_id, body, group_ids, group_names, recipients_count, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(teacher.id, body, JSON.stringify(chosen.map((g) => g.id)), chosen.map((g) => g.name).join(", "), studentIds.length, now)
        .lastInsertRowid,
    );
    const ins = db.prepare("INSERT INTO messages (conversation_id, author_id, body, created_at, broadcast_id) VALUES (?, ?, ?, ?, ?)");
    const touch = db.prepare("UPDATE conversations SET last_message_at = ? WHERE id = ?");
    for (const sid of studentIds) {
      const convId = getOrCreateDirect(db, teacher.id, sid);
      ins.run(convId, teacher.id, body, now, bid);
      touch.run(now, convId);
      markRead(db, convId, teacher.id);
      notifyUsers(db, [sid], {
        type: "message",
        title: `Рассылка: ${shortName(teacher.fullName)}`,
        body: snippet(body, 120),
        link: `/messages/${convId}`,
      });
    }
  })();
  return { ok: true, recipients: studentIds.length };
}

export function deleteBroadcast(db: Db, teacher: SessionUser, broadcastId: number): { ok: boolean; status: number; error?: string } {
  const b = db
    .prepare("SELECT id, author_id AS authorId, created_at AS createdAt, deleted_at AS deletedAt FROM broadcasts WHERE id = ?")
    .get(broadcastId) as { id: number; authorId: number; createdAt: string; deletedAt: string | null } | undefined;
  if (!b || b.authorId !== teacher.id) return { ok: false, status: 404, error: "Рассылка не найдена." };
  if (b.deletedAt) return { ok: true, status: 200 };
  if (Date.now() - new Date(b.createdAt).getTime() > DELETE_WINDOW_MS) {
    return { ok: false, status: 409, error: "Рассылку можно удалить только в течение 5 минут." };
  }
  const now = new Date().toISOString();
  db.prepare("UPDATE messages SET deleted_at = ? WHERE broadcast_id = ? AND deleted_at IS NULL").run(now, b.id);
  db.prepare("UPDATE broadcasts SET deleted_at = ? WHERE id = ?").run(now, b.id);
  return { ok: true, status: 200 };
}
