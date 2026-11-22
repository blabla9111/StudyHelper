// Смена пароля пользователя в базе. Новый пароль читается из stdin (не из аргументов команды,
// чтобы он не попал в историю команд и список процессов). Хранится только bcrypt-хеш.
//   printf %s "НовыйПароль" | node deploy/set-password.mjs student1
// Обычно запускается через ./deploy/set-password.sh
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const login = process.argv[2];
if (!login) {
  console.error("Использование: node deploy/set-password.mjs <логин>  (пароль на stdin)");
  process.exit(2);
}
const password = fs.readFileSync(0, "utf8").replace(/\r?\n$/, "");
if (password.length < 12 || password.length > 128) {
  console.error("Пароль должен быть от 12 до 128 символов.");
  process.exit(2);
}

const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "studyhelper.db");
const db = new Database(file, { fileMustExist: true });
db.pragma("busy_timeout = 10000");
try {
  const user = db.prepare("SELECT id FROM users WHERE login = ?").get(login);
  if (!user) {
    console.error(`Пользователя «${login}» нет.`);
    process.exit(1);
  }
  const hash = bcrypt.hashSync(password, 10);
  db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id); // старые входы перестают работать
  })();
  console.error(`Пароль пользователя «${login}» изменён, его прежние сессии завершены.`);
} finally {
  db.close();
}
