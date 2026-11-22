#!/usr/bin/env bash
# Выкладка новой версии: копия базы, сборка, запуск, проверка. Данные в томе не трогаются.
# Перед запуском: новые файлы проекта уже лежат в этой папке (см. DEPLOY.md, «Обновление»).
#   ./deploy/update.sh
set -euo pipefail
source "$(dirname "$0")/_common.sh"

say "Шаг 1/5. Проверка настроек (.env)"
./deploy/preflight.sh

say "Шаг 2/5. Копия базы перед обновлением"
if app_running; then
  ./deploy/backup.sh before-update
  old_seed="$(docker compose exec -T app sh -c "grep -o 'SEED_VERSION = \"[0-9]*\"' scripts/seed.ts" | grep -o '[0-9]\+' | head -n1 || true)"
else
  echo "Контейнер не запущен (первая выкладка?), копию пропускаю."
  old_seed=""
fi

say "Шаг 3/5. Версия демо-данных"
new_seed="$(seed_of_file scripts/seed.ts)"
echo "было: ${old_seed:-нет}, станет: $new_seed"
if [ -n "$old_seed" ] && [ "$old_seed" != "$new_seed" ]; then
  confirm "ВНИМАНИЕ: версия демо-данных меняется ($old_seed → $new_seed). При запуске новой версии база будет ПЕРЕСОЗДАНА с нуля, все изменения в ней пропадут. Копия базы только что сделана."
fi

say "Шаг 4/5. Сборка новой версии"
if docker image inspect studyhelper:latest >/dev/null 2>&1; then
  docker tag studyhelper:latest studyhelper:previous   # по этому тегу работает откат
fi
docker compose build

say "Шаг 5/5. Запуск"
docker compose up -d --no-build
if ! wait_healthy; then
  echo "Откат на прошлую версию:  ./deploy/rollback.sh" >&2
  exit 1
fi
docker image prune -f >/dev/null   # удаляет только «висячие» образы без имени
echo "Обновление завершено. Пройдите короткую проверку из deploy/CHECKLIST.md (раздел «После обновления»)."
