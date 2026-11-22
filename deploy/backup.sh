#!/usr/bin/env bash
# Копия базы на работающем сайте (безопасным способом, через интерфейс backup SQLite).
#   ./deploy/backup.sh            обычная копия
#   ./deploy/backup.sh перед-обновлением   то же, но с пометкой в имени файла
# Копии: ./backups/studyhelper-ДАТА-ВРЕМЯ-пометка.db.gz, старше KEEP_DAYS (14) дней удаляются.
set -euo pipefail
source "$(dirname "$0")/_common.sh"

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
LABEL="${1:-auto}"
LABEL="${LABEL//[^[:alnum:]_-]/_}"

app_running || fail "Контейнер не запущен, копию снять нельзя. Запустите:  docker compose up -d"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
ts="$(date +%Y%m%d-%H%M%S)"
tmp="$(mktemp "$BACKUP_DIR/.tmp.XXXXXX")"
trap 'rm -f "$tmp" "$tmp.gz"' EXIT

# Копия делается внутри контейнера во временный файл и передаётся наружу через stdout
docker compose exec -T app sh -c 'f=$(mktemp /tmp/backup.XXXXXX) && node deploy/backup-db.mjs "$f" && cat "$f"; rc=$?; rm -f "$f"; exit $rc' > "$tmp"

size="$(stat -c %s "$tmp")"
[ "$size" -gt 4096 ] || fail "Копия подозрительно маленькая ($size байт), не сохраняю."

out="$BACKUP_DIR/studyhelper-$ts-$LABEL.db.gz"
gzip -c "$tmp" > "$tmp.gz"
mv "$tmp.gz" "$out"
chmod 600 "$out"

# Удаляем только собственные старые копии в папке backups
find "$BACKUP_DIR" -maxdepth 1 -name 'studyhelper-*.db.gz' -mtime +"$KEEP_DAYS" -delete

echo "Копия сохранена: $out ($(du -h "$out" | cut -f1))"
