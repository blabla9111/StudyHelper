// Безопасная копия базы SQLite: официальный онлайн-интерфейс backup (работает, пока сайт запущен).
// Простое копирование файла .db при включённом режиме WAL может дать «битую» копию, поэтому так делать нельзя.
//
//   node deploy/backup-db.mjs <файл-копии>      сделать копию живой базы (DATABASE_PATH) и проверить её
//   node deploy/backup-db.mjs --check <файл>    только проверить файл базы (для проверки восстановления)
//
// Сообщения идут в stderr, чтобы stdout не мешал. В режиме --check на stdout печатается строка seed_version=N.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

function verify(file) {
  const db = new Database(file, { fileMustExist: true });
  try {
    const integrity = db.pragma("integrity_check", { simple: true });
    const users = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
    const seed = db.prepare("SELECT value FROM meta WHERE key = 'seed_version'").get()?.value ?? "?";
    if (integrity !== "ok") {
      console.error(`База повреждена: integrity_check = ${integrity}`);
      process.exit(1);
    }
    if (users < 1) {
      console.error("В базе нет пользователей: это пустая или не та база.");
      process.exit(1);
    }
    console.error(`integrity_check ok, пользователей ${users}, версия демо-данных ${seed}`);
    return seed;
  } finally {
    db.close();
  }
}

const args = process.argv.slice(2);

if (args[0] === "--check") {
  if (!args[1]) {
    console.error("Использование: node deploy/backup-db.mjs --check <файл>");
    process.exit(2);
  }
  console.log(`seed_version=${verify(args[1])}`);
  process.exit(0);
}

const dest = args[0];
if (!dest) {
  console.error("Использование: node deploy/backup-db.mjs <файл-копии>");
  process.exit(2);
}
const src = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "studyhelper.db");
if (!fs.existsSync(src)) {
  console.error(`Нет файла базы: ${src}`);
  process.exit(1);
}
if (fs.existsSync(dest)) fs.rmSync(dest);

const db = new Database(src, { fileMustExist: true });
db.pragma("busy_timeout = 10000");
try {
  await db.backup(dest);
} finally {
  db.close();
}
console.error("Копия создана.");
verify(dest);
