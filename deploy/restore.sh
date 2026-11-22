#!/usr/bin/env bash
# Восстановление базы из копии. РАЗРУШАЮЩЕЕ ДЕЙСТВИЕ: текущая база заменяется. Перед заменой делается копия текущей.
#   ./deploy/restore.sh backups/ФАЙЛ.db.gz
set -euo pipefail
source "$(dirname "$0")/_common.sh"

file="${1:-}"
[ -n "$file" ] && [ -f "$file" ] || fail "Укажите файл копии:  ./deploy/restore.sh backups/ФАЙЛ.db.gz"

say "Шаг 1/4. Проверяю копию"
backup_seed="$(./deploy/restore-check.sh "$file" | grep -o '^seed_version=.*' | cut -d= -f2)"
image_seed="$(seed_of_image studyhelper:latest)"
if [ "$backup_seed" != "$image_seed" ]; then
  fail "Версия демо-данных в копии ($backup_seed) не совпадает с версией текущего образа ($image_seed). При запуске сайт сам пересоздал бы базу и копия пропала бы. Сначала откатите образ (./deploy/rollback.sh) на версию, из которой сделана копия."
fi

confirm "Текущая база будет ЗАМЕНЕНА данными из $file. Всё, что изменилось после этой копии, пропадёт. Сайт на минуту остановится."

say "Шаг 2/4. Копия текущей базы (на случай, если передумаете)"
if app_running; then ./deploy/backup.sh before-restore; else echo "Контейнер не запущен, пропускаю."; fi

say "Шаг 3/4. Подмена базы"
docker compose stop app
gunzip -c "$file" | docker run --rm -i --network none -v studyhelper-data:/data --entrypoint sh studyhelper:latest \
  -c 'cat > /data/restore.tmp && rm -f /data/studyhelper.db-wal /data/studyhelper.db-shm && mv /data/restore.tmp /data/studyhelper.db'

say "Шаг 4/4. Запуск"
docker compose up -d --no-build
wait_healthy
echo "Готово: база восстановлена из $file."
