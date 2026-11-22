#!/usr/bin/env bash
# Откат на прошлую версию образа (та, что работала до последнего ./deploy/update.sh).
#   ./deploy/rollback.sh
set -euo pipefail
source "$(dirname "$0")/_common.sh"

docker image inspect studyhelper:previous >/dev/null 2>&1 || fail "Прошлой версии нет (образ studyhelper:previous не найден)."

cur_seed="$(seed_of_image studyhelper:latest)"
prev_seed="$(seed_of_image studyhelper:previous)"
if [ "$cur_seed" != "$prev_seed" ]; then
  confirm "ВНИМАНИЕ: версия демо-данных у прошлой версии другая ($prev_seed, сейчас $cur_seed). Она при запуске ПЕРЕСОЗДАСТ базу. Данные из копии, сделанной перед обновлением, можно вернуть командой ./deploy/restore.sh после отката."
else
  confirm "Откат на прошлую версию. Данные в базе не меняются."
fi

if app_running; then ./deploy/backup.sh before-rollback; fi
docker tag studyhelper:latest studyhelper:failed
docker tag studyhelper:previous studyhelper:latest
docker compose up -d --no-build
wait_healthy
echo "Откат выполнен: работает прошлая версия."
