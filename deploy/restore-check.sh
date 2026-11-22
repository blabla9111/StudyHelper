#!/usr/bin/env bash
# Проверка копии: распаковывается во ВРЕМЕННЫЙ контейнер, живая база не затрагивается.
#   ./deploy/restore-check.sh                 последняя копия
#   ./deploy/restore-check.sh backups/ФАЙЛ.db.gz
# Последняя строка вывода: seed_version=N (версия демо-данных в копии).
set -euo pipefail
source "$(dirname "$0")/_common.sh"

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
file="${1:-$(ls -1t "$BACKUP_DIR"/studyhelper-*.db.gz 2>/dev/null | head -n1 || true)}"
[ -n "$file" ] && [ -f "$file" ] || fail "Копий не найдено в $BACKUP_DIR."
docker image inspect studyhelper:latest >/dev/null 2>&1 || fail "Нет образа studyhelper:latest (сначала docker compose build)."

echo "Проверяю: $file"
gzip -t "$file" || fail "Архив повреждён."
gunzip -c "$file" | docker run --rm -i --network none --entrypoint sh studyhelper:latest \
  -c 'cat > /tmp/check.db && node deploy/backup-db.mjs --check /tmp/check.db'
