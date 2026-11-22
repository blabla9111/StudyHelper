// Схема базы данных StudyHelper (SQLite). Применяется при каждом открытии базы (IF NOT EXISTS).
// Все данные в базе вымышленные.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS groups (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  faculty   TEXT NOT NULL,
  direction TEXT NOT NULL,
  course    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  login         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'staff')),
  full_name     TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  group_id    INTEGER NOT NULL REFERENCES groups(id),
  record_book TEXT NOT NULL,
  study_form  TEXT NOT NULL
);

-- Профиль преподавателя и сотрудника деканата
CREATE TABLE IF NOT EXISTS employee_profiles (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  position   TEXT NOT NULL
);

-- В базе хранится только хеш токена сессии, сам токен лежит в httpOnly-cookie
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- У каждого пользователя своя копия уведомления со своим статусом «прочитано»
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  created_at TEXT NOT NULL,
  read_at    TEXT,
  dismissed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- Версия демо-данных: по ней скрипт seed понимает, что базу нужно заполнить заново
-- Журнал важных изменений (пока: открытие закрытых ведомостей и правка баллов после этого)
CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY,
  at      TEXT NOT NULL,
  user_id INTEGER,
  action  TEXT NOT NULL,
  object  TEXT NOT NULL,
  details TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_object ON audit_log (object, id DESC);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Дисциплина, которую преподаватель ведёт у группы в конкретном семестре
CREATE TABLE IF NOT EXISTS disciplines (
  id           INTEGER PRIMARY KEY,
  group_id     INTEGER NOT NULL REFERENCES groups(id),
  teacher_id   INTEGER NOT NULL REFERENCES users(id),
  name         TEXT NOT NULL,
  control_type TEXT NOT NULL CHECK (control_type IN ('credit', 'graded_credit', 'exam')),
  semester     INTEGER NOT NULL,
  exam_date    TEXT,
  closed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_disciplines_group ON disciplines (group_id, semester);
CREATE INDEX IF NOT EXISTS idx_disciplines_teacher ON disciplines (teacher_id);

-- Повторяющиеся занятия недели; parity: all — каждую неделю, odd/even — нечётные/чётные недели
CREATE TABLE IF NOT EXISTS lessons (
  id            INTEGER PRIMARY KEY,
  discipline_id INTEGER NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
  weekday       INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  slot          INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 7),
  kind          TEXT NOT NULL,
  parity        TEXT NOT NULL DEFAULT 'all' CHECK (parity IN ('all', 'odd', 'even')),
  room          TEXT NOT NULL,
  online_url    TEXT,
  format        TEXT NOT NULL DEFAULT 'offline' CHECK (format IN ('offline', 'online', 'hybrid')),
  online_comment TEXT
);
CREATE INDEX IF NOT EXISTS idx_lessons_discipline ON lessons (discipline_id);

-- Отмена, перенос или смена аудитории конкретного занятия в конкретную дату
CREATE TABLE IF NOT EXISTS lesson_changes (
  id         INTEGER PRIMARY KEY,
  lesson_id  INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('cancelled', 'moved', 'room_changed')),
  new_date   TEXT,
  new_slot   INTEGER,
  new_room   TEXT,
  reason     TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (lesson_id, date)
);

-- Баллы студента по дисциплине: две контрольные точки (по 30) и экзамен/зачёт (40)
CREATE TABLE IF NOT EXISTS grades (
  id            INTEGER PRIMARY KEY,
  discipline_id INTEGER NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
  student_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kt1           INTEGER CHECK (kt1 BETWEEN 0 AND 30),
  kt2           INTEGER CHECK (kt2 BETWEEN 0 AND 30),
  exam          INTEGER CHECK (exam BETWEEN 0 AND 40),
  updated_at    TEXT NOT NULL,
  UNIQUE (discipline_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_grades_student ON grades (student_id);

-- Особенности конкретного занятия в конкретную дату: формат, ссылка, запись.
-- format = NULL означает «как в расписании». prev_format и changed_at нужны для карточки «Изменилось».
CREATE TABLE IF NOT EXISTS lesson_sessions (
  id              INTEGER PRIMARY KEY,
  lesson_id       INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,
  format          TEXT CHECK (format IN ('offline', 'online', 'hybrid')),
  online_url      TEXT,
  online_comment  TEXT,
  prev_format     TEXT,
  change_kind     TEXT CHECK (change_kind IN ('format', 'link')),
  changed_at      TEXT,
  recording_title TEXT,
  recording_url   TEXT,
  recording_min   INTEGER,
  updated_at      TEXT NOT NULL,
  UNIQUE (lesson_id, date)
);

-- Материалы к занятию (файлы условные: скачивается демо-текст или открывается ссылка)
CREATE TABLE IF NOT EXISTS materials (
  id         INTEGER PRIMARY KEY,
  lesson_id  INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  title      TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('presentation', 'notes', 'sources')),
  url        TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_materials_lesson ON materials (lesson_id, date);

-- Задания с дедлайнами: видны всем студентам группы дисциплины
CREATE TABLE IF NOT EXISTS deadlines (
  id            INTEGER PRIMARY KEY,
  discipline_id INTEGER NOT NULL REFERENCES disciplines(id) ON DELETE CASCADE,
  lesson_id     INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
  lesson_date   TEXT,
  title         TEXT NOT NULL,
  due_date      TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deadlines_discipline ON deadlines (discipline_id, due_date);

CREATE TABLE IF NOT EXISTS deadline_done (
  deadline_id INTEGER NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
  student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  done_at     TEXT NOT NULL,
  PRIMARY KEY (deadline_id, student_id)
);

-- Просьба студента записать пропущенную пару
CREATE TABLE IF NOT EXISTS recording_requests (
  id              INTEGER PRIMARY KEY,
  student_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id       INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  date            TEXT NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN ('illness', 'work', 'event', 'other')),
  comment         TEXT,
  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'will_record', 'will_send_notes', 'declined')),
  teacher_comment TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (student_id, lesson_id, date)
);
CREATE INDEX IF NOT EXISTS idx_recreq_lesson ON recording_requests (lesson_id, date);

-- Справки и заявления. code — номер документа, verify_code — случайный код для QR (не угадывается)
CREATE TABLE IF NOT EXISTS requests (
  id          INTEGER PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  purpose     TEXT,
  delivery    TEXT NOT NULL CHECK (delivery IN ('pdf', 'paper')),
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'reviewing', 'signed', 'ready', 'rejected')),
  code        TEXT NOT NULL UNIQUE,
  verify_code TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  expected_at TEXT NOT NULL,
  valid_until TEXT,
  reject_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_requests_student ON requests (student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS request_events (
  id         INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  at         TEXT NOT NULL,
  comment    TEXT
);
CREATE INDEX IF NOT EXISTS idx_request_events ON request_events (request_id, at);

-- Объявления деканата: для всех, группы, курса или направления
CREATE TABLE IF NOT EXISTS announcements (
  id             INTEGER PRIMARY KEY,
  author_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  audience_type  TEXT NOT NULL CHECK (audience_type IN ('all', 'group', 'course', 'direction')),
  audience_value TEXT,
  needs_action   INTEGER NOT NULL DEFAULT 0,
  action_label   TEXT,
  action_href    TEXT,
  valid_until    TEXT,
  created_at     TEXT NOT NULL
);

-- Рассылки преподавателя группам: сама рассылка хранится один раз, копии лежат в личных диалогах студентов
CREATE TABLE IF NOT EXISTS broadcasts (
  id               INTEGER PRIMARY KEY,
  author_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body             TEXT NOT NULL,
  group_ids        TEXT NOT NULL,
  group_names      TEXT NOT NULL,
  recipients_count INTEGER NOT NULL,
  created_at       TEXT NOT NULL,
  deleted_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_broadcasts_author ON broadcasts (author_id, created_at DESC);

-- Диалоги: личные (direct, ровно два участника) и чат группы (group, только студенты этой группы).
-- pair_key = «меньший id-больший id» делает пару участников уникальной независимо от порядка.
CREATE TABLE IF NOT EXISTS conversations (
  id              INTEGER PRIMARY KEY,
  type            TEXT NOT NULL CHECK (type IN ('direct', 'group')),
  group_id        INTEGER UNIQUE REFERENCES groups(id) ON DELETE CASCADE,
  pair_key        TEXT UNIQUE,
  created_at      TEXT NOT NULL,
  last_message_at TEXT
);

-- Для личных диалогов строки создаются вместе с диалогом и определяют доступ.
-- Для чата группы участники определяются по группе студента, а здесь хранится только отметка «прочитано».
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id      INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members (user_id);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  deleted_at      TEXT,
  broadcast_id    INTEGER REFERENCES broadcasts(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_broadcast ON messages (broadcast_id);
`;
