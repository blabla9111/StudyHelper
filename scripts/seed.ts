// Заполняет базу вымышленными данными для демо.
//   npm run seed          — пересоздаёт данные с нуля
//   --if-empty            — заполняет, только если база пуста или демо-данные устарели
//                           (запускается автоматически перед dev и start)
import crypto from "node:crypto";
import { kindById } from "../src/lib/request-catalog";
import bcrypt from "bcryptjs";
import { getDb } from "../src/lib/db";
import { DEMO_ACCOUNTS } from "../src/lib/demo";
import { addDays, formatDayMonth, lessonOccursOn, slotByNumber, todayIso } from "../src/lib/schedule";
import { getOrCreateDirect, markRead } from "../src/lib/messages";
import { finalResult, totalPoints, type ControlType } from "../src/lib/grades";

// Увеличивайте номер, когда меняется состав демо-данных: старая база обновится сама
const SEED_VERSION = "7";

const args = process.argv.slice(2);
// «npm start» передаёт --production: сид запускается до next start, и NODE_ENV у него ещё не задан
const isProduction = process.env.NODE_ENV === "production" || args.includes("--production");
const db = getDb();

const userCount = (db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
const savedVersion = (db.prepare("SELECT value FROM meta WHERE key = 'seed_version'").get() as { value: string } | undefined)?.value;
const upToDate = userCount > 0 && savedVersion === SEED_VERSION;

if (args.includes("--if-empty") && upToDate) {
  console.log("[seed] База уже заполнена, пропускаю.");
  process.exit(0);
}
// В боевом режиме демо-аккаунты с известными паролями и стирание таблиц нужны только по явному разрешению
if (isProduction && process.env.ALLOW_DEMO_SEED !== "true") {
  console.log(
    "[seed] Боевой режим: демо-данные не создаются и не обновляются. Нужны демо-аккаунты для конкурса? Задайте ALLOW_DEMO_SEED=true (и после конкурса уберите).",
  );
  process.exit(0);
}
if (!args.includes("--reset") && userCount > 0 && !upToDate) {
  console.log("[seed] Демо-данные устарели, обновляю базу.");
}

const FACULTY = "Факультет информационных технологий";
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const today = todayIso();

// Детерминированный генератор: баллы одинаковы при каждом запуске
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

const GROUP_1_OTHERS = [
  "Агафонов Кирилл Денисович", "Баранова Софья Игоревна", "Васильев Матвей Артёмович",
  "Георгиева Милана Эдуардовна", "Давыдова Полина Сергеевна", "Ермаков Глеб Николаевич",
  "Жукова Анастасия Павловна", "Захаров Лев Алексеевич", "Исаева Варвара Романовна",
  "Калинин Артём Вадимович", "Левина Ксения Фёдоровна",
];
// Третья группа без дисциплин у демо-преподавателей: нужна, чтобы показать запреты в сообщениях
const GROUP_3_STUDENTS = ["Орлов Максим Андреевич", "Прохорова Алёна Викторовна", "Субботин Игорь Павлович"];
const GROUP_2_OTHERS = [
  "Миронов Егор Станиславович", "Назарова Алиса Тимуровна", "Образцов Данил Юрьевич",
  "Платонова Вера Дмитриевна", "Рябов Фёдор Ильич", "Савельева Диана Олеговна",
  "Титов Руслан Маратович", "Уварова Елена Борисовна", "Фомин Андрей Леонидович",
];

type Kind = "Лекция" | "Практика" | "Лабораторная";
type Fill = "full" | "kt12" | "kt1" | "none";
// weekday, slot, kind, parity, room, onlineUrl
type LessonDef = [number, number, Kind, "all" | "odd" | "even", string, string?];

interface DisciplineDef {
  group: 1 | 2;
  teacher: "teacher1" | "teacher2" | "eng" | "proj";
  name: string;
  control: ControlType;
  semester: number;
  examDate: string;
  closed: boolean;
  fill: Fill;
  lessons?: LessonDef[];
}

const DISCIPLINES: DisciplineDef[] = [
  // Группа ПИ-24-1, 5 семестр (идёт сейчас)
  { group: 1, teacher: "teacher1", name: "Базы данных", control: "exam", semester: 5, examDate: "2026-12-24", closed: false, fill: "kt12",
    lessons: [[1, 2, "Лекция", "all", "305"], [4, 3, "Лабораторная", "all", "214"]] },
  { group: 1, teacher: "teacher1", name: "Машинное обучение", control: "graded_credit", semester: 5, examDate: "2026-12-18", closed: false, fill: "kt12",
    lessons: [[2, 3, "Лекция", "all", "312"], [5, 4, "Практика", "even", "214"]] },
  { group: 1, teacher: "teacher2", name: "Теория вероятностей и математическая статистика", control: "exam", semester: 5, examDate: "2027-01-12", closed: false, fill: "kt1",
    lessons: [[3, 2, "Лекция", "all", "118"], [1, 4, "Практика", "odd", "118"]] },
  { group: 1, teacher: "eng", name: "Английский язык", control: "credit", semester: 5, examDate: "2026-11-10", closed: true, fill: "full",
    lessons: [[4, 5, "Практика", "all", "Онлайн", "https://meet.example.org/english-pi-24-1"]] },
  { group: 1, teacher: "proj", name: "Проектная деятельность", control: "credit", semester: 5, examDate: "2026-12-16", closed: false, fill: "kt1",
    lessons: [[3, 4, "Практика", "all", "420"]] },
  // Группа ПИ-24-1, 4 семестр (прошёл)
  { group: 1, teacher: "teacher1", name: "Операционные системы", control: "exam", semester: 4, examDate: "2026-06-18", closed: true, fill: "full" },
  { group: 1, teacher: "teacher1", name: "Алгоритмы и структуры данных", control: "exam", semester: 4, examDate: "2026-06-22", closed: true, fill: "full" },
  { group: 1, teacher: "teacher2", name: "Дифференциальные уравнения", control: "graded_credit", semester: 4, examDate: "2026-06-10", closed: true, fill: "full" },
  { group: 1, teacher: "eng", name: "Английский язык", control: "credit", semester: 4, examDate: "2026-06-05", closed: true, fill: "full" },

  // Группа ПИ-25-2, 3 семестр (идёт сейчас)
  { group: 2, teacher: "teacher1", name: "Алгоритмы и структуры данных", control: "exam", semester: 3, examDate: "2027-01-14", closed: false, fill: "kt1",
    lessons: [[1, 1, "Лекция", "all", "305"], [3, 3, "Лабораторная", "all", "214"]] },
  { group: 2, teacher: "teacher2", name: "Дискретная математика", control: "exam", semester: 3, examDate: "2027-01-09", closed: false, fill: "kt12",
    lessons: [[2, 2, "Лекция", "all", "118"], [4, 2, "Практика", "odd", "118"]] },
  { group: 2, teacher: "proj", name: "Программирование на Python", control: "graded_credit", semester: 3, examDate: "2026-12-20", closed: false, fill: "kt1",
    lessons: [[5, 2, "Лабораторная", "all", "216"], [2, 4, "Лекция", "even", "305"]] },
  { group: 2, teacher: "eng", name: "Английский язык", control: "credit", semester: 3, examDate: "2026-11-12", closed: true, fill: "full",
    lessons: [[1, 5, "Практика", "all", "Онлайн", "https://meet.example.org/english-pi-25-2"]] },
  // Группа ПИ-25-2, 2 семестр (прошёл)
  { group: 2, teacher: "teacher2", name: "Линейная алгебра", control: "exam", semester: 2, examDate: "2026-06-16", closed: true, fill: "full" },
  { group: 2, teacher: "teacher1", name: "Введение в программирование", control: "graded_credit", semester: 2, examDate: "2026-06-08", closed: true, fill: "full" },
  { group: 2, teacher: "proj", name: "История России", control: "credit", semester: 2, examDate: "2026-06-03", closed: true, fill: "full" },
  { group: 2, teacher: "eng", name: "Английский язык", control: "credit", semester: 2, examDate: "2026-06-05", closed: true, fill: "full" },
];

const run = db.transaction(() => {
  for (const t of [
    "messages", "conversation_members", "conversations", "broadcasts",
    "deadline_done", "deadlines", "recording_requests", "materials", "lesson_sessions", "request_events", "requests",
    "audit_log", "announcements", "grades", "lesson_changes", "lessons", "disciplines", "notifications", "sessions",
    "student_profiles", "employee_profiles", "users", "groups", "meta",
  ]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }

  const insGroup = db.prepare("INSERT INTO groups (name, faculty, direction, course) VALUES (?, ?, ?, ?)");
  const g1 = Number(insGroup.run("ПИ-24-1", FACULTY, "09.03.03 Прикладная информатика", 3).lastInsertRowid);
  const g2 = Number(insGroup.run("ПИ-25-2", FACULTY, "09.03.04 Программная инженерия", 2).lastInsertRowid);
  const g3 = Number(insGroup.run("ИБ-25-1", FACULTY, "10.03.01 Информационная безопасность", 2).lastInsertRowid);
  const groupIds = { 1: g1, 2: g2 } as const;

  const insUser = db.prepare("INSERT INTO users (login, password_hash, role, full_name) VALUES (?, ?, ?, ?)");
  const insStudent = db.prepare("INSERT INTO student_profiles (user_id, group_id, record_book, study_form) VALUES (?, ?, ?, ?)");
  const insEmployee = db.prepare("INSERT INTO employee_profiles (user_id, department, position) VALUES (?, ?, ?)");
  const insNotif = db.prepare(
    "INSERT INTO notifications (user_id, type, title, body, link, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );

  const hash = (p: string) => bcrypt.hashSync(p, 10);
  const ids: Record<string, number> = {};

  // Демо-аккаунты
  for (const a of DEMO_ACCOUNTS) {
    ids[a.login] = Number(insUser.run(a.login, hash(a.password), a.role, a.fullName).lastInsertRowid);
  }
  insStudent.run(ids.student1, g1, "2024-0137", "Очная");
  insStudent.run(ids.student2, g2, "2025-0418", "Очная");
  insEmployee.run(ids.teacher1, "Кафедра прикладной информатики", "Доцент");
  insEmployee.run(ids.teacher2, "Кафедра высшей математики", "Старший преподаватель");
  insEmployee.run(ids.dean1, "Деканат ФИТ", "Специалист по учебной работе");

  // Остальные преподаватели и одногруппники: войти под ними нельзя (случайный пароль)
  const lockedHash = hash(crypto.randomBytes(24).toString("hex"));
  const lockedTeacher = (login: string, name: string, dept: string, pos: string) => {
    const id = Number(insUser.run(login, lockedHash, "teacher", name).lastInsertRowid);
    insEmployee.run(id, dept, pos);
    return id;
  };
  ids.eng = lockedTeacher("t-eng", "Тихонова Галина Сергеевна", "Кафедра иностранных языков", "Старший преподаватель");
  ids.proj = lockedTeacher("t-proj", "Ефимов Станислав Игоревич", "Кафедра прикладной информатики", "Ассистент");

  const studentsByGroup: Record<1 | 2, number[]> = { 1: [ids.student1], 2: [ids.student2] };
  GROUP_1_OTHERS.forEach((name, i) => {
    const id = Number(insUser.run(`s24-${String(i + 1).padStart(2, "0")}`, lockedHash, "student", name).lastInsertRowid);
    insStudent.run(id, g1, `2024-${String(200 + i * 7).padStart(4, "0")}`, "Очная");
    studentsByGroup[1].push(id);
  });
  GROUP_2_OTHERS.forEach((name, i) => {
    const id = Number(insUser.run(`s25-${String(i + 1).padStart(2, "0")}`, lockedHash, "student", name).lastInsertRowid);
    insStudent.run(id, g2, `2025-${String(500 + i * 9).padStart(4, "0")}`, "Очная");
    studentsByGroup[2].push(id);
  });

  const group3Ids = GROUP_3_STUDENTS.map((name, i) => {
    const id = Number(insUser.run(`s26-${String(i + 1).padStart(2, "0")}`, lockedHash, "student", name).lastInsertRowid);
    insStudent.run(id, g3, `2025-${String(700 + i * 11).padStart(4, "0")}`, "Очная");
    return id;
  });
  void group3Ids;

  // Дисциплины, занятия, баллы
  const insDiscipline = db.prepare(
    "INSERT INTO disciplines (group_id, teacher_id, name, control_type, semester, exam_date, closed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insLesson = db.prepare(
    "INSERT INTO lessons (discipline_id, weekday, slot, kind, parity, room, online_url, format) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insGrade = db.prepare(
    "INSERT INTO grades (discipline_id, student_id, kt1, kt2, exam, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  );

  interface Seeded { def: DisciplineDef; id: number; lessonIds: number[] }
  const seeded: Seeded[] = [];

  DISCIPLINES.forEach((def, idx) => {
    const closedAt = def.closed ? new Date(`${def.examDate}T12:00:00Z`).toISOString() : null;
    const id = Number(
      insDiscipline.run(groupIds[def.group], ids[def.teacher], def.name, def.control, def.semester, def.examDate, closedAt).lastInsertRowid,
    );
    const lessonIds = (def.lessons ?? []).map(([wd, slot, kind, parity, room, url]) =>
      Number(insLesson.run(id, wd, slot, kind, parity, url ? "—" : room, url ?? null, url ? "online" : "offline").lastInsertRowid),
    );
    seeded.push({ def, id, lessonIds });

    if (def.fill === "none") return;
    const rand = rng(1000 + idx * 17);
    studentsByGroup[def.group].forEach((studentId, i) => {
      const main = i === 0; // демо-студент: хорошие, но не одинаковые результаты
      const kt1 = main ? between(rand, 24, 30) : between(rand, 15, 30);
      const kt2 = main ? between(rand, 22, 30) : between(rand, 14, 30);
      const exam = main ? between(rand, 30, 40) : between(rand, 20, 40);
      const row = {
        kt1,
        kt2: def.fill === "kt1" ? null : kt2,
        exam: def.fill === "full" ? exam : null,
      };
      insGrade.run(id, studentId, row.kt1, row.kt2, row.exam, minutesAgo(60 * 24 * 3));
    });
  });

  // Отмены, переносы, смена аудитории на ближайшие даты (считаются от сегодняшнего дня)
  const insChange = db.prepare(
    "INSERT INTO lesson_changes (lesson_id, date, status, new_date, new_slot, new_room, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const lessonDefs = db.prepare("SELECT id, weekday, parity FROM lessons").all() as { id: number; weekday: number; parity: string }[];
  const nextDate = (lessonId: number) => {
    const l = lessonDefs.find((x) => x.id === lessonId)!;
    for (let i = 1; i <= 21; i++) {
      const d = addDays(today, i);
      if (lessonOccursOn(l, d)) return d;
    }
    throw new Error("Нет ближайшей даты для занятия " + lessonId);
  };
  const find = (group: 1 | 2, name: string, lessonIdx: number) => {
    const s = seeded.find((x) => x.def.group === group && x.def.name === name && x.def.semester >= 3)!;
    return { lessonId: s.lessonIds[lessonIdx], def: s.def };
  };
  const when = (lessonId: number) => {
    const d = nextDate(lessonId);
    return { d, text: formatDayMonth(d) };
  };

  // Группа 1: отмена лекции по базам данных
  const bd = find(1, "Базы данных", 0);
  const bdWhen = when(bd.lessonId);
  insChange.run(bd.lessonId, bdWhen.d, "cancelled", null, null, null, "преподаватель на конференции", minutesAgo(12));
  // Группа 1: перенос практики по теории вероятностей на следующий день, пара 5
  const tv = find(1, "Теория вероятностей и математическая статистика", 1);
  const tvWhen = when(tv.lessonId);
  const tvNew = addDays(tvWhen.d, 1);
  insChange.run(tv.lessonId, tvWhen.d, "moved", tvNew, 5, null, null, minutesAgo(95));
  // Группа 1: смена аудитории лекции по машинному обучению
  const ml = find(1, "Машинное обучение", 0);
  const mlWhen = when(ml.lessonId);
  insChange.run(ml.lessonId, mlWhen.d, "room_changed", null, null, "405", null, minutesAgo(180));
  // Группа 2: перенос лекции по алгоритмам
  const al = find(2, "Алгоритмы и структуры данных", 0);
  const alWhen = when(al.lessonId);
  const alNew = addDays(alWhen.d, 2);
  insChange.run(al.lessonId, alWhen.d, "moved", alNew, 4, null, null, minutesAgo(40));
  // Группа 2: смена аудитории лабораторной по Python
  const py = find(2, "Программирование на Python", 0);
  const pyWhen = when(py.lessonId);
  insChange.run(py.lessonId, pyWhen.d, "room_changed", null, null, "217", null, minutesAgo(200));

  // ---- Формат пар, материалы, записи, дедлайны (всё считается от сегодняшнего дня)
  const disciplineOf = (group: 1 | 2, name: string) => seeded.find((x) => x.def.group === group && x.def.name === name && x.def.semester >= 3)!;
  const prevDate = (lessonId: number) => {
    const l = lessonDefs.find((x) => x.id === lessonId)!;
    for (let i = 1; i <= 21; i++) {
      const d = addDays(today, -i);
      if (lessonOccursOn(l, d)) return d;
    }
    throw new Error("Нет прошедшей даты для занятия " + lessonId);
  };
  const link = (lessonId: number, date: string) => `/schedule?d=${date}&l=${lessonId}`;

  const insSession = db.prepare(
    `INSERT INTO lesson_sessions (lesson_id, date, format, online_url, online_comment, prev_format, change_kind, changed_at, recording_title, recording_url, recording_min, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insMaterial = db.prepare("INSERT INTO materials (lesson_id, date, title, kind, url, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  const insDeadline = db.prepare(
    "INSERT INTO deadlines (discipline_id, lesson_id, lesson_date, title, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const insRecReq = db.prepare(
    `INSERT INTO recording_requests (student_id, lesson_id, date, reason, comment, status, teacher_comment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  // Пара с материалами и записью: лекция по базам данных, прошлая
  const bdPast = prevDate(bd.lessonId);
  insMaterial.run(bd.lessonId, bdPast, "Лекция 9. Индексы и план запроса", "presentation", null, minutesAgo(60 * 24 * 4));
  insMaterial.run(bd.lessonId, bdPast, "Конспект лекции", "notes", null, minutesAgo(60 * 24 * 4));
  insMaterial.run(bd.lessonId, bdPast, "Список источников", "sources", "https://example.org/sources/databases", minutesAgo(60 * 24 * 4));
  insSession.run(bd.lessonId, bdPast, null, null, null, null, null, null, "Базы данных: индексы и план запроса", null, 88, minutesAgo(60 * 24 * 4));

  // Пара без записи: лабораторная по базам данных, прошлая; к ней же задания
  const bdLab = find(1, "Базы данных", 1);
  const bdLabPast = prevDate(bdLab.lessonId);
  const bdDisc = disciplineOf(1, "Базы данных");
  insMaterial.run(bdLab.lessonId, bdLabPast, "Методичка к лабораторной № 3", "notes", null, minutesAgo(60 * 24 * 5));
  insMaterial.run(bdLab.lessonId, bdLabPast, "Шаблон схемы базы данных", "presentation", null, minutesAgo(60 * 24 * 5));
  insDeadline.run(bdDisc.id, bdLab.lessonId, bdLabPast, "Лабораторная № 2: ER-диаграмма", addDays(today, -1), minutesAgo(60 * 24 * 9));
  insDeadline.run(bdDisc.id, bdLab.lessonId, bdLabPast, "Лабораторная № 3: нормализация схемы", addDays(today, 2), minutesAgo(60 * 24 * 5));

  const mlPast = prevDate(ml.lessonId);
  const mlDisc = disciplineOf(1, "Машинное обучение");
  insDeadline.run(mlDisc.id, ml.lessonId, mlPast, "Ноутбук по классификации", addDays(today, 5), minutesAgo(60 * 24 * 4));
  insMaterial.run(ml.lessonId, mlPast, "Лекция 8. Деревья решений", "presentation", null, minutesAgo(60 * 24 * 4));

  const pr = find(1, "Проектная деятельность", 0);
  const prPast = prevDate(pr.lessonId);
  insDeadline.run(disciplineOf(1, "Проектная деятельность").id, pr.lessonId, prPast, "Презентация прототипа", addDays(today, 12), minutesAgo(60 * 24 * 6));

  const al0 = find(2, "Алгоритмы и структуры данных", 1);
  const al0Past = prevDate(al0.lessonId);
  insDeadline.run(disciplineOf(2, "Алгоритмы и структуры данных").id, al0.lessonId, al0Past, "Задачи на графы, набор № 4", addDays(today, 1), minutesAgo(60 * 24 * 6));
  const dm = find(2, "Дискретная математика", 0);
  insDeadline.run(disciplineOf(2, "Дискретная математика").id, dm.lessonId, prevDate(dm.lessonId), "Домашняя работа № 6", addDays(today, 6), minutesAgo(60 * 24 * 3));

  // Формат пар: очно с трансляцией и ссылкой (ТВиМС), онлайн без ссылки (проектная деятельность)
  const tvLec = find(1, "Теория вероятностей и математическая статистика", 0);
  const tvLecWhen = when(tvLec.lessonId);
  insSession.run(tvLec.lessonId, tvLecWhen.d, "hybrid", "https://meet.example.org/tvims-lecture", "Код доступа: 4821", "offline", "format", minutesAgo(25), null, null, null, minutesAgo(25));
  const prWhen = when(pr.lessonId);
  insSession.run(pr.lessonId, prWhen.d, "online", null, null, "offline", "format", minutesAgo(60), null, null, null, minutesAgo(60));

  // Запросы на запись: ответ «запишу» (будущая пара), «ждёт ответа», «пришлю конспект», «не получится»
  const bdLabWhen = when(bdLab.lessonId);
  insRecReq.run(ids.student1, bdLab.lessonId, bdLabWhen.d, "work", "Стажировка, в этот день не успеваю.", "will_record", "Запишу и выложу после пары.", minutesAgo(60 * 20), minutesAgo(60 * 3));
  const s24 = (i: number) => studentsByGroup[1][i];
  insRecReq.run(s24(1), ml.lessonId, mlPast, "illness", "Была на больничном.", "sent", null, minutesAgo(50), minutesAgo(50));
  insRecReq.run(s24(2), ml.lessonId, mlPast, "event", "Участвовал в олимпиаде.", "sent", null, minutesAgo(60 * 6), minutesAgo(60 * 6));
  insRecReq.run(s24(3), ml.lessonId, mlPast, "other", "Проспал, прошу прощения.", "sent", null, minutesAgo(60 * 8), minutesAgo(60 * 8));
  insRecReq.run(s24(4), ml.lessonId, mlPast, "work", "Стажировка, был на выезде.", "sent", null, minutesAgo(60 * 3), minutesAgo(60 * 3));

  // ---- Справки: готовая с PDF, в проверке и только что принятая
  const insRequest = db.prepare(
    `INSERT INTO requests (student_id, kind, title, purpose, delivery, note, status, code, verify_code, created_at, updated_at, expected_at, valid_until)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insEvent = db.prepare("INSERT INTO request_events (request_id, status, at, comment) VALUES (?, ?, ?, NULL)");
  const demoRequest = (
    n: number, student: string, kindId: string, purpose: string | null, status: string, createdMin: number, steps: [string, number][], validUntil: string | null,
  ) => {
    const kind = kindById(kindId)!;
    const code = `SH-${today.slice(0, 4)}-${String(n).padStart(6, "0")}`;
    const verify = crypto.createHash("sha256").update(`studyhelper-demo-${n}`).digest("hex").slice(0, 16);
    const created = minutesAgo(createdMin);
    const last = minutesAgo(steps[steps.length - 1][1]);
    const rid = Number(
      insRequest.run(ids[student], kindId, kind.title, purpose, "pdf", null, status, code, verify, created, last, addDays(today, kind.days - Math.floor(createdMin / 1440)), validUntil).lastInsertRowid,
    );
    for (const [st, minAgo] of steps) insEvent.run(rid, st, minutesAgo(minAgo));
    return rid;
  };
  const doneId = demoRequest(1, "student1", "study", null, "ready", 60 * 24 * 3, [["accepted", 60 * 24 * 3], ["reviewing", 60 * 24 * 3 - 180], ["signed", 60 * 24 * 2], ["ready", 60 * 24 * 2 - 120]], addDays(today, 88));
  const reviewId = demoRequest(2, "student1", "scholarship", "Орган социальной защиты", "reviewing", 60 * 24, [["accepted", 60 * 24], ["reviewing", 60 * 5]], null);
  const newId = demoRequest(3, "student2", "military", "Военный комиссариат", "accepted", 120, [["accepted", 120]], null);
  // Архив: готовая справка и отклонённое заявление, завершённые больше месяца назад
  demoRequest(4, "student1", "military", "Военный комиссариат", "ready", 60 * 24 * 55, [["accepted", 60 * 24 * 55], ["reviewing", 60 * 24 * 54], ["signed", 60 * 24 * 53], ["ready", 60 * 24 * 52]], addDays(today, -22));
  const rejectedId = demoRequest(5, "student1", "study", "Для банка", "rejected", 60 * 24 * 42, [["accepted", 60 * 24 * 42], ["reviewing", 60 * 24 * 41], ["rejected", 60 * 24 * 40]], null);
  db.prepare("UPDATE requests SET reject_reason = ? WHERE id = ?").run("В заявке не указано, для какого банка нужна справка. Подайте новую заявку с названием организации.", rejectedId);

  // ---- Объявления деканата: адресное с действием, для курса и для всех
  const insAnn = db.prepare(
    `INSERT INTO announcements (author_id, title, body, audience_type, audience_value, needs_action, action_label, action_href, valid_until, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insAnn.run(ids.dean1, "Материальная помощь: приём заявлений до 25 ноября", "Для студентов 3 курса открыт приём заявлений на материальную помощь. Подайте заявление в личном кабинете, бумаги нести не нужно.", "course", "3", 1, "Подать заявление", "/requests/new/material_aid", addDays(today, 9), minutesAgo(310));
  insAnn.run(ids.dean1, "Встреча второкурсников с кураторами", "В пятницу в 16:00, ауд. 301. Расскажем про практику и выбор профиля.", "course", "2", 0, null, null, addDays(today, 5), minutesAgo(220));
  insAnn.run(ids.dean1, "Часы приёма деканата", "Справки в бумажном виде выдаём по вторникам и четвергам с 10:00 до 16:00, ауд. 101.", "all", null, 0, null, null, null, minutesAgo(60 * 30));

  // Уведомления (согласованы с данными выше)
  const n = (login: string, type: string, title: string, body: string, link: string, minAgo: number, read = false) =>
    insNotif.run(ids[login], type, title, body, link, minutesAgo(minAgo), read ? minutesAgo(minAgo - 5) : null);

  const startOf = (lessonId: number) => {
    const l = db.prepare("SELECT slot FROM lessons WHERE id = ?").get(lessonId) as { slot: number };
    return slotByNumber(l.slot)!.start;
  };
  const closedResult = (login: string, groupNo: 1 | 2) => {
    const s = seeded.find((x) => x.def.group === groupNo && x.def.name === "Английский язык" && x.def.closed && x.def.semester >= 3)!;
    const g = db.prepare("SELECT kt1, kt2, exam FROM grades WHERE discipline_id = ? AND student_id = ?").get(s.id, ids[login]) as { kt1: number; kt2: number; exam: number };
    const total = totalPoints(g)!;
    return `${s.def.name}: ${total} баллов, ${finalResult(s.def.control, total).label}.`;
  };

  n("student1", "class_cancelled", "Пара отменена", `Базы данных, лекция ${bdWhen.text} в ${startOf(bd.lessonId)}. Причина: преподаватель на конференции.`, "/schedule", 12);
  n("student1", "class_moved", "Пара перенесена", `Теория вероятностей и математическая статистика, практика ${tvWhen.text} в ${startOf(tv.lessonId)} перенесена на ${formatDayMonth(tvNew)} в ${slotByNumber(5)!.start}.`, "/schedule", 95);
  n("student1", "class_moved", "Изменена аудитория", `Машинное обучение, лекция ${mlWhen.text} в ${startOf(ml.lessonId)}: аудитория 405 вместо 312.`, "/schedule", 180);
  n("student1", "announcement", "Нужно действие: Материальная помощь", "Для студентов 3 курса открыт приём заявлений. Подайте заявление в личном кабинете.", "/", 310);
  n("student1", "lesson_format", "Теория вероятностей и математическая статистика 09:50 теперь с трансляцией", `${tvLecWhen.text}, лекция. Ссылка для подключения в карточке пары.`, link(tvLec.lessonId, tvLecWhen.d), 25);
  n("student1", "lesson_format", "Проектная деятельность 13:30 теперь онлайн", `${prWhen.text}, практика. Аудитория не нужна. Ссылка появится позже.`, link(pr.lessonId, prWhen.d), 60);
  n("student1", "recording_request", "Преподаватель запишет пару", `Базы данных, ${bdLabWhen.text}. Запишу и выложу после пары.`, link(bdLab.lessonId, bdLabWhen.d), 180, true);
  n("student1", "request_status", "Заявка проверяется", "Справка для стипендии или соцзащиты: сотрудник деканата проверяет данные.", `/requests/${reviewId}`, 300);
  n("student1", "request_status", "Справка готова", "Справка об обучении: электронную справку можно скачать в PDF.", `/requests/${doneId}`, 60 * 24 * 2 - 120, true);
  n("student1", "grade", "Ведомость закрыта", closedResult("student1", 1), "/grades", 1500, true);
  n("student1", "deadline", "Новое задание: Базы данных", `Лабораторная № 3: нормализация схемы. Срок: ${formatDayMonth(addDays(today, 2))}.`, link(bdLab.lessonId, bdLabPast), 2900, true);

  n("student2", "class_moved", "Пара перенесена", `Алгоритмы и структуры данных, лекция ${alWhen.text} в ${startOf(al.lessonId)} перенесена на ${formatDayMonth(alNew)} в ${slotByNumber(4)!.start}.`, "/schedule", 40);
  n("student2", "class_moved", "Изменена аудитория", `Программирование на Python, лабораторная ${pyWhen.text} в ${startOf(py.lessonId)}: аудитория 217 вместо 216.`, "/schedule", 200);
  n("student2", "announcement", "Встреча второкурсников с кураторами", "В пятницу в 16:00, ауд. 301.", "/", 220);
  n("student2", "request_status", "Заявка принята", `Справка в военкомат: деканат получил заявку. Ожидаемый срок: ${formatDayMonth(addDays(today, 3))}.`, `/requests/${newId}`, 120);
  n("student2", "grade", "Ведомость закрыта", closedResult("student2", 2), "/grades", 1300, true);
  n("student2", "deadline", "Дедлайн завтра", "Загрузить отчёт по практической работе № 5.", "/schedule", 2800, true);

  n("teacher1", "deadline", "Ведомость ждёт оценок", "Закрыть ведомость по дисциплине «Базы данных» (ПИ-24-1) нужно до 24 декабря.", "/gradebooks", 95);
  n("teacher1", "announcement", "Объявление деканата", "Совещание преподавателей кафедры состоится в четверг в 14:00.", "/", 600);
  n("teacher2", "deadline", "Ведомость ждёт оценок", "Группа ПИ-25-2, «Дискретная математика»: выставьте баллы до 9 января.", "/gradebooks", 180);

  n("dean1", "request_status", "Новая заявка", "Громов Т. И.: справка в военкомат.", `/requests/${newId}`, 120);
  n("dean1", "request_status", "Новая заявка", "Лисицына А. Р.: справка для стипендии или соцзащиты.", `/requests/${reviewId}`, 60 * 24);
  n("teacher1", "recording_request", "Запросы на запись пары: 4", `Машинное обучение, ${formatDayMonth(mlPast)}. Студенты и причины собраны в одном списке.`, `/recordings#pair-${ml.lessonId}-${mlPast}`, 50);


  // ───── Сообщения ─────
  const insMsg = db.prepare("INSERT INTO messages (conversation_id, author_id, body, created_at, broadcast_id) VALUES (?, ?, ?, ?, ?)");
  const say = (convId: number, authorId: number, body: string, minAgo: number, broadcastId: number | null = null) =>
    Number(insMsg.run(convId, authorId, body, minutesAgo(minAgo), broadcastId).lastInsertRowid);
  const chatOf = (groupId: number) => {
    db.prepare("INSERT INTO conversations (type, group_id, created_at) VALUES ('group', ?, ?)").run(groupId, minutesAgo(60 * 24 * 20));
    return (db.prepare("SELECT id FROM conversations WHERE group_id = ?").get(groupId) as { id: number }).id;
  };
  const setRead = (convId: number, userId: number, lastId: number) =>
    db
      .prepare(
        `INSERT INTO conversation_members (conversation_id, user_id, last_read_message_id) VALUES (?, ?, ?)
         ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id`,
      )
      .run(convId, userId, lastId);
  const g1s = studentsByGroup[1];
  const g2s = studentsByGroup[2];
  const [headman, baranova, , georgieva, davydova, ermakov, , zakharov] = [g1s[1], g1s[2], g1s[3], g1s[4], g1s[5], g1s[6], g1s[7], g1s[8]];

  // Чат группы ПИ-24-1: только студенты. У student1 два непрочитанных
  const chat1 = chatOf(g1);
  say(chat1, headman, "Всем привет! Кто-нибудь знает, в какой аудитории лабораторная по базам данных на этой неделе?", 2900);
  say(chat1, ids.student1, "В 214, как обычно. Если не перенесут, конечно.", 2880);
  say(chat1, baranova, "Лекцию отменили, это видно в расписании. Лабораторная пока без изменений.", 2870);
  say(chat1, zakharov, "Кто уже сделал нормализацию до третьей формы? Хочу сверить свою схему.", 1500);
  say(chat1, davydova, "Я сделала. Могу показать завтра на паре, в чат файлы не отправить.", 1480);
  const chat1Read = say(chat1, headman, "Напоминаю: в пятницу в 16:00 встреча с куратором, ауд. 301. Приходите, расскажут про практику.", 300);
  say(chat1, georgieva, "Спасибо, что напомнил! Приду.", 240);
  say(chat1, ermakov, "А кто едет на студенческую конференцию в субботу? Можно скооперироваться на дорогу.", 35);
  setRead(chat1, ids.student1, chat1Read);

  const chat2 = chatOf(g2);
  say(chat2, g2s[1], "Ребята, у кого есть конспект по дискретке за прошлую неделю?", 700);
  say(chat2, g2s[2], "У меня есть, принесу в понедельник.", 650);
  const chat2Read = say(chat2, ids.student2, "Отлично, тогда сверимся перед практикой.", 600);
  say(chat2, g2s[3], "Не забудьте про отчёт по Python, срок до пятницы.", 90);
  setRead(chat2, ids.student2, chat2Read);

  // Рассылка преподавателя teacher1 группе ПИ-24-1: копия в личном диалоге каждого студента
  const bcastText = "Лабораторная № 4 по базам данных переносится на неделю, сдача в пятницу. Подготовьте схему и запросы, на защите будет короткий опрос.";
  const bcastId = Number(
    db
      .prepare("INSERT INTO broadcasts (author_id, body, group_ids, group_names, recipients_count, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(ids.teacher1, bcastText, JSON.stringify([g1]), "ПИ-24-1", g1s.length, minutesAgo(2000)).lastInsertRowid,
  );
  const direct: Record<number, number> = {};
  for (const sid of g1s) {
    const convId = getOrCreateDirect(db, ids.teacher1, sid);
    direct[sid] = convId;
    const mid = say(convId, ids.teacher1, bcastText, 2000, bcastId);
    markRead(db, convId, ids.teacher1);
    if (sid === ids.student1) setRead(convId, sid, mid);
  }

  // student1 ↔ teacher1: вопрос по лабораторной, ответ и одно непрочитанное сообщение
  const t1 = direct[ids.student1];
  say(t1, ids.student1, "Виктор Павлович, добрый день! В лабораторной № 3 нужна нормализация до 3НФ или достаточно до 2НФ?", 1300);
  say(t1, ids.teacher1, "Добрый день, Арина! До 3НФ. И добавьте короткое обоснование по каждой таблице.", 1250);
  const t1Read = say(t1, ids.student1, "Поняла, спасибо!", 1240);
  say(t1, ids.teacher1, "Кстати, пришлите схему до пятницы, посмотрю заранее и подскажу, что поправить.", 20);
  setRead(t1, ids.student1, t1Read);
  markRead(db, t1, ids.teacher1);
  // Студентка из группы пишет преподавателю: у teacher1 одно непрочитанное
  const t1b = direct[baranova];
  say(t1b, baranova, "Здравствуйте! Можно ли сдать лабораторную № 3 в четверг? Я болела на прошлой неделе.", 60);

  // student1 ↔ одногруппница
  const sc = getOrCreateDirect(db, ids.student1, baranova);
  say(sc, baranova, "Арина, ты записывала лекцию по машинному обучению? Я пропустила из-за простуды.", 900);
  say(sc, ids.student1, "Да, могу показать конспект завтра на паре.", 880);
  const scLast = say(sc, baranova, "Супер, спасибо!", 870);
  setRead(sc, ids.student1, scLast);
  setRead(sc, baranova, scLast);

  // Деканат ↔ student2: одно непрочитанное у студента
  const dc = getOrCreateDirect(db, ids.dean1, ids.student2);
  say(dc, ids.dean1, "Тимур, здравствуйте! Ваша справка в военкомат на проверке. Нужен ли вам ещё и бумажный экземпляр? Ответьте, пожалуйста, здесь.", 200);
  markRead(db, dc, ids.dean1);


  // Деканат ↔ преподаватель (одно непрочитанное у преподавателя) и два преподавателя между собой
  const dt = getOrCreateDirect(db, ids.dean1, ids.teacher1);
  say(dt, ids.dean1, "Виктор Павлович, добрый день! Напоминаю: ведомость по «Базам данных» (ПИ-24-1) нужно закрыть до 24 декабря.", 400);
  markRead(db, dt, ids.dean1);
  const tt = getOrCreateDirect(db, ids.teacher1, ids.teacher2);
  say(tt, ids.teacher2, "Виктор Павлович, не пересекаются ли ваши лабораторные с моими практиками у ПИ-25-2 в четверг?", 1700);
  const ttLast = say(tt, ids.teacher1, "Нина Олеговна, у меня четверг свободен после 13:30, можем сдвинуться.", 1650);
  markRead(db, tt, ids.teacher1);
  markRead(db, tt, ids.teacher2);
  void ttLast;

  n("student1", "message", "Рассылка: Сомов В. П.", "Лабораторная № 4 по базам данных переносится на неделю, сдача в пятницу.", `/messages/${t1}`, 2000, true);
  n("student1", "message", "Сообщение от Сомов В. П.", "Кстати, пришлите схему до пятницы, посмотрю заранее и подскажу, что поправить.", `/messages/${t1}`, 20);
  n("student2", "message", "Сообщение от Крылова Э. М.", "Тимур, здравствуйте! Ваша справка в военкомат на проверке.", `/messages/${dc}`, 200);
  n("teacher1", "message", "Сообщение от Крылова Э. М.", "Виктор Павлович, добрый день! Напоминаю: ведомость по «Базам данных» нужно закрыть до 24 декабря.", `/messages/${dt}`, 400);
  n("teacher1", "message", "Сообщение от Баранова С. И.", "Здравствуйте! Можно ли сдать лабораторную № 3 в четверг?", `/messages/${t1b}`, 60);

  db.prepare("INSERT INTO meta (key, value) VALUES ('seed_version', ?)").run(SEED_VERSION);
});

run();

const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
console.log(
  `[seed] Готово: аккаунтов демо ${DEMO_ACCOUNTS.length}, студентов ${count("SELECT COUNT(*) AS c FROM student_profiles")}, ` +
    `дисциплин ${count("SELECT COUNT(*) AS c FROM disciplines")}, занятий в неделю ${count("SELECT COUNT(*) AS c FROM lessons")}, ` +
    `строк с баллами ${count("SELECT COUNT(*) AS c FROM grades")}.`,
);
