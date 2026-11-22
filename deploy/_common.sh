#!/usr/bin/env bash
# Общие функции для скриптов deploy/. Сам по себе не запускается.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say()  { printf '\n%s\n' "$*"; }
fail() { printf '\nОШИБКА: %s\n' "$*" >&2; exit 1; }

# Ждёт, пока контейнер станет healthy (до 120 секунд)
wait_healthy() {
  local i status
  for i in $(seq 1 60); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' studyhelper 2>/dev/null || echo missing)"
    case "$status" in
      healthy) echo "Сайт отвечает (healthy)."; return 0 ;;
      unhealthy) break ;;
    esac
    sleep 2
  done
  echo "Сайт не стал healthy (статус: ${status:-неизвестен})." >&2
  echo "Пришлите вывод:  docker compose ps   и   docker compose logs --tail 100" >&2
  return 1
}

# Просит ввести слово ДА; любой другой ответ отменяет действие
confirm() {
  local answer
  printf '%s\nВведите ДА, чтобы продолжить: ' "$1"
  read -r answer
  [ "$answer" = "ДА" ] || fail "Отменено, ничего не изменено."
}

# Версия демо-данных (SEED_VERSION): если она в новом образе выше, при запуске база будет пересоздана
seed_of_file()  { grep -o 'SEED_VERSION = "[0-9]*"' "$1" | grep -o '[0-9]\+' | head -n1; }
seed_of_image() { docker run --rm --network none --entrypoint sh "$1" -c "grep -o 'SEED_VERSION = \"[0-9]*\"' scripts/seed.ts" | grep -o '[0-9]\+' | head -n1; }
app_running()   { [ -n "$(docker compose ps --status running -q app 2>/dev/null)" ]; }
